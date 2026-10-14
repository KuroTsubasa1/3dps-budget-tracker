// Push message texts for convention reminders (spec, "Server job"). Times and days are local.
import { dayKey, localDayKey, daysBetween, formatDay, formatTime, inDays, parseInstant } from './dates.js'
import { lowStockArticles, suggestedQuantity } from '../printBoard.js'

// The stock check names at most this many articles, then "+N more"
export const STOCK_LIST_LIMIT = 5

// ' in 5 days', or nothing when the day is not set
const when = days => (Number.isFinite(days) ? ` ${inDays(days)}` : '')
const placeOf = convention => [convention.hall, convention.table ? `Table ${convention.table}` : ''].filter(Boolean).join(', ')

function stockBody (articles) {
  const low = lowStockArticles(articles)
  if (!low.length) return 'Stock looks fine'
  const named = low.slice(0, STOCK_LIST_LIMIT).map(article => `${article.name} (print ${suggestedQuantity(article)})`)
  const more = low.length - named.length
  return `Low stock: ${[...named, ...(more ? [`+${more} more`] : [])].join(', ')}`
}

// { title, body, url } for one reminder; `articles` are the active articles (only the stock check reads them)
export function messageFor ({ convention, reminder, articles = [], now = new Date() }) {
  const name = convention.name
  const url = `/calendar?c=${convention.id}`
  const today = localDayKey(now)
  const until = field => (dayKey(convention[field]) ? daysBetween(today, dayKey(convention[field])) : NaN)

  if (reminder.kind === 'deadline') {
    const close = dayKey(convention.applications_close)
    const days = until('applications_close')
    return { title: `Applications close${when(days)}`, body: close ? `${name} · closes ${formatDay(close)}` : name, url }
  }
  if (reminder.kind === 'stock') {
    return { title: `${name}${when(until('starts_on'))}`, body: stockBody(articles), url }
  }
  if (reminder.kind === 'pack') {
    const place = placeOf(convention)
    return { title: `${name}${when(until('starts_on'))}`, body: place ? `Time to pack · ${place}` : 'Time to pack', url }
  }
  if (reminder.kind === 'setup') {
    const setup = parseInstant(convention.setup_at)
    const days = setup ? daysBetween(today, localDayKey(setup)) : until('starts_on')
    const body = [convention.hall, convention.table ? `Table ${convention.table}` : '', setup ? `Setup ${formatTime(setup)}` : '']
      .filter(Boolean)
      .join(' · ')
    return { title: `Setup${when(days)}: ${name}`, body, url }
  }
  return { title: name, body: reminder.text || '', url }
}
