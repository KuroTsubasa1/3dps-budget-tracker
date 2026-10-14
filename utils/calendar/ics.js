// The private calendar feed (RFC 5545) that the phone's Calendar subscribes to
import { dayKey, addDays, parseInstant } from './dates.js'
import { ACTIVE_STATUSES, lastDayOf } from './status.js'

const HOUR_MS = 3_600_000
const encoder = new TextEncoder()

// TEXT values escape backslash, semicolon, comma and line breaks
export const escapeText = value => String(value ?? '')
  .replace(/\\/g, '\\\\')
  .replace(/;/g, '\\;')
  .replace(/,/g, '\\,')
  .replace(/\r\n|\r|\n/g, '\\n')

// Lines longer than 75 octets continue after CRLF and a space (which counts towards the next 75);
// a UTF-8 character is never split
export function foldLine (line) {
  const parts = []
  let current = ''
  let size = 0
  for (const char of line) {
    const bytes = encoder.encode(char).length
    if (size + bytes > (parts.length ? 74 : 75)) {
      parts.push(current)
      current = ''
      size = 0
    }
    current += char
    size += bytes
  }
  parts.push(current)
  return parts.join('\r\n ')
}

const dateValue = key => key.replace(/-/g, '')
const utcValue = date => date.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '')
const byStart = (a, b) => (dayKey(a.starts_on) || '9999').localeCompare(dayKey(b.starts_on) || '9999') || String(a.id).localeCompare(String(b.id))

// Interested, applied and booked conventions as all-day events (DTEND is the day after the last day),
// their application deadlines as all-day events and their setup as a one-hour timed event
export function calendarFeed (conventions, { now = new Date() } = {}) {
  const stamp = utcValue(now)
  const lines = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//Akinai//Convention calendar//EN',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    'X-WR-CALNAME:Akinai conventions'
  ]
  const event = (uid, fields) => lines.push('BEGIN:VEVENT', `UID:${uid}`, `DTSTAMP:${stamp}`, ...fields, 'END:VEVENT')

  for (const convention of conventions.filter(item => ACTIVE_STATUSES.includes(item.status)).sort(byStart)) {
    const location = [convention.venue, convention.city].filter(Boolean).join(', ')
    const place = [convention.hall, convention.table ? `Table ${convention.table}` : ''].filter(Boolean).join(' · ')
    const where = location ? [`LOCATION:${escapeText(location)}`] : []
    const start = dayKey(convention.starts_on)
    if (start) {
      const last = lastDayOf(convention) < start ? start : lastDayOf(convention)
      event(`${convention.id}-event@akinai`, [
        `DTSTART;VALUE=DATE:${dateValue(start)}`,
        `DTEND;VALUE=DATE:${dateValue(addDays(last, 1))}`,
        `SUMMARY:${escapeText(`${convention.name} (${convention.status})`)}`,
        ...where,
        ...(place ? [`DESCRIPTION:${escapeText(place)}`] : [])
      ])
    }
    const close = dayKey(convention.applications_close)
    if (close) {
      event(`${convention.id}-deadline@akinai`, [
        `DTSTART;VALUE=DATE:${dateValue(close)}`,
        `DTEND;VALUE=DATE:${dateValue(addDays(close, 1))}`,
        `SUMMARY:${escapeText(`Applications close: ${convention.name}`)}`
      ])
    }
    const setup = parseInstant(convention.setup_at)
    if (setup) {
      event(`${convention.id}-setup@akinai`, [
        `DTSTART:${utcValue(setup)}`,
        `DTEND:${utcValue(new Date(setup.getTime() + HOUR_MS))}`,
        `SUMMARY:${escapeText(`Setup: ${convention.name}`)}`,
        ...where,
        ...(place ? [`DESCRIPTION:${escapeText(place)}`] : [])
      ])
    }
  }
  lines.push('END:VCALENDAR')
  return `${lines.map(foldLine).join('\r\n')}\r\n`
}
