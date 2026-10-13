// PocketBase 0.22 reads an unset number field as 0, so only a positive price counts as an override
export const effectivePrice = (article, category) =>
  Number(article?.price) > 0 ? Number(article.price) : Number(category?.base_price ?? 0)
