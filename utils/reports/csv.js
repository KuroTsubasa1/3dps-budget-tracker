// CSV of the current report tab's table. Money is written in euros with two decimals and a dot.
import { csvField } from '../transactions.js'
import { toCents } from './common.js'

const money = value => (toCents(value) / 100).toFixed(2)
const hour = value => `${String(value).padStart(2, '0')}:00`

export const toCsv = ({ headers, rows }) => [headers, ...rows].map(row => row.map(csvField).join(',')).join('\n')

// figures: sales → salesSummary(); market → { day, report: dayReport() | null };
// money → moneySeries(); stock → { printed: printedVsSold() }
export function reportTable (tab, figures) {
  if (tab === 'sales') {
    return {
      headers: ['Article', 'Units', 'Revenue'],
      rows: figures.topArticles.map(row => [row.name, row.units, money(row.revenue)])
    }
  }
  if (tab === 'market') {
    return {
      headers: ['Day', 'Hour', 'Takings'],
      rows: figures.report ? figures.report.perHour.map((takings, index) => [figures.day, hour(index), money(takings)]) : []
    }
  }
  if (tab === 'money') {
    return {
      headers: ['Period', 'Income', 'Expenses', 'Profit', 'Balance'],
      rows: figures.buckets.map((bucket, index) => [bucket.label, money(bucket.income), money(bucket.expenses), money(bucket.profit), money(figures.balanceLine[index].balance)])
    }
  }
  if (tab === 'stock') {
    return {
      headers: ['Article', 'Printed', 'Sold'],
      rows: figures.printed.rows.map(row => [row.name, row.printed, row.sold])
    }
  }
  throw new Error(`Unknown report: ${tab}`)
}
