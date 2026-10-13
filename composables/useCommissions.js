import { usePocketBase } from './usePocketBase'
import { anonymisedPatch, dueForAnonymising } from '~/utils/commissions'

const COMMISSIONS = 'commissions'

export const useCommissions = () => {
  const pb = usePocketBase()
  const withArticle = { expand: 'article' }

  const listCommissions = () => pb.collection(COMMISSIONS).getFullList({ expand: 'article', sort: '-created' })
  const getCommission = id => pb.collection(COMMISSIONS).getOne(id, withArticle)
  const createCommission = fields => pb.collection(COMMISSIONS).create({ ...fields, status: 'open' }, withArticle)
  const updateCommission = (id, fields) => pb.collection(COMMISSIONS).update(id, fields, withArticle)
  const anonymise = id => updateCommission(id, anonymisedPatch())

  // DSGVO: finished commissions keep their record but lose customer data after six months
  const anonymiseDue = async (list, now = new Date()) => {
    const due = list.filter(commission => dueForAnonymising(commission, now))
    for (const commission of due) await updateCommission(commission.id, anonymisedPatch(now))
    return due.map(commission => commission.id)
  }

  return { listCommissions, getCommission, createCommission, updateCommission, anonymise, anonymiseDue }
}
