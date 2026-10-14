// The reminder job: every 5 minutes it sends the due reminders and records them. The store is the
// notifier's PocketBase client (or a fake in the tests), `send(subscription, message)` sends one push.
import { dueReminders, markFor } from '../../utils/calendar/reminders.js'
import { messageFor } from '../../utils/calendar/messages.js'

export const REMINDER_INTERVAL_MS = 5 * 60_000
// The push service drops a message it cannot deliver within a day
export const PUSH_TTL_S = 24 * 3600
// What Settings → Notifications → Send test notification shows
export const TEST_MESSAGE = { title: 'Akinai', body: 'Notifications work on this device', url: '/settings#notifications' }

// A device the push service no longer knows: its subscription is deleted
const isGone = error => error?.statusCode === 404 || error?.statusCode === 410

// Sends one message to every device. A device that is gone is deleted; any other failure counts as
// not delivered. With no devices at all there is nobody to wait for, so the reminder counts as sent.
async function deliver ({ store, send, subscriptions, message, summary, errors }) {
  let delivered = 0
  let failed = 0
  for (const subscription of [...subscriptions]) {
    try {
      await send(subscription, message)
      delivered++
    } catch (error) {
      if (isGone(error)) {
        await store.deleteSubscription(subscription.id)
        subscriptions.splice(subscriptions.indexOf(subscription), 1)
        summary.removed++
      } else {
        failed++
        errors.push(error?.message || String(error))
      }
    }
  }
  return delivered > 0 || failed === 0
}

// Returns { sent, skipped, missed, failed, removed, errors }. A reminder that could not reach any device
// stays unsent and is tried again on the next run (until it is 24 hours late and counts as missed).
export async function runReminderJob ({ store, send, now = new Date() }) {
  const summary = { sent: 0, skipped: 0, missed: 0, failed: 0, removed: 0, errors: [] }
  const due = dueReminders(await store.listConventions(), now)
  if (!due.length) return summary
  const sending = due.filter(item => item.action === 'send')
  const articles = sending.some(item => item.reminder.kind === 'stock') ? await store.listActiveArticles() : []
  const subscriptions = sending.length ? await store.listSubscriptions() : []

  const marks = new Map()
  for (const { convention, reminder, action } of due) {
    if (action === 'send') {
      const message = messageFor({ convention, reminder, articles, now })
      if (!await deliver({ store, send, subscriptions, message, summary, errors: summary.errors })) {
        summary.failed++
        continue
      }
      summary.sent++
    } else {
      summary[action === 'skip' ? 'skipped' : 'missed']++
    }
    marks.set(convention.id, [...(marks.get(convention.id) ?? []), { id: reminder.id, at: reminder.at, ...markFor(action, now) }])
  }
  for (const [id, list] of marks) await store.markReminders(id, list)
  return summary
}

// What Settings shows: the last successful run and the error of the latest run, if it failed
export const reminderStatus = { lastRun: null, lastError: null }

// Runs the job, never two at once, and keeps the status. A failure is logged and kept for the status line;
// the next run simply tries again.
export function createReminderRunner ({ store, send, status = reminderStatus, log = console }) {
  let running = null
  const run = (now = new Date()) => {
    running ??= runReminderJob({ store, send, now })
      .then((summary) => {
        status.lastRun = now.toISOString()
        status.lastError = summary.errors.length ? `Could not reach a device: ${summary.errors[0]}` : null
        if (summary.errors.length) log.error(`[reminders] ${status.lastError}`)
        return summary
      })
      .catch((error) => {
        status.lastError = error?.message || String(error)
        log.error(`[reminders] ${status.lastError}`)
        return null
      })
      .finally(() => { running = null })
    return running
  }
  return { run, status }
}

// web-push behind the job's `send`: VAPID details per call, so tests can pass a fake module
export const createPushSender = ({ webpush, publicKey, privateKey, subject }) =>
  (subscription, message) => webpush.sendNotification(
    { endpoint: subscription.endpoint, keys: subscription.keys },
    JSON.stringify(message),
    { vapidDetails: { subject, publicKey, privateKey }, TTL: PUSH_TTL_S }
  )
