<template>
  <p v-if="!summary.topArticles.length && !summary.olderSalesCount" class="card px-4 py-8 text-center text-sm text-ink-muted">No sales in this period</p>
  <div v-else class="space-y-4">
    <p v-if="summary.olderSalesCount" class="rounded-lg bg-muted px-3 py-2 text-sm text-ink-muted">
      {{ summary.olderSalesCount }} older sales aren't split by article
    </p>
    <SegmentedControl v-model="sortKey" label="Sort by" :options="SORT_OPTIONS" />
    <div class="grid gap-4 lg:grid-cols-2">
      <BaseCard v-for="table in tables" :key="table.title" :title="table.title" :icon="table.icon" flush>
        <p v-if="!table.rows.length" class="px-4 pb-4 text-sm text-ink-muted md:px-5">No sales in this period</p>
        <ol v-else class="divide-y divide-line">
          <li v-for="row in table.rows" :key="row.id || 'other'" class="flex items-center gap-3 px-4 py-3 md:px-5">
            <p class="min-w-0 flex-1 break-words text-sm font-medium text-ink">{{ row.name }}</p>
            <p class="shrink-0 text-sm tabular-nums text-ink-muted">{{ row.units }} sold</p>
            <p class="shrink-0 text-right text-sm font-semibold tabular-nums text-ink">{{ formatCurrency(row.revenue) }}</p>
          </li>
        </ol>
      </BaseCard>
    </div>
    <BaseCard title="Deals used" icon="cart" flush>
      <p v-if="!summary.deals.length" class="px-4 pb-4 text-sm text-ink-muted md:px-5">No deals used in this period</p>
      <ul v-else class="divide-y divide-line">
        <li v-for="deal in summary.deals" :key="deal.id" class="flex items-center gap-3 px-4 py-3 md:px-5">
          <p class="min-w-0 flex-1 break-words text-sm font-medium text-ink">{{ deal.name }}</p>
          <p class="shrink-0 text-sm tabular-nums text-ink-muted">{{ deal.times }}×</p>
          <p class="shrink-0 text-right text-sm font-semibold tabular-nums text-ink">−{{ formatCurrency(deal.discount) }}</p>
        </li>
      </ul>
    </BaseCard>
  </div>
</template>

<script setup>
import { ref, computed } from 'vue'
import { formatCurrency } from '~/utils/currency'
import { sortRows } from '~/utils/reports/sales'

const props = defineProps({
  // salesSummary() for the period
  summary: { type: Object, required: true }
})

const ROW_LIMIT = 10
const SORT_OPTIONS = [
  { value: 'revenue', label: 'Revenue' },
  { value: 'units', label: 'Units' }
]
const sortKey = ref('revenue')

const tables = computed(() => [
  { title: 'Top articles', icon: 'bag', rows: sortRows(props.summary.topArticles, sortKey.value).slice(0, ROW_LIMIT) },
  { title: 'Top categories', icon: 'chart', rows: sortRows(props.summary.topCategories, sortKey.value).slice(0, ROW_LIMIT) }
])
</script>
