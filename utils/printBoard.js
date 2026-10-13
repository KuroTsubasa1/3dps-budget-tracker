// Print board rules. See docs/superpowers/specs/2026-10-13-print-board-design.md

// PocketBase returns dates as "YYYY-MM-DD HH:MM:SS.sssZ"; the app itself writes ISO strings
const parseDate = value => new Date(String(value).replace(' ', 'T'))

export const targetFor = article =>
  Number(article.target_stock) > 0 ? Number(article.target_stock) : 2 * Number(article.low_stock_threshold)

// A missing or invalid stock counts as 0
export const stockOf = article => Number(article.stock) || 0

export const suggestedQuantity = article => Math.max(1, Math.ceil(targetFor(article) - stockOf(article)))

// "Today" is the device's local calendar day
export function isSameLocalDay (value, now) {
  if (!value) return false
  const date = parseDate(value)
  if (Number.isNaN(date.getTime())) return false
  return date.getFullYear() === now.getFullYear() && date.getMonth() === now.getMonth() && date.getDate() === now.getDate()
}

const oldestFirst = (a, b) => String(a.created ?? '').localeCompare(String(b.created ?? ''))
const newestFirst = field => (a, b) => parseDate(b[field]) - parseDate(a[field])

export function buildBoard ({ articles = [], jobs = [], commissions = [], now = new Date() }) {
  const printingJobs = jobs.filter(job => job.status === 'printing').sort(oldestFirst)
  const printingArticles = new Set(printingJobs.map(job => job.article))
  const lowStock = articles
    .filter(article =>
      article.active &&
      Number(article.low_stock_threshold) > 0 &&
      stockOf(article) <= Number(article.low_stock_threshold) &&
      !printingArticles.has(article.id))
    .sort((a, b) => stockOf(a) - stockOf(b) || String(a.name).localeCompare(String(b.name)))

  const withStatus = status => commissions.filter(commission => commission.status === status).sort(oldestFirst)
  const articleOf = job => job.expand?.article ?? articles.find(article => article.id === job.article) ?? null
  const jobCard = job => ({ kind: 'job', job, article: articleOf(job) })
  const commissionCard = commission => ({ kind: 'commission', commission })

  const doneJobs = jobs.filter(job => job.status === 'done' && isSameLocalDay(job.done_at, now)).sort(newestFirst('done_at'))
  const readyToday = commissions
    .filter(commission => commission.status === 'ready' && isSameLocalDay(commission.ready_at, now))
    .sort(newestFirst('ready_at'))

  return {
    toPrint: [
      ...lowStock.map(article => ({ kind: 'stock', article, quantity: suggestedQuantity(article) })),
      ...withStatus('open').map(commissionCard)
    ],
    printing: [...printingJobs.map(jobCard), ...withStatus('printing').map(commissionCard)],
    doneToday: [...doneJobs.map(jobCard), ...readyToday.map(commissionCard)]
  }
}
