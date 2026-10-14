<template>
  <div class="space-y-4">
    <div class="flex items-baseline justify-between gap-3">
      <h3 class="text-sm font-semibold text-ink">Inventory</h3>
      <p class="text-sm text-ink-muted">
        In stock:
        <span class="text-lg font-semibold tabular-nums text-ink" data-testid="article-stock">{{ stock }}</span>
      </p>
    </div>

    <p v-if="error" role="alert" class="rounded-lg bg-expense/10 px-3 py-2 text-sm text-expense">{{ error }}</p>

    <p v-if="onBoard" class="rounded-lg bg-muted px-3 py-2 text-sm text-ink-muted" data-testid="print-board-hint">This article is on the print board — use Done there to add the batch</p>

    <form class="space-y-2" novalidate @submit.prevent="save">
      <div class="flex items-end gap-2">
        <div class="min-w-0 flex-1">
          <label for="inventory-now" class="label">Stock now</label>
          <input id="inventory-now" v-model="stockNow" type="text" inputmode="numeric" class="input" autocomplete="off">
        </div>
        <BaseButton type="submit" :loading="busy">Save</BaseButton>
      </div>
      <p v-if="notice" role="status" class="text-sm text-ink-muted">{{ notice }}</p>
    </form>

    <div>
      <h4 class="mb-1 text-xs font-medium uppercase tracking-wide text-ink-muted">Recent changes</h4>
      <p v-if="!movements.length" class="text-sm text-ink-muted">No stock changes yet</p>
      <ul v-else class="divide-y divide-line rounded-lg border border-line">
        <li v-for="movement in movements" :key="movement.id" class="flex items-center justify-between gap-3 px-3 py-2 text-sm">
          <div class="min-w-0">
            <p class="font-medium text-ink">{{ REASON_LABEL[movement.reason] }}</p>
            <p class="truncate text-xs text-ink-muted">
              {{ formatDateTime(movement.created) }}<template v-if="movement.note"> · {{ movement.note }}</template>
            </p>
          </div>
          <span class="shrink-0 font-semibold tabular-nums" :class="movement.change < 0 ? 'text-expense' : 'text-income'">
            {{ movement.change > 0 ? '+' : '' }}{{ movement.change }}
          </span>
        </li>
      </ul>
    </div>
  </div>
</template>

<script setup>
import { ref, onMounted } from 'vue'
import { useInventory } from '~/composables/useInventory'
import { usePrintJobs } from '~/composables/usePrintJobs'
import { stockNowMovement, newRecordId } from '~/utils/inventory'
import { formatDateTime } from '~/utils/date'

const props = defineProps({
  article: { type: Object, required: true }
})
const emit = defineEmits(['changed'])

const REASON_LABEL = { sale: 'Sold', printed: 'Printed', correction: 'Correction' }

const { applyMovements, listMovements } = useInventory()
const { findPrintingJob } = usePrintJobs()

const stock = ref(props.article.stock ?? 0)
const movements = ref([])
// Starts at the current stock, so the owner only changes the number
const stockNow = ref(String(stock.value))
const busy = ref(false)
const error = ref('')
const notice = ref('')
const onBoard = ref(false)

const loadMovements = async () => {
  movements.value = await listMovements(props.article.id)
}

onMounted(() => {
  // A printing job means Done on the board adds this batch; a locked or missing print_jobs just shows no hint
  findPrintingJob(props.article.id).then((job) => { onBoard.value = !!job }).catch(() => {})
  loadMovements().catch(() => { error.value = 'Could not load stock history' })
})

// Stock changes need the server: they are owner actions in the sheet, not part of offline selling.
// A higher count is recorded as printed, a lower one as a correction.
const save = async () => {
  error.value = ''
  notice.value = ''
  let movement
  try {
    movement = stockNowMovement(stock.value, stockNow.value)
  } catch (err) {
    error.value = err.message
    return
  }
  if (!movement) {
    notice.value = 'Stock unchanged'
    return
  }
  busy.value = true
  try {
    const stocks = await applyMovements([{ id: newRecordId(), article: props.article.id, ...movement }])
    stock.value = stocks[props.article.id]
    stockNow.value = String(stock.value)
    emit('changed', stock.value)
  } catch (err) {
    error.value = 'Could not save the stock change. Check your connection and try again.'
    return
  } finally {
    busy.value = false
  }
  loadMovements().catch(() => { error.value = 'Could not load stock history' })
}
</script>
