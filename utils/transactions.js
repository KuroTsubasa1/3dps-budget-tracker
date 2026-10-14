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
  date: record.date || createdDate(record.created),
  // The reports read these from the cached list, so they work offline too. PocketBase returns an
  // empty json field as null and an unset date as ''; those are left out.
  ...(Array.isArray(record.items) && record.items.length ? { items: record.items } : {}),
  ...(record.sold_at ? { sold_at: record.sold_at } : {}),
  ...(record.created ? { created: record.created } : {})
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

// Stored orphans are dropped only once their own record id is on the server. Old-app entries have
// none: a look-alike record (the same item sold again, an uploaded twin) must never remove them,
// so the owner reviews those in Settings.
export const recheckOrphans = ({ server, orphans }) => {
  const onServer = new Set(server.map(record => record.id))
  return orphans.filter(entry => !(entry.recordId && onServer.has(entry.recordId)))
}

// A queued sale is pending under its record id and, for items from before record ids, its local id
export const pendingQueueIds = queue => queue
  .filter(item => item.status !== 'synced')
  .flatMap(item => [item.recordId, item.id])
  .filter(id => id !== undefined && id !== null && id !== '')

// Unsynced items from before record ids get one, so a retry after a lost reply cannot create a
// second record. Returns the new queue, or null when nothing changed.
export const withRecordIds = (queue, makeId) => {
  let changed = false
  const next = queue.map((item) => {
    if (item.status === 'synced' || item.recordId) return item
    changed = true
    return { ...item, recordId: makeId() }
  })
  return changed ? next : null
}

// Local entries the server has not confirmed and no queue item covers. Without a successful
// refresh (serverIds null) only entries that never had a record id are known to be local.
export const unconfirmedCount = ({ transactions, serverIds, pending }) => {
  const pendingIds = new Set(pending)
  return transactions.filter((entry) => {
    if (pendingIds.has(entry.recordId || entry.id)) return false
    if (!entry.recordId) return true
    return !!serverIds && !serverIds.has(entry.recordId)
  }).length
}

const csvField = value => `"${String(value ?? '').replace(/"/g, '""')}"`
const csvRow = (entry, status) =>
  [entry.id, entry.description, entry.amount, entry.date, entry.notes, status].map(csvField).join(',')

// Transactions, then orphans, then queued sales the transaction list does not hold (after a logout)
export const transactionsCsv = ({ transactions, orphans, queue }) => {
  const waiting = queue.filter(item => item.status !== 'synced')
  const waitingIds = new Set(pendingQueueIds(waiting))
  const listed = new Set(transactions.map(entry => entry.recordId || entry.id))
  return [
    'ID,Description,Amount,Date,Notes,Status',
    ...transactions.map(entry => csvRow(entry, waitingIds.has(entry.recordId || entry.id) ? 'waiting to sync' : '')),
    ...orphans.map(entry => csvRow(entry, 'not on server')),
    ...waiting.filter(item => !listed.has(item.recordId) && !listed.has(item.id)).map(item => csvRow(item, 'waiting to sync'))
  ].join('\n')
}
