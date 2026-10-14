// Convention reminders: the defaults, keeping them in step with the dates, and which ones are due.
// A reminder: { id, kind, at (ISO), text?, auto, sent_at?, skipped?, missed?, removed? }
import { dayKey, atLocal, parseInstant } from './dates.js'
import { isDone } from './status.js'

export const KIND_LABEL = { deadline: 'Applications close', stock: 'Stock check', pack: 'Pack', setup: 'Setup', custom: 'Custom' }
// A reminder more than this late is recorded as missed and not sent
export const MISS_AFTER_MS = 24 * 3_600_000
const HOUR_MS = 3_600_000

// One slot per default reminder. Its id stays the same when its time moves, so a default the owner
// edited, removed or that was already sent is recognised and never comes back as a fresh copy.
const SLOTS = [
  { id: 'auto-deadline-7', kind: 'deadline', status: 'interested', rule: '7 days before applications close', at: c => fromDay(c.applications_close, -7, 9) },
  { id: 'auto-deadline-1', kind: 'deadline', status: 'interested', rule: '1 day before applications close', at: c => fromDay(c.applications_close, -1, 9) },
  { id: 'auto-stock', kind: 'stock', status: 'booked', rule: '14 days before the start', at: c => fromDay(c.starts_on, -14, 9) },
  { id: 'auto-pack', kind: 'pack', status: 'booked', rule: '2 days before the start', at: c => fromDay(c.starts_on, -2, 18) },
  { id: 'auto-setup', kind: 'setup', status: 'booked', rule: c => (parseInstant(c.setup_at) ? '1 hour before setup' : 'On the first day'), at: setupAt }
]

function fromDay (value, offsetDays, hours) {
  const key = dayKey(value)
  return key ? atLocal(key, offsetDays, hours) : null
}

function setupAt (convention) {
  const setup = parseInstant(convention.setup_at)
  return setup ? new Date(setup.getTime() - HOUR_MS) : fromDay(convention.starts_on, 0, 8)
}

const remindersOf = convention => (Array.isArray(convention?.reminders) ? convention.reminders : [])
const byTime = (a, b) => String(a.at).localeCompare(String(b.at)) || String(a.id).localeCompare(String(b.id))

// The defaults the convention's dates and status call for, in local time
export function defaultReminders (convention) {
  return SLOTS
    .filter(slot => slot.status === convention.status)
    .map(slot => ({ slot, at: slot.at(convention) }))
    .filter(({ at }) => at)
    .map(({ slot, at }) => ({ id: slot.id, kind: slot.kind, at: at.toISOString(), auto: true }))
}

// Sent, edited, custom and removed reminders stay as they are. Unsent defaults follow the dates and the status;
// a default whose time has already passed is only kept when it was already there with that time
// (the job may not have reached it yet), never added fresh.
export function syncReminders (convention, previous = [], now = new Date()) {
  const list = Array.isArray(previous) ? previous : []
  const kept = list.filter(reminder => reminder.sent_at || !reminder.auto)
  const taken = new Set(kept.map(reminder => reminder.id))
  const waiting = new Map(list.filter(reminder => reminder.auto && !reminder.sent_at).map(reminder => [reminder.id, reminder]))
  const fresh = defaultReminders(convention)
    .filter(reminder => !taken.has(reminder.id))
    .map(reminder => (waiting.get(reminder.id)?.at === reminder.at ? waiting.get(reminder.id) : reminder))
    .filter(reminder => waiting.get(reminder.id) === reminder || Date.parse(reminder.at) >= now.getTime())
  return [...kept, ...fresh].sort(byTime)
}

// Deadlines only while interested; stock, pack and setup only while booked and not over; custom ones unless rejected or cancelled
export function allowedFor (reminder, convention, now = new Date()) {
  if (reminder.removed) return false
  if (reminder.kind === 'deadline') return convention.status === 'interested'
  if (reminder.kind === 'custom') return convention.status !== 'rejected' && convention.status !== 'cancelled'
  return convention.status === 'booked' && !isDone(convention, now)
}

// Every unsent reminder whose time has come: send it, skip it (its status no longer allows it), or
// record it as missed (more than 24 hours late). Oldest first.
export function dueReminders (conventions, now = new Date()) {
  const due = []
  for (const convention of conventions) {
    for (const reminder of remindersOf(convention)) {
      if (reminder.sent_at || reminder.removed) continue
      const at = parseInstant(reminder.at)
      if (!at || at > now) continue
      const action = !allowedFor(reminder, convention, now) ? 'skip' : now - at > MISS_AFTER_MS ? 'miss' : 'send'
      due.push({ convention, reminder, action })
    }
  }
  return due.sort((a, b) => byTime(a.reminder, b.reminder))
}

// What the job writes for an action
export const markFor = (action, now = new Date()) => ({
  sent_at: now.toISOString(),
  ...(action === 'skip' ? { skipped: true } : {}),
  ...(action === 'miss' ? { missed: true } : {})
})

// Copies the sent marks of `marked` ([{ id, at, sent_at, skipped?, missed? }]) onto the unsent reminders
// with the same id and time. A reminder moved in the meantime is a new one and keeps waiting.
export function withSentMarks (reminders, marked) {
  const marks = new Map(marked.filter(mark => mark.sent_at).map(mark => [`${mark.id}|${mark.at}`, mark]))
  return reminders.map((reminder) => {
    const mark = !reminder.sent_at && marks.get(`${reminder.id}|${reminder.at}`)
    if (!mark) return reminder
    return {
      ...reminder,
      sent_at: mark.sent_at,
      ...(mark.skipped ? { skipped: true } : {}),
      ...(mark.missed ? { missed: true } : {})
    }
  })
}

// The owner's changes. An edited default loses `auto` and keeps its id; a removed default stays as a
// `removed` marker so it does not come back; a removed custom reminder is gone.
// Editing re-arms a reminder: its sent, skipped and missed marks are dropped so it goes out at the new time.
export const editReminder = (reminders, id, { at, text }) => reminders.map((reminder) => {
  if (reminder.id !== id) return reminder
  const { sent_at: _sent, skipped: _skipped, missed: _missed, ...rest } = reminder
  return { ...rest, at, auto: false, ...(reminder.kind === 'custom' && text !== undefined ? { text } : {}) }
})

export const removeReminder = (reminders, id) => reminders.flatMap((reminder) => {
  if (reminder.id !== id) return [reminder]
  return reminder.kind === 'custom' ? [] : [{ ...reminder, auto: false, removed: true }]
})

export const addReminder = (reminders, { id, at, text }) =>
  [...reminders, { id, kind: 'custom', at, text, auto: false }].sort(byTime)

// What the sheet lists: everything but removed markers
export const visibleReminders = reminders => reminders.filter(reminder => !reminder.removed)

// The rule shown next to a reminder
export function ruleOf (reminder, convention) {
  if (reminder.kind === 'custom') return 'Custom'
  const slot = SLOTS.find(item => item.id === reminder.id)
  if (!slot || !reminder.auto) return 'Edited'
  return typeof slot.rule === 'function' ? slot.rule(convention) : slot.rule
}

// 'Sent', 'Skipped', 'Missed' or ''
export const stateOf = reminder => (!reminder.sent_at ? '' : reminder.skipped ? 'Skipped' : reminder.missed ? 'Missed' : 'Sent')
