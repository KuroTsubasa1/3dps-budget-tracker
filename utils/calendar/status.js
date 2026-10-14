// Convention statuses. "Done" is derived: a booked convention whose last day has passed.
import { dayKey, localDayKey } from './dates.js'

export const STATUSES = ['interested', 'applied', 'booked', 'rejected', 'cancelled']
export const STATUS_LABEL = { interested: 'Interested', applied: 'Applied', booked: 'Booked', rejected: 'Rejected', cancelled: 'Cancelled' }
// Shown in the Upcoming list, the month grid and the feed; rejected and cancelled ones are history
export const ACTIVE_STATUSES = ['interested', 'applied', 'booked']

// The convention's last day: ends_on, or starts_on for a one-day event; '' without dates
export const lastDayOf = convention => dayKey(convention.ends_on) || dayKey(convention.starts_on)

export const isDone = (convention, now = new Date()) => {
  const last = lastDayOf(convention)
  return convention.status === 'booked' && !!last && last < localDayKey(now)
}

export const displayStatus = (convention, now = new Date()) =>
  isDone(convention, now) ? 'Done' : STATUS_LABEL[convention.status] ?? convention.status
