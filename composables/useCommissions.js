import { usePocketBase } from './usePocketBase'
import { useTransactions } from './useTransactions'
import { localDate } from '~/utils/transactions'
import { commissionLines } from '~/utils/reports/lines'
import { anonymisedPatch, dueForAnonymising, incomeFor, isPaid, paymentStep, paidPatch, unpaidPatch, NOT_MIGRATED } from '~/utils/commissions'

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

  // A server without the payment fields answers without them: nothing may be booked then
  const updatePayment = async (id, patch) => {
    const record = await updateCommission(id, patch)
    if (!isPaid(record) || (patch.payment_transaction && record.payment_transaction !== patch.payment_transaction)) throw new Error(NOT_MIGRATED)
    return record
  }

  // Turns Paid on. The commission is read again first: another device may have paid it already.
  // The income's record id is the commission's own id (an older commission keeps the id it stored), and it is
  // stored on the commission before the income is booked. A lost reply leaves a commission naming an income
  // that does not exist: the next tap books it with that same id. Two devices booking at once post the same
  // id, and the server keeps only the first.
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
    if (plan.step === 'mark') return { record: await updatePayment(commission.id, paidPatch('', now)), booked: 0 }
    const recordId = fresh.payment_transaction || fresh.id
    const record = await updatePayment(commission.id, paidPatch(recordId, now))
    return { record, booked: bookIncome(recordId, record, articles, now) }
  }

  // Run when a paid commission is opened: an income it names that is gone (a booking that never arrived)
  // is booked now with its stored id. Only a plain "not found" counts as gone; it never books on a guess.
  const repairPayment = async (commission, articles = [], now = new Date()) => {
    const fresh = await getCommission(commission.id)
    const plan = paymentStep(fresh)
    if (plan.step !== 'verify' || (await transactionExists(plan.recordId))) return { record: fresh, booked: 0 }
    return { record: fresh, booked: bookIncome(plan.recordId, fresh, articles, now) }
  }

  // Turns Paid off: the income is taken back first (queue or server), then the commission forgets it.
  // A commission marked paid without an income only loses paid_at.
  const markUnpaid = async (commission) => {
    const fresh = await getCommission(commission.id)
    if (fresh.payment_transaction) await removeTransaction(fresh.payment_transaction)
    if (!fresh.paid_at && !fresh.payment_transaction) return fresh
    return updateCommission(commission.id, unpaidPatch())
  }

  return { listCommissions, getCommission, createCommission, updateCommission, anonymise, anonymiseDue, markPaid, markUnpaid, repairPayment }
}
