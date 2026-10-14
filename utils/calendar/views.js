// What the calendar page and the dashboard show: the Upcoming list, the month grid and Next up
import { dayKey, localDayKey, daysBetween, addDays, weekdayIndex, formatMonth } from './dates.js'
import { ACTIVE_STATUSES, isDone, lastDayOf, displayStatus } from './status.js'

export { displayStatus }

const pad = value => String(value).padStart(2, '0')
const startOf = convention => dayKey(convention.starts_on)
// The last day, never before the first (a typo in the dates must not hide the convention)
const endOf = (convention) => {
  const last = lastDayOf(convention)
  return last < startOf(convention) ? startOf(convention) : last
}
const byName = (a, b) => String(a.name).localeCompare(String(b.name))
// Undated conventions sort last
const byStart = (a, b) => (startOf(a) || '9999').localeCompare(startOf(b) || '9999') || byName(a, b)
const isPast = (convention, now) => isDone(convention, now) || convention.status === 'rejected' || convention.status === 'cancelled'

// openApplications: interested conventions whose applications close today or later, soonest first, with the days left.
// byMonth: every other convention that is not past (applied, booked, and interested ones without an open
// deadline), grouped by the month they start in; undated ones last under 'Dates not set'.
// past: done, rejected and cancelled conventions, latest first.
export function upcoming (conventions, now = new Date()) {
  const today = localDayKey(now)
  const openApplications = conventions
    .filter(convention => convention.status === 'interested' && dayKey(convention.applications_close) >= today)
    .map(convention => ({ convention, daysLeft: daysBetween(today, dayKey(convention.applications_close)) }))
    .sort((a, b) => a.daysLeft - b.daysLeft || byName(a.convention, b.convention))
  const open = new Set(openApplications.map(item => item.convention.id))

  const months = new Map()
  for (const convention of conventions.filter(item => !open.has(item.id) && !isPast(item, now)).sort(byStart)) {
    const key = startOf(convention).slice(0, 7)
    if (!months.has(key)) months.set(key, [])
    months.get(key).push(convention)
  }
  const byMonth = [...months].map(([key, list]) => ({
    key: key || 'undated',
    label: key ? formatMonth(Number(key.slice(0, 4)), Number(key.slice(5, 7)) - 1) : 'Dates not set',
    conventions: list
  }))

  const past = conventions
    .filter(convention => isPast(convention, now))
    .sort((a, b) => (lastDayOf(b) || '').localeCompare(lastDayOf(a) || '') || byName(a, b))
  return { openApplications, byMonth, past }
}

// The weeks (Monday first) that cover the month; month is 0-based like Date. Each day has the conventions
// running on it as bars and the application deadlines on it as dots. Rejected and cancelled ones are left out.
export function monthGrid (year, month, conventions) {
  const first = `${year}-${pad(month + 1)}-01`
  const last = `${year}-${pad(month + 1)}-${pad(new Date(Date.UTC(year, month + 1, 0)).getUTCDate())}`
  const shown = conventions.filter(convention => ACTIVE_STATUSES.includes(convention.status)).sort(byStart)
  const weeks = []
  for (let day = addDays(first, -weekdayIndex(first)); day <= addDays(last, 6 - weekdayIndex(last)); day = addDays(day, 1)) {
    if (weekdayIndex(day) === 0) weeks.push([])
    weeks[weeks.length - 1].push({
      date: day,
      day: Number(day.slice(8)),
      inMonth: day.slice(0, 7) === first.slice(0, 7),
      bars: shown
        .filter(convention => startOf(convention) && startOf(convention) <= day && day <= endOf(convention))
        .map(convention => ({ id: convention.id, name: convention.name, status: convention.status, starts: day === startOf(convention), ends: day === endOf(convention) })),
      dots: shown
        .filter(convention => dayKey(convention.applications_close) === day)
        .map(convention => ({ id: convention.id, name: convention.name }))
    })
  }
  return weeks
}

// The dashboard card: the next open application deadline and the next (or running) booked convention
export function nextUp (conventions, now = new Date()) {
  const today = localDayKey(now)
  const [deadline = null] = upcoming(conventions, now).openApplications
  const [booked = null] = conventions
    .filter(convention => convention.status === 'booked' && startOf(convention) && endOf(convention) >= today)
    .map(convention => ({ convention, daysLeft: Math.max(0, daysBetween(today, startOf(convention))) }))
    .sort((a, b) => a.daysLeft - b.daysLeft || byName(a.convention, b.convention))
  return { deadline, booked }
}
