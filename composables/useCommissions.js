import { usePocketBase } from './usePocketBase'
import { useTransactions } from './useTransactions'
import { newRecordId } from '~/utils/inventory'
import { localDate } from '~/utils/transactions'
import { commissionLines } from '~/utils/reports/lines'
import { anonymisedPatch, dueForAnonymising, incomeFor, paymentStep, paidPatch, unpaidPatch } from '~/utils/commissions'

const COMMISSIONS = 'commissions'

export const useCommissions = () => {
  const pb = usePocketBase()
  const { addTransaction, removeTransaction, transactionExists } = useTransactions()
  const withArticle = { expand: 'article' }

  const listCommissions = () => pb.collection(COMMISSIONS).getFullList({ expand: 'article', sort: '-created' })
  const getCommission = id => pb.collection(COMMISSIONS).getOne(id, withArticle)
  const createCommission = fields => pb.collection(COMMISSIONS).create({ ...fields, status: 'open' }, withArticle)
  const updateCommission = (id, fields) => pb.collection(COMMISSIONS).update(id, fields, withArticle)
  const anonymise = id => updateCommission(id, anonymisedPatch())

  // DSGVO: finished commissions keep their record but lose customer data after six months
  const anonymiseDue = async (list, now = new Date()) => {
    const due = list.filter(commission => dueForAnonymising(commission, now))
    const changed = []
    const failed = []
    // One record failing must not stop the others; it stays due and is retried on the next load
    for (const commission of due) {
      try {
        await updateCommission(commission.id, anonymisedPatch(now))
        changed.push(commission.id)
      } catch {
        failed.push(commission.id)
      }
    }
    return { changed, failed }
  }

  // The income for a paid commission: the agreed price, its lines spread for the reports, the customer
  // named in the description. It goes through the normal path (queued if the connection drops).
  const bookIncome = (recordId, record, articles, now) => {
    const income = incomeFor(record, articles)
    addTransaction({ recordId, ...income, date: localDate(now), items: commissionLines(record, articles), sold_at: now.toISOString() })
    return income.amount
  }

  // Turns Paid on. The commission is read again first: another device may have paid it already.
  // A new income's record id is stored on the commission before the income is booked, so a lost reply
  // leaves a commission naming an income that does not exist: the next tap books it with that same id.
  // An old delivered commission (its income booked on delivery) needs the owner's `choice` first:
  // without one the result is { ask: true } and nothing changes.
  const markPaid = async (commission, articles = [], { choice = '', now = new Date() } = {}) => {
    const fresh = await getCommission(commission.id)
    const plan = paymentStep(fresh, choice)
    if (plan.step === 'ask') return { record: fresh, ask: true, booked: 0 }
    if (plan.step === 'done') return { record: fresh, booked: 0 }
    if (plan.step === 'verify') {
      if (await transactionExists(plan.recordId)) return { record: fresh, booked: 0 }
      return { record: fresh, booked: bookIncome(plan.recordId, fresh, articles, now) }
    }
    if (plan.step === 'mark') return { record: await updateCommission(commission.id, paidPatch('', now)), booked: 0 }
    const recordId = newRecordId()
    const record = await updateCommission(commission.id, paidPatch(recordId, now))
    return { record, booked: bookIncome(recordId, record, articles, now) }
  }

  // Turns Paid off: the income is taken back first (queue or server), then the commission forgets it.
  // A commission marked paid without an income only loses paid_at.
  const markUnpaid = async (commission) => {
    const fresh = await getCommission(commission.id)
    if (fresh.payment_transaction) await removeTransaction(fresh.payment_transaction)
    if (!fresh.paid_at && !fresh.payment_transaction) return fresh
    return updateCommission(commission.id, unpaidPatch())
  }

  return { listCommissions, getCommission, createCommission, updateCommission, anonymise, anonymiseDue, markPaid, markUnpaid }
}
