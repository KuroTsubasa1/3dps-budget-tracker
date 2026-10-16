import { usePocketBase } from './usePocketBase'

export const ARTICLES = 'budget_tracket_catalog'

export const useArticles = () => {
  const pb = usePocketBase()
  const withCategory = { expand: 'category' }

  // Soft-deleted articles (active = false) never appear in the catalog
  const listActive = () =>
    pb.collection(ARTICLES).getFullList({ filter: 'active = true', expand: 'category', sort: 'name' })

  // Every article, archived ones too: the reports name what was sold even after an article is retired
  const listAll = () =>
    pb.collection(ARTICLES).getFullList({ expand: 'category', sort: 'name' })

  const createArticle = (fields, images = []) =>
    pb.collection(ARTICLES).create({ ...fields, active: true, stock: 0, ...(images.length ? { images } : {}) }, withCategory)

  // PocketBase 0.22 appends files sent to `images` and removes those named in `images-`; it has no
  // `images+` (that came with 0.23) and would silently drop the new files
  const updateArticle = (id, fields, { add = [], remove = [] } = {}) =>
    pb.collection(ARTICLES).update(id, {
      ...fields,
      ...(add.length ? { images: add } : {}),
      ...(remove.length ? { 'images-': remove } : {})
    }, withCategory)

  // Soft delete keeps sales and stock history pointing at a real record
  const deleteArticle = id => pb.collection(ARTICLES).update(id, { active: false })

  const imageUrl = (article, thumb = '300x300') => pb.files.getUrl(article, article.images[0], { thumb })

  return { ARTICLES, listActive, listAll, createArticle, updateArticle, deleteArticle, imageUrl }
}
