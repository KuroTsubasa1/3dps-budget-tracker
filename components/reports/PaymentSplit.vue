<template>
  <dl class="divide-y divide-line">
    <div v-for="row in rows" :key="row.id" class="flex items-center justify-between gap-3 px-4 py-3 md:px-5">
      <dt class="min-w-0 truncate text-sm text-ink">{{ row.label }}</dt>
      <dd class="shrink-0 text-sm tabular-nums">
        <span class="font-semibold text-ink" :data-testid="`${prefix}-${row.id}`">{{ formatCurrency(row.value) }}</span>
        <span v-if="row.share !== null" class="text-ink-muted"> · {{ row.share }} %</span>
      </dd>
    </div>
  </dl>
</template>

<script setup>
import { computed } from 'vue'
import { formatCurrency } from '~/utils/currency'

const props = defineProps({
  // paymentSplit(): { card, cash, other } in euros
  split: { type: Object, required: true },
  // data-testid prefix: `<prefix>-card`, `<prefix>-cash`, `<prefix>-other`
  prefix: { type: String, required: true }
})

const LABELS = { card: 'Card', cash: 'Cash', other: 'Other' }

const rows = computed(() => {
  const total = props.split.card + props.split.cash + props.split.other
  return Object.entries(LABELS).map(([id, label]) => ({
    id,
    label,
    value: props.split[id],
    // Whole percent of the total; none when there is nothing to split
    share: total > 0 ? Math.round((props.split[id] / total) * 100) : null
  }))
})
</script>
