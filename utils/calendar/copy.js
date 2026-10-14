// The calendar's saved copy on this device, for reading it offline. It holds the conventions' own fields
// that the calendar shows and nothing else: no PocketBase metadata, no transaction ids, nothing about push.
// Logging out (and "Clear All Local Data") deletes it.
export const CALENDAR_COPY_KEY = 'akinai-conventions'

const FIELDS = [
  'id', 'name', 'city', 'venue', 'hall', 'table', 'starts_on', 'ends_on', 'status',
  'applications_open', 'applications_close', 'results_expected', 'setup_at', 'stand_fee', 'fee_paid_at', 'reminders'
]

export const copyOf = convention => Object.fromEntries(FIELDS.map(field => [field, convention[field] ?? '']))

// A full or blocked storage only costs the offline copy
export function writeCopy (storage, conventions, savedAt = new Date()) {
  try {
    storage.setItem(CALENDAR_COPY_KEY, JSON.stringify({ savedAt: savedAt.toISOString(), items: conventions.map(copyOf) }))
  } catch {}
}

export function readCopy (storage) {
  try {
    const copy = JSON.parse(storage.getItem(CALENDAR_COPY_KEY) || 'null')
    return Array.isArray(copy?.items) && copy.savedAt ? copy : null
  } catch {
    return null
  }
}

export function forgetCopy (storage) {
  try {
    storage.removeItem(CALENDAR_COPY_KEY)
  } catch {}
}
