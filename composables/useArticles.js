import { usePocketBase } from './usePocketBase'

export const ARTICLES = 'budget_tracket_catalog'

export const useArticles = () => {
  const pb = usePocketBase()

  // Soft-deleted articles (active = false) never appear in the catalog
  const listActive = () =>
    pb.collection(ARTICLES).getFullList({ filter: 'active = true', expand: 'category', sort: 'name' })

  const imageUrl = (article, thumb = '300x300') => pb.files.getUrl(article, article.images[0], { thumb })

  return { ARTICLES, listActive, imageUrl }
}
