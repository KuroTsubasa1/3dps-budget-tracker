import { usePocketBase } from './usePocketBase'
import { ARTICLES } from './useArticles'

const CATEGORIES = 'categories'

export const useCategories = () => {
  const pb = usePocketBase()

  const listCategories = () => pb.collection(CATEGORIES).getFullList({ sort: 'sort_order,name' })
  const createCategory = fields => pb.collection(CATEGORIES).create(fields)
  const updateCategory = (id, fields) => pb.collection(CATEGORIES).update(id, fields)

  const countActiveArticles = async (id) => {
    const result = await pb.collection(ARTICLES).getList(1, 1, {
      filter: pb.filter('category = {:id} && active = true', { id })
    })
    return result.totalItems
  }

  // Active articles must be moved first; hidden ones still block it in PocketBase (required relation)
  const deleteCategory = async (id) => {
    const inUse = await countActiveArticles(id)
    if (inUse > 0) throw Object.assign(new Error('Category in use'), { inUse })
    await pb.collection(CATEGORIES).delete(id)
  }

  return { listCategories, createCategory, updateCategory, deleteCategory, countActiveArticles }
}
