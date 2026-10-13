import { formatCurrency } from './currency.js'

// Cart pricing for the shop's two deal types, computed in whole cents.
// See docs/superpowers/specs/2026-10-13-cart-deals-design.md
const toCents = value => Math.round(Number(value) * 100)
const toEuros = cents => cents / 100

export const isValidDeal = (deal) => {
  const categories = Array.isArray(deal?.categories) ? deal.categories : []
  const minQty = Number(deal?.min_qty)
  return (deal?.type === 'bundle' || deal?.type === 'group') &&
    categories.length > 0 &&
    (deal.type !== 'bundle' || categories.length === 1) &&
    Number.isInteger(minQty) && minQty >= 2 &&
    Number(deal.price) > 0
}

export const describeDeal = deal =>
  deal.type === 'bundle'
    ? `${deal.min_qty} for ${formatCurrency(Number(deal.price))}`
    : `${formatCurrency(Number(deal.price))} each from ${deal.min_qty}`

export const dealForCategory = (deals, categoryId) =>
  deals.filter(isValidDeal).find(deal => deal.categories.includes(categoryId))

// lines: { articleId, name, quantity, categoryId, basePrice, override } — override > 0 is the article's own price
export function priceCart (lines, deals = []) {
  const priced = lines.map((line) => {
    const unitPrice = Number(line.override) > 0 ? Number(line.override) : Number(line.basePrice) || 0
    return { ...line, unitPrice, lineTotal: toEuros(toCents(unitPrice) * line.quantity) }
  })
  // Overridden articles are special: they never count toward, or receive, a deal
  const regular = priced.filter(line => !(Number(line.override) > 0) && line.quantity > 0)
  const applied = []
  // One deal per category: the first deal in the given (name) order claims its categories,
  // and a later deal touching any claimed category is skipped so deals never stack
  const claimed = new Set()

  for (const deal of deals.filter(isValidDeal)) {
    if (deal.categories.some(id => claimed.has(id))) continue
    deal.categories.forEach(id => claimed.add(id))
    const members = regular.filter(line => deal.categories.includes(line.categoryId))
    const count = members.reduce((sum, line) => sum + line.quantity, 0)
    const n = Number(deal.min_qty)
    if (count < n) continue

    const fullCents = members.reduce((sum, line) => sum + toCents(line.unitPrice) * line.quantity, 0)
    const priceCents = toCents(deal.price)
    // A bundle covers one category, so its members share one base price
    const dealCents = deal.type === 'bundle'
      ? Math.floor(count / n) * priceCents + (count % n) * toCents(members[0].unitPrice)
      : count * priceCents
    const saving = fullCents - dealCents
    // Never surcharge: a deal priced worse than buying singly is ignored
    if (saving > 0) applied.push({ dealId: deal.id, name: deal.name, saving: toEuros(saving), description: describeDeal(deal) })
  }

  const subtotalCents = priced.reduce((sum, line) => sum + toCents(line.unitPrice) * line.quantity, 0)
  const savingsCents = applied.reduce((sum, deal) => sum + toCents(deal.saving), 0)
  return {
    lines: priced,
    applied,
    subtotal: toEuros(subtotalCents),
    savings: toEuros(savingsCents),
    total: toEuros(subtotalCents - savingsCents)
  }
}
