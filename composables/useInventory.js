import { usePocketBase } from './usePocketBase'
import { ARTICLES } from './useArticles'
import { stockFromMovements } from '~/utils/inventory'

const MOVEMENTS = 'stock_movements'

export const useInventory = () => {
  const pb = usePocketBase()

  // Movement ids are generated client-side, so a retry that hits an existing id already succeeded
  const createMovement = async (movement) => {
    try {
      await pb.collection(MOVEMENTS).create(movement)
    } catch (error) {
      if (!(error.status === 400 && error.response?.data?.id)) throw error
    }
  }

  // PocketBase 0.22 has no batch API: the log is written first and stock is always derived from it
  const recomputeStock = async (articleId) => {
    const movements = await pb.collection(MOVEMENTS).getFullList({
      filter: pb.filter('article = {:id}', { id: articleId }),
      fields: 'change'
    })
    const stock = stockFromMovements(movements)
    await pb.collection(ARTICLES).update(articleId, { stock })
    return stock
  }

  const applyMovements = async (movements) => {
    for (const movement of movements) await createMovement(movement)
    const stocks = {}
    for (const articleId of new Set(movements.map(movement => movement.article))) {
      stocks[articleId] = await recomputeStock(articleId)
    }
    return stocks
  }

  const listMovements = async (articleId, limit = 10) => {
    const result = await pb.collection(MOVEMENTS).getList(1, limit, {
      filter: pb.filter('article = {:id}', { id: articleId }),
      sort: '-created'
    })
    return result.items
  }

  return { applyMovements, recomputeStock, listMovements }
}
