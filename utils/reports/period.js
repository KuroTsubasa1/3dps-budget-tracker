// Report periods in the device's local time. See docs/superpowers/specs/2026-10-14-reports-design.md
import { localDate } from '../transactions.js'
import { toDate } from './common.js'

export const PERIODS = [
  { value: 'today', label: 'Today' },
  { value: 'week', label: 'Week' },
  { value: 'month', label: 'Month' },
  { value: 'year', label: 'Year' },
  { value: 'custom', label: 'Custom' }
]

const DAY_MS = 86_400_000
const ISO_DAY = /^\d{4}-\d{2}-\d{2}$/

// Calendar arithmetic through the local constructor, so a daylight-saving change never shifts a day
export const addDays = (date, days) => new Date(date.getFullYear(), date.getMonth(), date.getDate() + days)
const midnight = date => addDays(date, 0)
const customDay = value => (ISO_DAY.test(String(value ?? '')) ? toDate(value) : null)

// { start, end } as local midnights, end exclusive. Weeks start on Monday. Custom takes { from, to }
// as 'YYYY-MM-DD' with `to` included; a missing day counts as today and a reversed range is swapped.
export function periodRange (kind, now = new Date(), custom = {}) {
  const today = midnight(now)
  if (kind === 'today') return { start: today, end: addDays(today, 1) }
  if (kind === 'week') {
    const start = addDays(today, -((today.getDay() + 6) % 7))
    return { start, end: addDays(start, 7) }
  }
  if (kind === 'month') {
    return { start: new Date(today.getFullYear(), today.getMonth(), 1), end: new Date(today.getFullYear(), today.getMonth() + 1, 1) }
  }
  if (kind === 'year') return { start: new Date(today.getFullYear(), 0, 1), end: new Date(today.getFullYear() + 1, 0, 1) }
  if (kind === 'custom') {
    const from = customDay(custom.from) ?? today
    const to = customDay(custom.to) ?? today
    const [first, last] = from <= to ? [from, to] : [to, from]
    return { start: first, end: addDays(last, 1) }
  }
  throw new Error(`Unknown period: ${kind}`)
}

// A day string, ISO time, PocketBase stamp or Date; unreadable values are outside every period
export function inPeriod (value, range) {
  const date = toDate(value)
  return !!date && date >= range.start && date < range.end
}

// Calendar days in the range, counted by date so a daylight-saving change does not matter
const dayNumber = date => Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()) / DAY_MS
export const daysIn = range => dayNumber(range.end) - dayNumber(range.start)

// Money buckets: months for a year or a custom range longer than 90 days, weeks otherwise
export const bucketFor = (kind, range) => (kind === 'year' || (kind === 'custom' && daysIn(range) > 90) ? 'month' : 'week')

// First and last day as 'YYYY-MM-DD', for file names
export const rangeDays = range => ({ first: localDate(range.start), last: localDate(addDays(range.end, -1)) })
