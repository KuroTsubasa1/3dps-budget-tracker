import { usePocketBase } from './usePocketBase'
import { useTransactions } from './useTransactions'
import { newRecordId } from '~/utils/inventory'
import { localDate } from '~/utils/transactions'
import { syncReminders, withSentMarks } from '~/utils/calendar/reminders'
import { writeCopy, readCopy } from '~/utils/calendar/copy'

const CONVENTIONS = 'conventions'

export const useConventions = () => {
  const pb = usePocketBase()
  const { addTransaction, transactions, pendingTransactions } = useTransactions()

  const listConventions = () => pb.collection(CONVENTIONS).getFullList({ sort: 'starts_on,name' })
  const getConvention = id => pb.collection(CONVENTIONS).getOne(id)

  // The offline copy (utils/calendar/copy.js); logging out deletes it
  const saveCopy = (items, savedAt = new Date()) => writeCopy(localStorage, items, savedAt)
  const savedCopy = () => readCopy(localStorage)

  // The reminders follow the dates and the status on every save
  const createConvention = (fields, reminders = [], now = new Date()) =>
    pb.collection(CONVENTIONS).create({ ...fields, reminders: syncReminders(fields, reminders, now) })

  // `reminders` is the sheet's list (edited, added, removed). The job may have sent one since the
  // sheet loaded it, so the record is read again and those marks are kept: a sent reminder never goes out twice.
  const updateConvention = async (current, fields, reminders = current.reminders ?? [], now = new Date()) => {
    const fresh = await getConvention(current.id)
    const merged = withSentMarks(Array.isArray(reminders) ? reminders : [], Array.isArray(fresh.reminders) ? fresh.reminders : [])
    return pb.collection(CONVENTIONS).update(current.id, { ...fields, reminders: syncReminders({ ...fresh, ...fields }, merged, now) })
  }

  const deleteConvention = id => pb.collection(CONVENTIONS).delete(id)

  // Is the expense with this record id on the server, in this device's history or waiting in its queue?
  // Only a plain "not found" counts as missing; any other failure is thrown so nothing is booked on a guess.
  const expenseExists = async (recordId) => {
    if (transactions.value.some(item => item.recordId === recordId)) return true
    if (pendingTransactions.value.some(item => item.recordId === recordId)) return true
    try {
      await pb.collection('budget_tracker_transactions').getOne(recordId)
      return true
    } catch (error) {
      if (error?.status === 404) return false
      throw error
    }
  }

  const bookFee = (recordId, record, now) =>
    addTransaction({ recordId, description: `Stand fee: ${record.name}`, amount: -Number(record.stand_fee), date: localDate(now) })

  // Books the stand fee as an expense dated today. The convention is updated first and names the expense's
  // record id; the expense then goes through the normal path (queued if the connection drops).
  // A second device that already marked it paid wins: nothing is booked twice. If the update went through but
  // its reply was lost, the convention names an expense that does not exist: it is booked now with that same id.
  const markFeePaid = async (convention, now = new Date()) => {
    const fresh = await getConvention(convention.id)
    if (fresh.fee_paid_at) {
      if (fresh.fee_transaction && !(await expenseExists(fresh.fee_transaction))) {
        bookFee(fresh.fee_transaction, fresh, now)
        return { record: fresh, booked: true }
      }
      return { record: fresh, booked: false }
    }
    const recordId = newRecordId()
    const record = await pb.collection(CONVENTIONS).update(convention.id, { fee_paid_at: now.toISOString(), fee_transaction: recordId })
    bookFee(recordId, record, now)
    return { record, booked: true }
  }

  return { listConventions, getConvention, createConvention, updateConvention, deleteConvention, markFeePaid, saveCopy, savedCopy }
}
