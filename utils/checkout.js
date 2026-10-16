// The booking of a sale, shared by Add to Balance (cash) and Pay by card, so the two can never drift apart.
// A card payment stores its booking with the payment and books exactly that once the card is approved.
import { formatCurrency } from './currency.js'
import { effectivePrice } from './pricing.js'
import { saleLines } from './reports/lines.js'
import { saleMovement, newRecordId } from './inventory.js'
import { isGatcha, prizesFor } from './gatcha.js'
import { localDate } from './transactions.js'

export const PAYMENT_METHODS = ['card', 'cash']

const listPrice = product => effectivePrice(product, product.expand?.category)

// The cart's articles as priceCart lines; an article's own price (> 0) is an override that skips deals
export const cartLines = products => products.map(product => ({
  articleId: product.id,
  name: product.name,
  quantity: product.quantity,
  categoryId: product.category,
  // Stored on the sale's lines, so the reports can name the category even after it changes
  categoryName: product.expand?.category?.name ?? '',
  basePrice: product.expand?.category?.base_price ?? 0,
  override: Number(product.price) > 0 ? Number(product.price) : 0
}))

// A cart checkout: `products` are the cart's articles (quantity > 0, with the stock the catalog shows),
// `pricedCart` is priceCart(cartLines(products), deals). Movement ids are made here, so booking the same
// booking again (a retry, or a card payment booked on another device) never moves stock twice.
export function checkoutBooking ({ products, pricedCart, deals = [], newId = newRecordId, now = new Date() }) {
  const names = products
    .map(product => `${product.name} (${formatCurrency(listPrice(product))} × ${product.quantity})`)
    .join('\n')
  const dealNote = pricedCart.applied.length
    ? `\nDeals: ${pricedCart.applied.map(deal => `${deal.name} (−${formatCurrency(deal.saving)})`).join(', ')}`
    : ''
  return {
    description: `3D Printing Products:\n${names}${dealNote}`,
    amount: pricedCart.total,
    date: localDate(now),
    // The lines and the time of the sale for the reports: Σ lineTotal − Σ discount = amount
    items: saleLines(pricedCart, deals),
    sold_at: now.toISOString(),
    // Overselling is allowed: the movement deducts what is left and notes the rest.
    // A gatcha's own stock is never touched: the prizes picked for it are.
    stockMovements: products.filter(product => !isGatcha(product)).map(product => ({
      id: newId(),
      article: product.id,
      ...saleMovement(product.stock, product.quantity)
    })),
    // One prize per gatcha unit, picked right after the checkout
    prizes: prizesFor(products)
  }
}

// An income typed into the Home quick entry
export const homeBooking = ({ description, amount, notes = '', now = new Date() }) =>
  ({ description, amount: Number(amount), notes, date: localDate(now) })

// What addTransaction gets for a booking: cash, or card with SumUp's transaction and the card payment's
// record id as the sale's own id (so a second booking of the same payment is a duplicate the server refuses)
export function saleTransaction (booking, { paymentMethod, sumupTransaction = '', recordId = '' }) {
  if (!PAYMENT_METHODS.includes(paymentMethod)) throw new Error(`Unknown payment method: ${paymentMethod}`)
  const { prizes, ...sale } = booking
  return {
    ...sale,
    payment_method: paymentMethod,
    ...(sumupTransaction ? { sumup_transaction: sumupTransaction } : {}),
    ...(recordId ? { recordId } : {})
  }
}
