// Commission lifecycle and privacy rules. See docs/superpowers/specs/2026-10-13-commissions-design.md
export const STATUS_LABEL = { open: 'Open', printing: 'Printing', ready: 'Ready', delivered: 'Delivered', cancelled: 'Cancelled' }
export const NEXT = { open: 'printing', printing: 'ready', ready: 'delivered' }
export const PREVIOUS = { printing: 'open', ready: 'printing' }
export const NEXT_ACTION = { open: 'Start printing', printing: 'Mark ready', ready: 'Mark delivered' }

const ANONYMISE_AFTER_MONTHS = 6

export const isFinal = status => status === 'delivered' || status === 'cancelled'
export const canCancel = status => status === 'open' || status === 'printing' || status === 'ready'

export function transitionPatch (commission, target, now = new Date()) {
  const from = commission.status
  const allowed = NEXT[from] === target || PREVIOUS[from] === target || (target === 'cancelled' && canCancel(from))
  if (!allowed) throw new Error(`Cannot move a commission from ${from} to ${target}`)
  if (target === 'delivered') return { status: target, delivered_at: now.toISOString() }
  if (target === 'cancelled') return { status: target, cancelled_at: now.toISOString() }
  return { status: target }
}

// PocketBase returns dates as "YYYY-MM-DD HH:MM:SS.sssZ"
const parseDate = value => new Date(String(value).replace(' ', 'T'))

export function dueForAnonymising (commission, now = new Date()) {
  if (!isFinal(commission.status) || commission.anonymised_at) return false
  const finished = commission.status === 'delivered' ? commission.delivered_at : commission.cancelled_at
  if (!finished) return false
  const cutoff = new Date(now)
  cutoff.setMonth(cutoff.getMonth() - ANONYMISE_AFTER_MONTHS)
  return parseDate(finished) < cutoff
}

// The email field type rejects '—', so the email is cleared instead
export const anonymisedPatch = (now = new Date()) =>
  ({ customer_name: '—', customer_email: '', address: '—', anonymised_at: now.toISOString() })

export const incomeFor = (commission, articleName) => ({
  description: `Commission: ${articleName} × ${commission.quantity} (${commission.customer_name})`,
  amount: Number(commission.agreed_price)
})

const parseNumber = value => Number(String(value).trim().replace(',', '.'))
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

export function validateCommission (form) {
  if (!String(form.customerName ?? '').trim()) return "Enter the customer's name"
  if (!EMAIL.test(String(form.email ?? '').trim())) return 'Enter a valid email address'
  if (!form.article) return 'Choose an article'
  if (form.fulfilment === 'shipping' && !String(form.address ?? '').trim()) return 'Enter an address for shipping'
  const quantity = parseNumber(form.quantity)
  if (!Number.isInteger(quantity) || quantity < 1) return 'Quantity must be a whole number of 1 or more'
  if (String(form.price ?? '').trim() === '' || !(parseNumber(form.price) > 0)) return 'Agreed price must be above 0'
  return ''
}
