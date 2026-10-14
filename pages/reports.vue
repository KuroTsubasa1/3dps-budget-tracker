<template>
  <div>
    <PageHeader title="Financial Reports" subtitle="Analyze your income and expense trends">
      <template #actions>
        <BaseButton variant="secondary" icon="download" aria-label="Export" :disabled="!canExport" @click="exportCsv">
          <span class="hidden sm:inline">Export</span>
        </BaseButton>
      </template>
    </PageHeader>

    <div class="no-scrollbar -mx-4 mb-3 flex gap-2 overflow-x-auto px-4 md:mx-0 md:flex-wrap md:px-0" role="group" aria-label="Time period">
      <button
        v-for="option in PERIODS"
        :key="option.value"
        type="button"
        class="chip"
        :class="period === option.value ? 'chip-active' : 'chip-idle'"
        :aria-pressed="period === option.value"
        @click="period = option.value"
      >
        {{ option.label }}
      </button>
    </div>

    <div v-if="period === 'custom'" class="mb-3 grid gap-3 md:grid-cols-2">
      <div>
        <label for="report-start" class="label">Start Date</label>
        <input id="report-start" v-model="custom.from" type="date" class="input">
      </div>
      <div>
        <label for="report-end" class="label">End Date</label>
        <input id="report-end" v-model="custom.to" type="date" class="input">
      </div>
    </div>

    <div class="no-scrollbar -mx-4 mb-4 flex gap-2 overflow-x-auto px-4 md:mx-0 md:flex-wrap md:px-0" role="group" aria-label="Report">
      <button
        v-for="option in REPORTS"
        :key="option.value"
        type="button"
        class="chip"
        :class="report === option.value ? 'chip-active' : 'chip-idle'"
        :aria-pressed="report === option.value"
        @click="report = option.value"
      >
        {{ option.label }}
      </button>
    </div>

    <template v-if="needsData && (needsConnection || error || loading)">
      <div v-if="needsConnection" class="card px-4 py-8 text-center">
        <AppIcon name="exclamation" class="mx-auto mb-3 h-8 w-8 text-ink-muted" />
        <p class="text-sm font-medium text-ink">Needs a connection</p>
      </div>
      <div v-else-if="error" class="card px-4 py-6 text-center">
        <p class="mb-3 text-sm text-expense">{{ error }}</p>
        <BaseButton variant="secondary" icon="refresh" @click="reload">Try Again</BaseButton>
      </div>
      <div v-else class="card flex h-32 items-center justify-center text-sm text-ink-muted">Loading report...</div>
    </template>
    <SalesReport v-else-if="report === 'sales'" :summary="sales" />
    <MarketDayReport v-else-if="report === 'market'" v-model:day="selectedDay" :days="days" :report="dayFigures" :comparison="comparison" />
    <MoneyReport v-else-if="report === 'money'" :series="money" :bucket="bucket" />
    <StockReport v-else :figures="stock" />
  </div>
</template>

<script setup>
import { ref, computed, watch } from 'vue'
import SalesReport from '~/components/reports/SalesReport.vue'
import MarketDayReport from '~/components/reports/MarketDayReport.vue'
import MoneyReport from '~/components/reports/MoneyReport.vue'
import StockReport from '~/components/reports/StockReport.vue'
import { useTransactions } from '~/composables/useTransactions'
import { useReportData } from '~/composables/useReportData'
import { localDate } from '~/utils/transactions'
import { PERIODS, periodRange, inPeriod, bucketFor, rangeDays } from '~/utils/reports/period'
import { salesSummary } from '~/utils/reports/sales'
import { marketDays, dayReport, compareWithPrevious } from '~/utils/reports/marketDay'
import { moneySeries } from '~/utils/reports/money'
import { stockValue, runsOutSoonest, printedVsSold, commissionFigures } from '~/utils/reports/stock'
import { reportTable, toCsv } from '~/utils/reports/csv'
import { downloadText } from '~/utils/download'

definePageMeta({ middleware: 'owner' })

const REPORTS = [
  { value: 'sales', label: 'Sales' },
  { value: 'market', label: 'Market day' },
  { value: 'money', label: 'Money' },
  { value: 'stock', label: 'Stock' }
]
// How many earlier market days a market day is compared with
const COMPARE_DAYS = 5

const { transactions } = useTransactions()

const period = ref('month')
const report = ref('sales')
const custom = ref({ from: localDate(), to: localDate() })
const now = ref(new Date())
const range = computed(() => periodRange(period.value, now.value, custom.value))
const bucket = computed(() => bucketFor(period.value, range.value))

const { data, loading, needsConnection, error, reload } = useReportData(range)
// Sales, Market day and Stock need the server; Money works from the cached transactions
const needsData = computed(() => report.value !== 'money')

const sales = computed(() => salesSummary({
  transactions: transactions.value,
  movements: data.value.movements,
  articles: data.value.articles,
  categories: data.value.categories,
  deals: data.value.deals,
  range: range.value
}))

const days = computed(() => marketDays(transactions.value.filter(transaction => inPeriod(transaction.date, range.value))))
const selectedDay = ref('')
// The latest market day is picked whenever the chosen one is not in the list (first load, a new period)
watch(days, (list) => {
  if (!list.includes(selectedDay.value)) selectedDay.value = list[0] ?? ''
}, { immediate: true })
const dayFigures = computed(() => (selectedDay.value ? dayReport({ transactions: transactions.value, day: selectedDay.value }) : null))
const comparison = computed(() => (selectedDay.value
  ? compareWithPrevious({ transactions: transactions.value, day: selectedDay.value, count: COMPARE_DAYS })
  : null))

const money = computed(() => moneySeries({ transactions: transactions.value, range: range.value, bucket: bucket.value }))

const stock = computed(() => ({
  value: stockValue(data.value.articles, data.value.categories),
  runsOut: runsOutSoonest({ articles: data.value.articles, movements: data.value.movements, now: data.value.loadedAt, limit: 5 }),
  printed: printedVsSold(data.value.movements, range.value, data.value.articles),
  commissions: commissionFigures(data.value.commissions, range.value)
}))

// Export writes the current tab's table for the period; off while a server tab shows no figures
const canExport = computed(() => !(needsData.value && (needsConnection.value || error.value || loading.value)))
const FIGURES = {
  sales: () => sales.value,
  market: () => ({ day: selectedDay.value, report: dayFigures.value }),
  money: () => money.value,
  stock: () => stock.value
}
const exportCsv = () => {
  const { first, last } = rangeDays(range.value)
  const table = reportTable(report.value, FIGURES[report.value]())
  downloadText(`report-${report.value}-${first}-${last}.csv`, toCsv(table), 'text/csv')
}
</script>
