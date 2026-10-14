// Calendar date (YYYY-MM-DD) in the device's own time zone
export const localDate = (date = new Date()) =>
  `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`

// PocketBase stamps records 'YYYY-MM-DD HH:MM:SS.sssZ' in UTC
const createdAt = created => new Date(String(created).replace(' ', 'T'))
const createdDate = created => localDate(createdAt(created))

// Records carry the sale's own local date; older ones only have `created`
export const fromRecord = record => ({
  id: record.id,
  recordId: record.id,
  description: record.description,
  amount: Number(record.amount),
  notes: record.notes || '',
  date: record.date || createdDate(record.created)
})

const sameSale = (a, b) => a.description === b.description && a.amount === b.amount && a.date === b.date

// Old-app entries carry the UTC date of the sale, and a sale queued offline was created on the day it synced,
// so a legacy entry may match a record created up to this many days after the entry's date
export const LEGACY_MATCH_DAYS = 7
const DAY_MS = 86_400_000
const dayNumber = date => Date.parse(`${date}T00:00:00Z`) / DAY_MS

// Days from the entry's date to the closest date the record could carry, or null when none fits the window
const legacyDistance = (entry, record) => {
  if (record.description !== entry.description || Number(record.amount) !== Number(entry.amount)) return null
  const at = createdAt(record.created)
  const candidates = [record.date, localDate(at), Number.isNaN(at.getTime()) ? null : at.toISOString().slice(0, 10)]
    .filter(Boolean)
    .map(date => dayNumber(date) - dayNumber(entry.date))
    .filter(days => days >= 0 && days <= LEGACY_MATCH_DAYS)
  return candidates.length ? Math.min(...candidates) : null
}

// The server is the source of truth. A local entry survives only while it is still queued;
// anything else that the server does not know is an orphan for the owner to review.
// pending holds the record ids of queued sales, or the local id of a queued legacy entry without one.
// Each server record matches at most one local entry.
export const mergeTransactions = ({ server, local, pending }) => {
  const mapped = server.map(fromRecord)
  const onServer = new Set(mapped.map(entry => entry.recordId))
  const pendingIds = new Set(pending)
  const claimed = new Set(local.filter(entry => entry.recordId && onServer.has(entry.recordId)).map(entry => entry.recordId))
  const kept = []
  const legacy = []
  // Local entries without a server record or a queue item: orphans unless a legacy pass matches them
  const unresolved = new Set()

  for (const entry of local) {
    if (entry.recordId && onServer.has(entry.recordId)) continue
    if (pendingIds.has(entry.recordId || entry.id)) {
      kept.push(entry)
      continue
    }
    if (!entry.recordId) legacy.push(entry)
    unresolved.add(entry)
  }

  // Entries from before record ids existed: an identical server record is the same sale
  const free = () => server.filter(record => !claimed.has(record.id))
  for (const entry of legacy) {
    const match = free().find(record => sameSale(fromRecord(record), { ...entry, amount: Number(entry.amount) }))
    if (match) {
      claimed.add(match.id)
      unresolved.delete(entry)
    }
  }

  // Then the closest record created on or up to a week after the entry's date, closest pairs first
  const pairs = []
  legacy.filter(entry => unresolved.has(entry)).forEach((entry, entryIndex) => {
    free().forEach((record, recordIndex) => {
      const days = legacyDistance(entry, record)
      if (days !== null) pairs.push({ entry, record, days, entryIndex, recordIndex })
    })
  })
  pairs.sort((a, b) => a.days - b.days || a.entryIndex - b.entryIndex || a.recordIndex - b.recordIndex)
  for (const { entry, record } of pairs) {
    if (!unresolved.has(entry) || claimed.has(record.id)) continue
    claimed.add(record.id)
    unresolved.delete(entry)
  }

  const orphans = local.filter(entry => unresolved.has(entry))
  // Array#sort is stable, so entries of one date keep server (created) order, queued ones last
  const transactions = [...mapped, ...kept].sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0))
  return { transactions, orphans }
}
