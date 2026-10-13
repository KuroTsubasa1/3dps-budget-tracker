<template>
  <div>
    <PageHeader title="Print board" />

    <p v-if="error" role="alert" class="mb-4 rounded-lg bg-expense/10 px-3 py-2 text-sm text-expense">{{ error }}</p>
    <p v-if="jobsMissing" class="mb-4 rounded-lg bg-muted px-3 py-2 text-sm text-ink-muted">Run the migration to enable the print board</p>

    <div class="no-scrollbar -mx-4 mb-4 flex gap-2 overflow-x-auto px-4 md:mx-0 md:flex-wrap md:px-0 lg:hidden" role="group" aria-label="Print board columns">
      <button
        v-for="column in COLUMNS"
        :key="column.id"
        type="button"
        class="chip"
        :class="activeColumn === column.id ? 'chip-active' : 'chip-idle'"
        :aria-pressed="activeColumn === column.id"
        @click="activeColumn = column.id"
      >
        {{ column.label }}
        <span class="tabular-nums">{{ board[column.id].length }}</span>
      </button>
    </div>

    <div v-if="loading" class="card flex h-32 items-center justify-center text-sm text-ink-muted">Loading the print board...</div>
    <div v-else-if="loadError" class="card px-4 py-6 text-center">
      <p class="mb-3 text-sm text-expense">{{ loadError }}</p>
      <BaseButton variant="secondary" icon="refresh" @click="load">Try Again</BaseButton>
    </div>
    <div v-else class="grid gap-4 lg:grid-cols-3 lg:items-start">
      <section
        v-for="column in COLUMNS"
        :key="column.id"
        :aria-label="column.label"
        class="min-w-0 space-y-3"
        :class="activeColumn === column.id ? 'block' : 'hidden lg:block'"
      >
        <h2 class="hidden items-center justify-between text-sm font-semibold text-ink lg:flex">
          {{ column.label }}
          <span class="tabular-nums text-ink-muted">{{ board[column.id].length }}</span>
        </h2>
        <p v-if="!board[column.id].length" class="card px-4 py-8 text-center text-sm text-ink-muted">{{ column.empty }}</p>
        <article
          v-for="card in board[column.id]"
          :key="keyOf(card)"
          :aria-label="titleOf(card)"
          class="card space-y-3 p-4"
        >
          <div class="min-w-0">
            <h3 class="break-words text-sm font-semibold text-ink">{{ titleOf(card) }}</h3>
            <p class="break-words text-xs text-ink-muted">{{ detailOf(card) }}</p>
            <p v-if="card.kind === 'commission' && card.commission.notes" class="mt-1 whitespace-pre-line break-words text-xs text-ink-muted">{{ card.commission.notes }}</p>
          </div>

          <div v-if="column.id === 'toPrint' && card.kind === 'stock'" class="flex flex-wrap items-center justify-between gap-2">
            <QuantityStepper
              :quantity="quantityFor(card)"
              :name="card.article.name"
              @increment="setQuantity(card, quantityFor(card) + 1)"
              @decrement="setQuantity(card, quantityFor(card) - 1)"
            />
            <BaseButton icon="printer" :loading="busy === keyOf(card)" :disabled="!!busy" @click="start(card)">Print {{ quantityFor(card) }}</BaseButton>
          </div>
          <BaseButton
            v-else-if="column.id === 'toPrint'"
            block
            :loading="busy === keyOf(card)"
            :disabled="!!busy"
            @click="moveCommission(card.commission, 'printing')"
          >
            Start
          </BaseButton>
          <div v-else-if="column.id === 'printing'" class="grid grid-cols-2 gap-2">
            <BaseButton icon="check" :loading="busy === keyOf(card)" :disabled="!!busy" @click="done(card)">Done</BaseButton>
            <BaseButton variant="secondary" :disabled="!!busy" @click="back(card)">Back</BaseButton>
          </div>
          <p v-else class="text-sm font-medium" :class="card.kind === 'job' ? 'text-income' : 'text-accent'">
            {{ card.kind === 'job' ? `+${card.job.quantity} to stock` : 'Commission ready' }}
          </p>
        </article>
      </section>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, onMounted } from 'vue'
import { usePrintJobs, staleError } from '~/composables/usePrintJobs'
import { useCommissions } from '~/composables/useCommissions'
import { buildBoard, targetFor } from '~/utils/printBoard'
import { transitionPatch } from '~/utils/commissions'

definePageMeta({ middleware: 'owner' })

const COLUMNS = [
  { id: 'toPrint', label: 'To print', empty: 'Nothing to print' },
  { id: 'printing', label: 'Printing', empty: 'Nothing printing' },
  { id: 'doneToday', label: 'Done today', empty: 'Nothing done today yet' }
]
const OFFLINE = "You're offline — the print board needs a connection"

const { loadBoardData, startJob, finishJob, cancelJob } = usePrintJobs()
const { getCommission, updateCommission } = useCommissions()

const data = ref({ articles: [], jobs: [], commissions: [] })
const now = ref(new Date())
const jobsMissing = ref(false)
const loading = ref(true)
const loadError = ref('')
const error = ref('')
const busy = ref('')
const activeColumn = ref('toPrint')
const quantities = ref({})
let loaded = false

const board = computed(() => buildBoard({ ...data.value, now: now.value }))

const isOffline = err => (typeof navigator !== 'undefined' && !navigator.onLine) || err?.status === 0
// Refusals carry their own message; anything else is offline or a generic failure
const messageFor = (err) => {
  if (err?.code === 'stale' || err?.code === 'already_printing') return err.message
  return isOffline(err) ? OFFLINE : 'Could not update the print board. Try again.'
}

const keyOf = (card) => {
  if (card.kind === 'commission') return `commission:${card.commission.id}`
  return card.kind === 'job' ? `job:${card.job.id}` : `stock:${card.article.id}`
}
const customerOf = commission => (commission.anonymised_at ? 'Anonymised' : commission.customer_name)
const titleOf = card => (card.kind === 'commission' ? `Commission · ${customerOf(card.commission)}` : (card.article?.name ?? 'Unknown article'))
const detailOf = (card) => {
  if (card.kind === 'stock') return `${Number(card.article.stock)} left · target ${targetFor(card.article)}`
  if (card.kind === 'job') return `Stock print × ${card.job.quantity}`
  return `${card.commission.expand?.article?.name ?? 'Unknown article'} × ${card.commission.quantity}`
}

const quantityFor = card => quantities.value[card.article.id] ?? card.quantity
// A print job always prints at least one
const setQuantity = (card, value) => {
  quantities.value = { ...quantities.value, [card.article.id]: Math.max(1, value) }
}

const load = async () => {
  if (!loaded) loading.value = true
  try {
    const result = await loadBoardData()
    data.value = result
    jobsMissing.value = result.jobsMissing
    now.value = new Date()
    loadError.value = ''
    loaded = true
  } catch (err) {
    // A failed refresh keeps the last board; only a failed first load replaces it
    if (loaded) error.value = messageFor(err)
    else loadError.value = isOffline(err) ? OFFLINE : 'Could not load the print board. Check your connection and try again.'
  } finally {
    loading.value = false
  }
}

onMounted(load)

// Every action re-lists the board; a refusal re-lists too, so the screen shows what changed elsewhere
const run = async (key, action) => {
  if (busy.value) return
  busy.value = key
  error.value = ''
  try {
    await action()
    await load()
  } catch (err) {
    error.value = messageFor(err)
    if (err?.code === 'stale' || err?.code === 'already_printing') await load()
  } finally {
    busy.value = ''
  }
}

const start = card => run(keyOf(card), async () => {
  await startJob(card.article, quantityFor(card))
  quantities.value = Object.fromEntries(Object.entries(quantities.value).filter(([id]) => id !== card.article.id))
})

// Another device may have moved the commission: act only on the status this board shows
const moveCommission = (commission, target) => run(`commission:${commission.id}`, async () => {
  const current = await getCommission(commission.id)
  if (current.status !== commission.status) throw staleError()
  await updateCommission(commission.id, transitionPatch(current, target))
})

const done = card => (card.kind === 'job'
  ? run(keyOf(card), () => finishJob(card.job))
  : moveCommission(card.commission, 'ready'))

const back = card => (card.kind === 'job'
  ? run(keyOf(card), () => cancelJob(card.job))
  : moveCommission(card.commission, 'open'))
</script>
