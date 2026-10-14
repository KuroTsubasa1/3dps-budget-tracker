// The reminder job: every 5 minutes it sends the due reminders and records them. The store is the
// notifier's PocketBase client (or a fake in the tests), `send(subscription, message)` sends one push.
import { dueReminders, markFor } from '../../utils/calendar/reminders.js'
import { messageFor } from '../../utils/calendar/messages.js'
import { isPushEndpointAllowed } from './access.js'

export const REMINDER_INTERVAL_MS = 5 * 60_000
// The push service drops a message it cannot deliver within a day
export const PUSH_TTL_S = 24 * 3600
// A push service that does not answer within this time counts as unreachable
export const PUSH_TIMEOUT_MS = 30_000
// One run may take this long at most, so a hung run cannot block the later ones
export const RUN_CAP_MS = 4 * 60_000
// What Settings → Notifications → Send test notification shows
export const TEST_MESSAGE = { title: 'Akinai', body: 'Notifications work on this device', url: '/settings#notifications' }

// A device the push service no longer knows, or one whose endpoint is not a public https address: its
// subscription is deleted
const isGone = error => error?.statusCode === 404 || error?.statusCode === 410

// Deleting a device that is already deleted is fine
export async function forgetSubscription (store, id) {
  try {
    await store.deleteSubscription(id)
  } catch (error) {
    if (error?.status !== 404) throw error
  }
}

async function forget ({ store, subscription, subscriptions, summary }) {
  await forgetSubscription(store, subscription.id)
  subscriptions.splice(subscriptions.indexOf(subscription), 1)
  summary.removed++
}

// Sends one message to every device. A device that is gone is deleted; any other failure counts as
// not delivered. With no devices at all there is nobody to wait for, so the reminder counts as sent.
async function deliver ({ store, send, subscriptions, message, summary }) {
  let delivered = 0
  let failed = 0
  for (const subscription of [...subscriptions]) {
    try {
      if (!isPushEndpointAllowed(subscription.endpoint)) {
        await forget({ store, subscription, subscriptions, summary })
        continue
      }
      await send(subscription, message)
      delivered++
    } catch (error) {
      if (isGone(error)) {
        try {
          await forget({ store, subscription, subscriptions, summary })
        } catch (deleteError) {
          failed++
          summary.stateErrors.push(deleteError?.message || String(deleteError))
        }
      } else {
        failed++
        summary.errors.push(error?.message || String(error))
      }
    }
  }
  return delivered > 0 || failed === 0
}

// Returns { sent, skipped, missed, failed, removed, errors, stateErrors }: `errors` are devices that could not
// be reached, `stateErrors` are PocketBase failures (deleting a device, saving the marks). A reminder that could not reach any device
// stays unsent and is tried again on the next run (until it is 24 hours late and counts as missed).
// The marks of a convention are written right after its pushes, so a failed write for one convention
// never makes the others go out twice.
export async function runReminderJob ({ store, send, now = new Date() }) {
  const summary = { sent: 0, skipped: 0, missed: 0, failed: 0, removed: 0, errors: [], stateErrors: [] }
  const due = dueReminders(await store.listConventions(), now)
  if (!due.length) return summary
  const sending = due.filter(item => item.action === 'send')
  const articles = sending.some(item => item.reminder.kind === 'stock') ? await store.listActiveArticles() : []
  const subscriptions = sending.length ? await store.listSubscriptions() : []

  const byConvention = new Map()
  for (const item of due) byConvention.set(item.convention.id, [...(byConvention.get(item.convention.id) ?? []), item])
  for (const [id, items] of byConvention) {
    const marks = []
    for (const { convention, reminder, action } of items) {
      if (action === 'send') {
        const message = messageFor({ convention, reminder, articles, now })
        if (!await deliver({ store, send, subscriptions, message, summary })) {
          summary.failed++
          continue
        }
        summary.sent++
      } else {
        summary[action === 'skip' ? 'skipped' : 'missed']++
      }
      marks.push({ id: reminder.id, at: reminder.at, ...markFor(action, now) })
    }
    if (!marks.length) continue
    try {
      await store.markReminders(id, marks)
    } catch (error) {
      summary.stateErrors.push(error?.message || String(error))
    }
  }
  return summary
}

// What Settings shows: the last successful run and the error of the latest run, if it failed
export const reminderStatus = { lastRun: null, lastError: null }

// Runs the job, never two at once, and keeps the status. A failure is logged and kept for the status line;
// the next run simply tries again.
export function createReminderRunner ({ store, send, status = reminderStatus, log = console, capMs = RUN_CAP_MS }) {
  let running = null
  const run = (now = new Date()) => {
    if (running) return running
    let timer
    const cap = new Promise((resolve, reject) => {
      timer = setTimeout(() => reject(new Error('The reminder run took too long')), capMs)
    })
    running = Promise.race([runReminderJob({ store, send, now }), cap])
      .then((summary) => {
        status.lastRun = now.toISOString()
        const problems = [
          ...summary.errors.slice(0, 1).map(message => `Could not reach a device: ${message}`),
          ...summary.stateErrors.slice(0, 1).map(message => `Could not save reminder state: ${message}`)
        ]
        status.lastError = problems.length ? problems.join('; ') : null
        if (problems.length) log.error(`[reminders] ${status.lastError}`)
        return summary
      })
      .catch((error) => {
        status.lastError = error?.message || String(error)
        log.error(`[reminders] ${status.lastError}`)
        return null
      })
      .finally(() => {
        clearTimeout(timer)
        running = null
      })
    return running
  }
  return { run, status }
}

// web-push behind the job's `send`: VAPID details per call, so tests can pass a fake module
export const createPushSender = ({ webpush, publicKey, privateKey, subject }) =>
  (subscription, message) => webpush.sendNotification(
    { endpoint: subscription.endpoint, keys: subscription.keys },
    JSON.stringify(message),
    { vapidDetails: { subject, publicKey, privateKey }, TTL: PUSH_TTL_S, timeout: PUSH_TIMEOUT_MS }
  )
