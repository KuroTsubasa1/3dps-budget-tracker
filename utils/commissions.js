// Commission lifecycle and privacy rules. See docs/superpowers/specs/2026-10-13-commissions-design.md
import { priceCart } from './deals.js'
export const STATUS_LABEL = { open: 'Open', printing: 'Printing', ready: 'Ready', delivered: 'Delivered', cancelled: 'Cancelled' }
export const NEXT = { open: 'printing', printing: 'ready', ready: 'delivered' }
export const PREVIOUS = { printing: 'open', ready: 'printing' }
export const NEXT_ACTION = { open: 'Start printing', printing: 'Mark ready', ready: 'Mark delivered' }

const ANONYMISE_AFTER_MONTHS = 6

export const isFinal = status => status === 'delivered' || status === 'cancelled'
export const canCancel = status => status === 'open' || status === 'printing' || status === 'ready'

export function transitionPatch (commission, target, now = new Date()) {
  const from = commission.status
  const allowed = !!target && (NEXT[from] === target || PREVIOUS[from] === target || (target === 'cancelled' && canCancel(from)))
  if (!allowed) throw new Error(`Cannot move a commission from ${from} to ${target}`)
  if (target === 'delivered') return { status: target, delivered_at: now.toISOString() }
  if (target === 'cancelled') return { status: target, cancelled_at: now.toISOString() }
  // ready_at feeds the print board's "Done today"; stepping back from Ready clears it
  if (target === 'ready') return { status: target, ready_at: now.toISOString() }
  if (from === 'ready') return { status: target, ready_at: '' }
  return { status: target }
}

// PocketBase returns dates as "YYYY-MM-DD HH:MM:SS.sssZ"
const parseDate = value => new Date(String(value).replace(' ', 'T'))

// Same UTC time of day, ANONYMISE_AFTER_MONTHS earlier; the day is clamped to the target month's length
function monthsBefore (now) {
  const target = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - ANONYMISE_AFTER_MONTHS, 1))
  const lastDay = new Date(Date.UTC(target.getUTCFullYear(), target.getUTCMonth() + 1, 0)).getUTCDate()
  return new Date(Date.UTC(
    target.getUTCFullYear(),
    target.getUTCMonth(),
    Math.min(now.getUTCDate(), lastDay),
    now.getUTCHours(),
    now.getUTCMinutes(),
    now.getUTCSeconds(),
    now.getUTCMilliseconds()
  ))
}

const holdsCustomerData = commission =>
  commission.customer_name !== '—' ||
  !!commission.customer_email ||
  (!!commission.address && commission.address !== '—')

// Privacy fails safe: a missing or unparseable finish date counts as due. anonymised_at is not consulted,
// so data re-entered after an earlier wipe is wiped again.
export function dueForAnonymising (commission, now = new Date()) {
  if (!isFinal(commission.status) || !holdsCustomerData(commission)) return false
  const finished = commission.status === 'delivered' ? commission.delivered_at : commission.cancelled_at
  if (!finished) return true
  const at = parseDate(finished)
  if (Number.isNaN(at.getTime())) return true
  return at < monthsBefore(now)
}

// The email field type rejects '—', so the email is cleared instead
export const anonymisedPatch = (now = new Date()) =>
  ({ customer_name: '—', customer_email: '', address: '—', anonymised_at: now.toISOString() })

export const UNKNOWN_ARTICLE = 'Unknown article'

const nameIn = (articles, id) => articles.find(article => article.id === id)?.name

// A commission's lines. New records keep them in `items`; records from before multi-article commissions
// (or before the data conversion) have one `article` × `quantity`, read here as a single line.
// A saved line shows its article's current name while the article is active, else the name copied when it was added.
export function itemsOf (commission, articles = []) {
  if (Array.isArray(commission?.items) && commission.items.length) {
    return commission.items.map(line => ({ ...line, name: nameIn(articles, line.article) ?? line.name ?? UNKNOWN_ARTICLE }))
  }
  if (!commission?.article) return []
  const name = commission.expand?.article?.name ?? nameIn(articles, commission.article) ?? UNKNOWN_ARTICLE
  return [{ article: commission.article, name, quantity: Number(commission.quantity) }]
}

const lineText = line => `${line.name} × ${line.quantity}`

// List rows: "× n" only above 1; more than two lines show the first two and "+n more"
export function summaryOf (commission, articles = []) {
  const lines = itemsOf(commission, articles)
  const shown = lines.slice(0, 2).map(line => (Number(line.quantity) > 1 ? lineText(line) : line.name)).join(', ')
  return lines.length > 2 ? `${shown} +${lines.length - 2} more` : shown
}

// Form helpers: each returns a new array, so the form's list is replaced, never changed in place
export const setLineQuantity = (items, index, quantity) =>
  items.map((line, i) => (i === index ? { ...line, quantity: Math.max(1, quantity) } : line))

export const removeLine = (items, index) => items.filter((line, i) => i !== index)

// Deal-aware price for the lines, as the cart would charge it. A line whose article is not in
// `articles` (archived since) has no current price and is left out.
export function suggestedPriceFor (items, articles, deals = []) {
  const cartLines = items.flatMap((line) => {
    const article = articles.find(item => item.id === line.article)
    if (!article) return []
    return [{
      articleId: article.id,
      name: article.name,
      quantity: Number(line.quantity),
      categoryId: article.category,
      basePrice: article.expand?.category?.base_price ?? 0,
      override: Number(article.price) > 0 ? Number(article.price) : 0
    }]
  })
  return priceCart(cartLines, deals).total
}

// The income always writes "× n", so the booked description reads the same whatever the quantity
export const incomeFor = (commission, articles = []) => ({
  description: `Commission: ${itemsOf(commission, articles).map(lineText).join(', ')} (${commission.customer_name})`,
  amount: Number(commission.agreed_price)
})

const parseNumber = value => Number(String(value).trim().replace(',', '.'))
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

const isWholeAtLeastOne = value => /^\d+$/.test(String(value ?? '').trim()) && Number(String(value).trim()) >= 1

export function validateCommission (form) {
  // An anonymised commission has no customer data left to require
  if (!form.anonymised) {
    if (!String(form.customerName ?? '').trim()) return "Enter the customer's name"
    // The email is optional; a given one must be valid
    const email = String(form.email ?? '').trim()
    if (email && !EMAIL.test(email)) return 'Enter a valid email address'
  }
  const items = Array.isArray(form.items) ? form.items : []
  if (!items.length) return 'Add at least one article'
  if (!form.anonymised && form.fulfilment === 'shipping' && !String(form.address ?? '').trim()) return 'Enter an address for shipping'
  if (!items.every(line => isWholeAtLeastOne(line.quantity))) return 'Quantity must be a whole number of 1 or more'
  const priceText = String(form.price ?? '').trim()
  if (!/^\d+([.,]\d{1,2})?$/.test(priceText) || !(parseNumber(priceText) > 0)) return 'Agreed price must be above 0'
  return ''
}
