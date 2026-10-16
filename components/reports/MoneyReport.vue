<template>
  <p v-if="!series.totals.income && !series.totals.expenses" class="card px-4 py-8 text-center text-sm text-ink-muted">No transactions in this period</p>
  <div v-else class="space-y-4">
    <div class="grid grid-cols-2 gap-3 md:grid-cols-4">
      <div v-for="tile in tiles" :key="tile.id" class="card min-w-0 p-4">
        <p class="text-xs font-medium text-ink-muted">{{ tile.label }}</p>
        <p class="mt-1 truncate text-xl font-semibold tabular-nums" :class="tile.tone" :data-testid="`money-${tile.id}`">{{ formatCurrency(tile.value) }}</p>
      </div>
    </div>
    <div class="grid gap-4 lg:grid-cols-2">
      <BaseCard :title="bucket === 'month' ? 'Per month' : 'Per week'" icon="chart">
        <BarChart :labels="labels" :series="barSeries" :label="barLabel" />
        <div class="mt-3 flex flex-wrap gap-4 text-xs text-ink-muted">
          <span class="flex items-center gap-1.5"><span class="h-2.5 w-2.5 rounded-sm bg-income" />Income</span>
          <span class="flex items-center gap-1.5"><span class="h-2.5 w-2.5 rounded-sm bg-expense" />Expenses</span>
        </div>
      </BaseCard>
      <BaseCard title="Balance" icon="cash">
        <LineChart :labels="labels" :values="balances" :label="lineLabel" />
      </BaseCard>
    </div>
    <BaseCard title="Income by payment" subtitle="Older entries and commission income count as Other" icon="cash" flush>
      <PaymentSplit :split="series.incomeByMethod" prefix="money" />
    </BaseCard>
    <BaseCard title="Breakdown" icon="clipboard" flush>
      <ul class="divide-y divide-line">
        <li v-for="row in series.buckets" :key="row.label" class="px-4 py-3 md:px-5">
          <p class="text-sm font-medium text-ink">{{ row.label }}</p>
          <dl class="mt-1 grid grid-cols-3 gap-2 text-xs">
            <div class="min-w-0">
              <dt class="text-ink-muted">Income</dt>
              <dd class="truncate tabular-nums text-income">{{ formatCurrency(row.income) }}</dd>
            </div>
            <div class="min-w-0">
              <dt class="text-ink-muted">Expenses</dt>
              <dd class="truncate tabular-nums text-expense">{{ formatCurrency(row.expenses) }}</dd>
            </div>
            <div class="min-w-0">
              <dt class="text-ink-muted">Profit</dt>
              <dd class="truncate tabular-nums" :class="row.profit < 0 ? 'text-expense' : 'text-ink'">{{ formatCurrency(row.profit) }}</dd>
            </div>
          </dl>
        </li>
      </ul>
    </BaseCard>
  </div>
</template>

<script setup>
import { computed } from 'vue'
import BarChart from '~/components/charts/BarChart.vue'
import LineChart from '~/components/charts/LineChart.vue'
import PaymentSplit from '~/components/reports/PaymentSplit.vue'
import { formatCurrency } from '~/utils/currency'

const props = defineProps({
  // moneySeries() for the period
  series: { type: Object, required: true },
  bucket: { type: String, default: 'week' }
})

const tiles = computed(() => {
  const { income, expenses, profit } = props.series.totals
  return [
    { id: 'income', label: 'Income', value: income, tone: 'text-income' },
    { id: 'expenses', label: 'Expenses', value: expenses, tone: 'text-expense' },
    { id: 'profit', label: 'Profit', value: profit, tone: profit < 0 ? 'text-expense' : 'text-income' },
    { id: 'japan', label: 'Japan (10% of income)', value: props.series.japan, tone: 'text-ink' }
  ]
})

const labels = computed(() => props.series.buckets.map(row => row.label))
const barSeries = computed(() => [
  { name: 'Income', values: props.series.buckets.map(row => row.income), tone: 'income' },
  { name: 'Expenses', values: props.series.buckets.map(row => row.expenses), tone: 'expense' }
])
const barLabel = computed(() =>
  `Income and expenses per ${props.bucket}: ${formatCurrency(props.series.totals.income)} income, ${formatCurrency(props.series.totals.expenses)} expenses`)
const balances = computed(() => props.series.balanceLine.map(point => point.balance))
const lineLabel = computed(() => {
  const line = props.series.balanceLine
  return line.length ? `Balance from ${formatCurrency(line[0].balance)} to ${formatCurrency(line[line.length - 1].balance)}` : 'Balance'
})
</script>
