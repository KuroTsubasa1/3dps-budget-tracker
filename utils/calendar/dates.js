// Calendar days and local times for the convention calendar. See docs/superpowers/specs/2026-10-14-convention-calendar-design.md
// A date-only field ('2026-10-30', or PocketBase's '2026-10-30 00:00:00.000Z') is a calendar day, never an instant.
// Times are local: the device's on the phone, the server's TZ (Europe/Berlin) in the reminder job and the feed.
export const DAY_MS = 86_400_000

const DAY = /^(\d{4})-(\d{2})-(\d{2})/
const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
const MONTH_NAMES = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December']

const pad = value => String(value).padStart(2, '0')
const partsOf = key => key.split('-').map(Number)

// 'YYYY-MM-DD' of a date field, or '' when it is unset
export const dayKey = value => DAY.exec(String(value ?? ''))?.[0] ?? ''

// The local calendar day of an instant
export const localDayKey = (date = new Date()) => `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`

// Local time hours:minutes on the day `offsetDays` after `key`. Built from local parts, so 09:00 stays 09:00 across a DST change
export const atLocal = (key, offsetDays, hours, minutes = 0) => {
  const [year, month, day] = partsOf(key)
  return new Date(year, month - 1, day + offsetDays, hours, minutes)
}

// Calendar arithmetic in UTC, so it never depends on the time zone
export const addDays = (key, days) => {
  const [year, month, day] = partsOf(key)
  const date = new Date(Date.UTC(year, month - 1, day + days))
  return `${date.getUTCFullYear()}-${pad(date.getUTCMonth() + 1)}-${pad(date.getUTCDate())}`
}

// Whole days from one day to another; negative when `to` is earlier
export const daysBetween = (from, to) => {
  const [y1, m1, d1] = partsOf(from)
  const [y2, m2, d2] = partsOf(to)
  return Math.round((Date.UTC(y2, m2 - 1, d2) - Date.UTC(y1, m1 - 1, d1)) / DAY_MS)
}

// Monday 0 … Sunday 6
export const weekdayIndex = (key) => {
  const [year, month, day] = partsOf(key)
  return (new Date(Date.UTC(year, month - 1, day)).getUTCDay() + 6) % 7
}

// PocketBase writes 'YYYY-MM-DD HH:MM:SS.sssZ', the app ISO; null when unset or unreadable
export const parseInstant = (value) => {
  if (!value) return null
  const date = new Date(String(value).replace(' ', 'T'))
  return Number.isNaN(date.getTime()) ? null : date
}

// 'Wed 21 Oct'
export const formatDay = (key) => {
  const [year, month, day] = partsOf(key)
  return `${WEEKDAYS[new Date(Date.UTC(year, month - 1, day)).getUTCDay()]} ${day} ${MONTHS[month - 1]}`
}

// '09:00' in local time
export const formatTime = date => `${pad(date.getHours())}:${pad(date.getMinutes())}`

// 'Wed 21 Oct, 09:00' in local time
export const formatMoment = date => `${formatDay(localDayKey(date))}, ${formatTime(date)}`

// 'November 2026'; month is 0-based like Date
export const formatMonth = (year, month) => `${MONTH_NAMES[month]} ${year}`

// 'today', 'tomorrow', 'in 5 days'
export const inDays = days => (days === 0 ? 'today' : days === 1 ? 'tomorrow' : `in ${days} days`)
