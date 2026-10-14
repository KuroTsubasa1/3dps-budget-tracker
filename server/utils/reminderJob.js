// The reminder job: every 5 minutes it sends the due reminders and records them. The store is the
// notifier's PocketBase client (or a fake in the tests), `send(subscription, message)` sends one push.
import { dueReminders, markFor } from '../../utils/calendar/reminders.js'
import { messageFor } from '../../utils/calendar/messages.js'
import { isPushEndpointAllowed } from './access.js'
import { pushHost, pushServiceName } from '../../utils/pushHosts.js'

export const REMINDER_INTERVAL_MS = 5 * 60_000
// The push service drops a message it cannot deliver within a day
export const PUSH_TTL_S = 24 * 3600
// A push service that does not answer within this time counts as unreachable
export const PUSH_TIMEOUT_MS = 30_000
// One run may take this long at most, so a hung run cannot block the later ones
export const RUN_CAP_MS = 4 * 60_000
// What Settings → Notifications → Send test notification shows
export const TEST_MESSAGE = { title: 'Akinai', body: 'Notifications work on this device', url: '/settings#notifications' }

// A device the push service no longer knows is deleted
const isGone = error => error?.statusCode === 404 || error?.statusCode === 410

// What the log and the status line say about one device: its push service's host and that service's
// answer ('blocked' for an address that is not a push service, 'no answer' when none came). Never the
// endpoint's path, its keys or an error message, which may quote them.
export const deviceProblem = (endpoint, error = null) => ({
  host: pushHost(endpoint),
  status: error ? (error.statusCode ? String(error.statusCode) : 'no answer') : 'blocked'
})

// Deleting a device that is already deleted is fine
export async function forgetSubscription (store, id) {
  try {
    await store.deleteSubscription(id)
  } catch (error) {
    if (error?.status !== 404) throw error
  }
}

async function forget ({ store, subscription, subscriptions, summary, problem }) {
  await forgetSubscription(store, subscription.id)
  subscriptions.splice(subscriptions.indexOf(subscription), 1)
  summary.removed++
  summary.removals.push(problem)
}

// Sends one message to every device: 'sent' when at least one got it, 'failed' when one could not be
// reached (it is tried again next run), 'waiting' when there was no device left to send to. A device whose
// push service answers 404 or 410, or whose address is not a push service, is deleted.
async function deliver ({ store, send, subscriptions, message, summary }) {
  let delivered = 0
  let failed = 0
  for (const subscription of [...subscriptions]) {
    try {
      if (!isPushEndpointAllowed(subscription.endpoint)) {
        await forget({ store, subscription, subscriptions, summary, problem: deviceProblem(subscription.endpoint) })
        continue
      }
      await send(subscription, message)
      delivered++
    } catch (error) {
      if (isGone(error)) {
        try {
          await forget({ store, subscription, subscriptions, summary, problem: deviceProblem(subscription.endpoint, error) })
        } catch (deleteError) {
          failed++
          summary.stateErrors.push(deleteError?.message || String(deleteError))
        }
      } else {
        failed++
        summary.errors.push(deviceProblem(subscription.endpoint, error))
      }
    }
  }
  if (delivered > 0) return 'sent'
  return failed > 0 ? 'failed' : 'waiting'
}

// Returns { sent, skipped, missed, failed, waiting, removed, removals, errors, stateErrors }:
// - `waiting` reminders found no device (none registered, or every one turned out gone) and stay unsent;
// - `failed` reminders could not reach a device and stay unsent;
// - `removals` and `errors` are the devices deleted and the devices that could not be reached ({ host, status });
// - `stateErrors` are PocketBase failures (deleting a device, saving the marks).
// An unsent reminder is tried again on every run until it is 24 hours late and counts as missed.
// The marks of a convention are written right after its pushes, so a failed write for one convention
// never makes the others go out twice.
export async function runReminderJob ({ store, send, now = new Date() }) {
  const summary = { sent: 0, skipped: 0, missed: 0, failed: 0, waiting: 0, removed: 0, removals: [], errors: [], stateErrors: [] }
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
        const outcome = await deliver({ store, send, subscriptions, message, summary })
        if (outcome !== 'sent') {
          summary[outcome]++
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

const listed = problems => [...new Set(problems.map(({ status, host }) => `${status} ${host}`))].join(', ')

// The run's line in the server log, or null for a run that sent, removed, failed and left waiting nothing:
// "[reminders] sent 1, removed 1 (410 web.push.apple.com), failed 0"
export function runLogLine (summary) {
  const failed = summary.errors.length
  if (!summary.sent && !summary.removed && !failed && !summary.waiting && !summary.missed) return null
  const parts = [
    `sent ${summary.sent}`,
    `removed ${summary.removed}${summary.removed ? ` (${listed(summary.removals)})` : ''}`,
    `failed ${failed}${failed ? ` (${listed(summary.errors)})` : ''}`
  ]
  if (summary.waiting) parts.push(`waiting ${summary.waiting} (no device)`)
  if (summary.missed) parts.push(`missed ${summary.missed}`)
  return `[reminders] ${parts.join(', ')}`
}

// The run's delivery problem for the status line, or null: a device that could not be reached comes first
export function deliveryProblem (summary) {
  const failure = summary.errors.at(-1)
  if (failure) {
    const service = pushServiceName(failure.host)
    return failure.status === 'no answer' ? `${service} did not answer for a device` : `${service} answered ${failure.status} for a device`
  }
  const removal = summary.removals.at(-1)
  if (!removal) return null
  if (removal.status === 'blocked') return 'A device without a supported push service was removed'
  return `${pushServiceName(removal.host)} answered ${removal.status} for a device; it was removed`
}

// What Settings shows: the last finished run, the error of the latest run if it failed, and the last
// delivery problem until a later run delivers without one
export const reminderStatus = { lastRun: null, lastError: null, lastProblem: null }

// Runs the job, never two at once, and keeps the status. Every run that sends, removes, fails or waits
// writes one line to the log; a failure is logged and kept for the status line, and the next run simply
// tries again.
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
        const problem = deliveryProblem(summary)
        if (problem) status.lastProblem = problem
        else if (summary.sent) status.lastProblem = null
        status.lastError = summary.stateErrors.length ? `Could not save reminder state: ${summary.stateErrors[0]}` : null
        const line = runLogLine(summary)
        if (line) log.info(line)
        if (status.lastError) log.error(`[reminders] ${status.lastError}`)
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
