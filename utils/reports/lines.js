// The `items` a sale or a delivered commission stores on its transaction, all in whole cents.
// See docs/superpowers/specs/2026-10-14-reports-design.md, criterion 1
import { itemsOf } from '../commissions.js'
import { effectivePrice } from '../pricing.js'
import { toCents, toEuros } from './common.js'

// Splits totalCents in proportion to the weights, rounding each share down; the remainder goes on the
// last share, so the shares always add up to the total. Without any weight it splits evenly.
export function spread (totalCents, weights) {
  if (!weights.length) return []
  const sum = weights.reduce((acc, weight) => acc + weight, 0)
  const basis = sum > 0 ? weights : weights.map(() => 1)
  const basisSum = sum > 0 ? sum : weights.length
  const shares = basis.map(weight => Math.floor(totalCents * weight / basisSum))
  shares[shares.length - 1] += totalCents - shares.reduce((acc, share) => acc + share, 0)
  return shares
}

const regularIn = deal => line =>
  !(Number(line.override) > 0) && line.quantity > 0 && (!deal || deal.categories.includes(line.categoryId))

// One line per cart line. Each applied deal's saving is spread over the lines it covered (the regular
// lines of its categories, as priceCart counts them) in proportion to their totals, the remainder on the
// deal's last line. So Σ lineTotal − Σ discount = the cart total, to the cent.
export function saleLines (pricedCart, deals = []) {
  const discounts = pricedCart.lines.map(() => 0)
  const dealOf = pricedCart.lines.map(() => null)
  for (const applied of pricedCart.applied) {
    // The deal always comes from `deals`; were it missing, its saving still lands on the regular lines
    const deal = deals.find(item => item.id === applied.dealId)
    const members = pricedCart.lines.map((line, index) => ({ line, index })).filter(({ line }) => regularIn(deal)(line))
    const shares = spread(toCents(applied.saving), members.map(({ line }) => toCents(line.lineTotal)))
    members.forEach(({ index }, i) => {
      discounts[index] += shares[i]
      dealOf[index] = applied
    })
  }
  return pricedCart.lines.map((line, index) => ({
    article: line.articleId,
    name: line.name,
    category: line.categoryId ?? '',
    categoryName: line.categoryName ?? '',
    quantity: line.quantity,
    unitPrice: line.unitPrice,
    lineTotal: line.lineTotal,
    discount: toEuros(discounts[index]),
    deal: dealOf[index]?.dealId ?? '',
    dealName: dealOf[index]?.name ?? ''
  }))
}

// The agreed price spread over the commission's lines in proportion to their list value (current price
// × quantity), the rounding remainder on the last line. An article that is gone has no price; when no
// line has one, the price is spread by quantity.
export function commissionLines (commission, articles = []) {
  const lines = itemsOf(commission, articles)
  const found = lines.map(line => articles.find(article => article.id === line.article))
  const listed = lines.map((line, i) => toCents(effectivePrice(found[i], found[i]?.expand?.category)) * Number(line.quantity))
  const weights = listed.some(value => value > 0) ? listed : lines.map(line => Number(line.quantity))
  const shares = spread(toCents(commission.agreed_price), weights)
  return lines.map((line, i) => ({
    article: line.article,
    name: line.name,
    category: found[i]?.category ?? '',
    categoryName: found[i]?.expand?.category?.name ?? '',
    quantity: Number(line.quantity),
    unitPrice: toEuros(Math.round(shares[i] / Math.max(1, Number(line.quantity)))),
    lineTotal: toEuros(shares[i]),
    discount: 0,
    deal: '',
    dealName: ''
  }))
}
