// The convention sheet's form: record ↔ inputs, and the checks before saving
import { dayKey, localDayKey, parseInstant, formatTime } from './dates.js'

const TEXT_FIELDS = ['name', 'city', 'venue', 'hall', 'table']
const DATE_FIELDS = ['starts_on', 'ends_on', 'applications_open', 'applications_close', 'results_expected']

// 'YYYY-MM-DDTHH:MM' in local time for <input type="datetime-local">, '' when unset
export const toLocalInput = (value) => {
  const date = parseInstant(value)
  return date ? `${localDayKey(date)}T${formatTime(date)}` : ''
}

// A datetime-local value is local time; stored as ISO ('' when empty or unreadable)
export const fromLocalInput = (value) => {
  const date = value ? new Date(value) : null
  return date && !Number.isNaN(date.getTime()) ? date.toISOString() : ''
}

// '45,50' or '45.50' → 45.5; empty → 0 (PocketBase stores an empty number as 0); anything else → NaN
export const parseFee = (text) => {
  const value = String(text ?? '').trim().replace(',', '.')
  if (!value) return 0
  return /^\d+(\.\d{1,2})?$/.test(value) ? Number(value) : NaN
}

export const blankForm = () => ({
  ...Object.fromEntries([...TEXT_FIELDS, ...DATE_FIELDS].map(field => [field, ''])),
  status: 'interested',
  setup_at: '',
  stand_fee: ''
})

export const formFrom = convention => ({
  ...Object.fromEntries(TEXT_FIELDS.map(field => [field, convention[field] ?? ''])),
  ...Object.fromEntries(DATE_FIELDS.map(field => [field, dayKey(convention[field])])),
  status: convention.status,
  setup_at: toLocalInput(convention.setup_at),
  stand_fee: Number(convention.stand_fee) > 0 ? String(convention.stand_fee).replace('.', ',') : ''
})

// The record fields to save (reminders are added by the caller)
export const fieldsFrom = form => ({
  ...Object.fromEntries(TEXT_FIELDS.map(field => [field, String(form[field] ?? '').trim()])),
  ...Object.fromEntries(DATE_FIELDS.map(field => [field, form[field] || ''])),
  status: form.status,
  setup_at: fromLocalInput(form.setup_at),
  stand_fee: parseFee(form.stand_fee)
})

// '' when the form can be saved, else the message to show
export function validateConvention (form) {
  if (!String(form.name ?? '').trim()) return 'Enter a name'
  if (form.starts_on && form.ends_on && form.ends_on < form.starts_on) return 'The end is before the start'
  if (form.status === 'booked' && (!form.starts_on || !form.ends_on)) return 'Add the start and end dates before booking'
  if (form.applications_open && form.applications_close && form.applications_close < form.applications_open) return 'Applications close before they open'
  if (Number.isNaN(parseFee(form.stand_fee))) return 'Enter the stand fee as an amount, like 45 or 45,50'
  return ''
}

// A reminder's time as date and time inputs (local), and back
export const splitMoment = (iso) => {
  const date = parseInstant(iso)
  return date ? { date: localDayKey(date), time: formatTime(date) } : { date: '', time: '' }
}
export const joinMoment = (date, time) => new Date(`${date}T${time}`).toISOString()

export function validateReminder ({ date, time, text, custom }) {
  if (!date || !time) return 'Pick a date and a time'
  if (custom && !String(text ?? '').trim()) return 'Enter what to remind you of'
  return ''
}
