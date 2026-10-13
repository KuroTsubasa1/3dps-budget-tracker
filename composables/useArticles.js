import { usePocketBase } from './usePocketBase'

export const ARTICLES = 'budget_tracket_catalog'

export const useArticles = () => {
  const pb = usePocketBase()
  const withCategory = { expand: 'category' }

  // Soft-deleted articles (active = false) never appear in the catalog
  const listActive = () =>
    pb.collection(ARTICLES).getFullList({ filter: 'active = true', expand: 'category', sort: 'name' })

  const createArticle = (fields, images = []) =>
    pb.collection(ARTICLES).create({ ...fields, active: true, stock: 0, ...(images.length ? { images } : {}) }, withCategory)

  // `images+` appends and `images-` removes files without touching the rest
  const updateArticle = (id, fields, { add = [], remove = [] } = {}) =>
    pb.collection(ARTICLES).update(id, {
      ...fields,
      ...(add.length ? { 'images+': add } : {}),
      ...(remove.length ? { 'images-': remove } : {})
    }, withCategory)

  // Soft delete keeps sales and stock history pointing at a real record
  const deleteArticle = id => pb.collection(ARTICLES).update(id, { active: false })

  const imageUrl = (article, thumb = '300x300') => pb.files.getUrl(article, article.images[0], { thumb })

  return { ARTICLES, listActive, createArticle, updateArticle, deleteArticle, imageUrl }
}
