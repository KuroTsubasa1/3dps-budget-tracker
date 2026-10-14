<template>
  <div class="space-y-4">
    <div class="card min-w-0 p-4">
      <p class="text-xs font-medium text-ink-muted">Stock value</p>
      <p class="mt-1 truncate text-2xl font-semibold tabular-nums text-ink" data-testid="stock-value">{{ formatCurrency(figures.value) }}</p>
    </div>
    <div class="grid gap-4 lg:grid-cols-2">
      <BaseCard title="Runs out soonest" subtitle="At the pace of the last 30 days" icon="exclamation" flush>
        <p v-if="!figures.runsOut.length" class="px-4 pb-4 text-sm text-ink-muted md:px-5">No sales in the last 30 days</p>
        <ol v-else class="divide-y divide-line">
          <li v-for="row in figures.runsOut" :key="row.id" class="flex items-center gap-3 px-4 py-3 md:px-5">
            <p class="min-w-0 flex-1 break-words text-sm font-medium text-ink">{{ row.name }}</p>
            <p class="shrink-0 text-sm tabular-nums text-ink-muted">{{ row.stock }} left</p>
            <p class="shrink-0 text-sm font-semibold tabular-nums text-ink">~{{ row.days }} days</p>
          </li>
        </ol>
      </BaseCard>
      <BaseCard title="Printed vs sold" :subtitle="`${figures.printed.printed} printed · ${figures.printed.sold} sold`" icon="printer" flush>
        <p v-if="!figures.printed.rows.length" class="px-4 pb-4 text-sm text-ink-muted md:px-5">Nothing printed or sold in this period</p>
        <ul v-else class="divide-y divide-line">
          <li v-for="row in figures.printed.rows" :key="row.id" class="flex items-center gap-3 px-4 py-3 md:px-5">
            <p class="min-w-0 flex-1 break-words text-sm font-medium text-ink">{{ row.name }}</p>
            <p class="shrink-0 text-sm tabular-nums text-ink-muted">{{ row.printed }} printed</p>
            <p class="shrink-0 text-sm font-semibold tabular-nums text-ink">{{ row.sold }} sold</p>
          </li>
        </ul>
      </BaseCard>
    </div>
    <BaseCard title="Commissions" icon="clipboard" flush>
      <dl class="divide-y divide-line">
        <div v-for="row in commissionRows" :key="row.id" class="flex items-center justify-between gap-3 px-4 py-3 md:px-5">
          <dt class="min-w-0 text-sm text-ink">
            {{ row.label }}
            <span class="block text-xs text-ink-muted">{{ row.hint }}</span>
          </dt>
          <dd class="shrink-0 text-sm font-semibold tabular-nums text-ink" :data-testid="`commissions-${row.id}`">{{ row.value }}</dd>
        </div>
      </dl>
    </BaseCard>
  </div>
</template>

<script setup>
import { computed } from 'vue'
import { formatCurrency } from '~/utils/currency'

const props = defineProps({
  // { value: stockValue(), runsOut: runsOutSoonest(), printed: printedVsSold(), commissions: commissionFigures() }
  figures: { type: Object, required: true }
})

const DAYS = new Intl.NumberFormat('de-DE', { maximumFractionDigits: 1 })
const count = (n, one, many) => `${n} ${n === 1 ? one : many}`

const commissionRows = computed(() => {
  const figures = props.figures.commissions
  return [
    { id: 'open', label: 'Open value', hint: `Open, printing and ready · ${count(figures.openCount, 'commission', 'commissions')}`, value: formatCurrency(figures.openValue) },
    { id: 'delivered', label: 'Delivered value', hint: `In this period · ${count(figures.deliveredCount, 'commission', 'commissions')}`, value: formatCurrency(figures.deliveredValue) },
    { id: 'days', label: 'Average days to deliver', hint: 'From created to delivered', value: figures.averageDays === null ? '—' : `${DAYS.format(figures.averageDays)} days` }
  ]
})
</script>
