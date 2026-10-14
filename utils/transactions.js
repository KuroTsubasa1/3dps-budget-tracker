// Calendar date (YYYY-MM-DD) in the device's own time zone
export const localDate = (date = new Date()) =>
  `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`

// PocketBase stamps records 'YYYY-MM-DD HH:MM:SS.sssZ' in UTC
const createdDate = created => localDate(new Date(String(created).replace(' ', 'T')))

export const fromRecord = record => ({
  id: record.id,
  recordId: record.id,
  description: record.description,
  amount: Number(record.amount),
  notes: record.notes || '',
  date: createdDate(record.created)
})

const sameSale = (a, b) => a.description === b.description && a.amount === b.amount && a.date === b.date

// The server is the source of truth. A local entry survives only while it is still queued;
// anything else that the server does not know is an orphan for the owner to review.
export const mergeTransactions = ({ server, local, pending }) => {
  const mapped = server.map(fromRecord)
  const onServer = new Set(mapped.map(entry => entry.recordId))
  const pendingIds = new Set(pending)
  const unmatched = [...mapped]
  const kept = []
  const orphans = []

  for (const entry of local) {
    if (entry.recordId && onServer.has(entry.recordId)) continue
    if (entry.recordId && pendingIds.has(entry.recordId)) {
      kept.push(entry)
      continue
    }
    if (!entry.recordId) {
      // Entries from before record ids existed: an identical server record is the same sale
      const match = unmatched.findIndex(candidate => sameSale(candidate, { ...entry, amount: Number(entry.amount) }))
      if (match !== -1) {
        unmatched.splice(match, 1)
        continue
      }
    }
    orphans.push(entry)
  }

  // Array#sort is stable, so entries of one date keep server (created) order, queued ones last
  const transactions = [...mapped, ...kept].sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0))
  return { transactions, orphans }
}
