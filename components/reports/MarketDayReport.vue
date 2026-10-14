<template>
  <p v-if="!days.length" class="card px-4 py-8 text-center text-sm text-ink-muted">No market days in this period</p>
  <div v-else class="space-y-4">
    <div>
      <label for="market-day" class="label">Market day</label>
      <select id="market-day" class="input pr-9" :value="day" @change="$emit('update:day', $event.target.value)">
        <option v-for="item in days" :key="item" :value="item">{{ dayLabel(item) }}</option>
      </select>
    </div>
    <template v-if="report">
      <div class="grid grid-cols-2 gap-3 md:grid-cols-3">
        <div v-for="tile in tiles" :key="tile.id" class="card min-w-0 p-4" :class="{ 'col-span-2 md:col-span-1': tile.wide }">
          <p class="text-xs font-medium text-ink-muted">{{ tile.label }}</p>
          <p class="mt-1 truncate text-xl font-semibold tabular-nums text-ink" :data-testid="`market-${tile.id}`">{{ tile.value }}</p>
        </div>
      </div>
      <BaseCard title="Takings per hour" icon="chart">
        <BarChart :labels="hours.map(hourLabel)" :series="[{ name: 'Takings', values: hourValues, tone: 'accent' }]" :label="chartLabel" />
      </BaseCard>
      <BaseCard title="Compared with earlier market days" :subtitle="comparisonSubtitle" icon="calendar" flush>
        <p v-if="!comparison" class="px-4 pb-4 text-sm text-ink-muted md:px-5">No earlier market days to compare with</p>
        <dl v-else class="divide-y divide-line">
          <div v-for="row in deltas" :key="row.id" class="flex items-center justify-between gap-3 px-4 py-3 md:px-5">
            <dt class="text-sm text-ink">{{ row.label }}</dt>
            <dd class="text-sm font-semibold tabular-nums" :class="toneOf(row.value)" :data-testid="`compare-${row.id}`">{{ row.text }}</dd>
          </div>
        </dl>
      </BaseCard>
    </template>
  </div>
</template>

<script setup>
import { computed } from 'vue'
import BarChart from '~/components/charts/BarChart.vue'
import { formatCurrency } from '~/utils/currency'
import { toDate } from '~/utils/reports/common'
import { hourWindow } from '~/utils/reports/marketDay'

const props = defineProps({
  // Market days in the period, newest first ('YYYY-MM-DD')
  days: { type: Array, required: true },
  day: { type: String, default: '' },
  // dayReport() for `day`; null while no day is chosen
  report: { type: Object, default: null },
  // compareWithPrevious() for `day`; null without an earlier market day
  comparison: { type: Object, default: null }
})
defineEmits(['update:day'])

const ITEMS = new Intl.NumberFormat('de-DE', { maximumFractionDigits: 1 })
const signed = (value, text) => (value > 0 ? `+${text}` : text)
const toneOf = value => (value > 0 ? 'text-income' : value < 0 ? 'text-expense' : 'text-ink-muted')
const dayLabel = day => toDate(day).toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' })
const hourLabel = hour => `${String(hour).padStart(2, '0')}:00`

const tiles = computed(() => [
  { id: 'takings', label: 'Takings', value: formatCurrency(props.report.takings), wide: true },
  { id: 'items', label: 'Items sold', value: String(props.report.items) },
  { id: 'sales', label: 'Sales', value: String(props.report.sales) }
])

const hours = computed(() => hourWindow(props.report?.perHour ?? []))
const hourValues = computed(() => hours.value.map(hour => props.report?.perHour[hour] ?? 0))
const chartLabel = computed(() => {
  const best = Math.max(0, ...hourValues.value)
  if (!best) return 'Takings per hour: no sale on this day has a time'
  return `Takings per hour: busiest ${hourLabel(hours.value[hourValues.value.indexOf(best)])} with ${formatCurrency(best)}`
})

const comparisonSubtitle = computed(() => {
  if (!props.comparison) return ''
  const { days } = props.comparison
  return `Against the average of the previous ${days} market ${days === 1 ? 'day' : 'days'}`
})
const deltas = computed(() => {
  if (!props.comparison) return []
  const { takings, items, averageSale } = props.comparison
  return [
    { id: 'takings', label: 'Takings', value: takings, text: signed(takings, formatCurrency(takings)) },
    { id: 'items', label: 'Items sold', value: items, text: signed(items, ITEMS.format(items)) },
    { id: 'average', label: 'Average sale', value: averageSale, text: signed(averageSale, formatCurrency(averageSale)) }
  ]
})
</script>
