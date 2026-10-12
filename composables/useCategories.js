import { usePocketBase } from './usePocketBase'

export const useCategories = () => {
  const pb = usePocketBase()

  const listCategories = () => pb.collection('categories').getFullList({ sort: 'sort_order,name' })

  return { listCategories }
}
