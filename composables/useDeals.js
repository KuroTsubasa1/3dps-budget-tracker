import { usePocketBase } from './usePocketBase'

const DEALS = 'deals'

export const useDeals = () => {
  const pb = usePocketBase()

  const listDeals = () => pb.collection(DEALS).getFullList({ sort: 'name' })
  const createDeal = fields => pb.collection(DEALS).create(fields)
  const updateDeal = (id, fields) => pb.collection(DEALS).update(id, fields)
  const deleteDeal = id => pb.collection(DEALS).delete(id)

  return { listDeals, createDeal, updateDeal, deleteDeal }
}
