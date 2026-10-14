<template>
  <div>
    <PageHeader title="Commissions" subtitle="Made-to-order prints">
      <template #actions>
        <BaseButton icon="plus" @click="openNew">New commission</BaseButton>
      </template>
    </PageHeader>

    <div class="no-scrollbar -mx-4 mb-4 flex gap-2 overflow-x-auto px-4 md:mx-0 md:flex-wrap md:px-0" role="group" aria-label="Commission status">
      <button
        v-for="tab in TABS"
        :key="tab.id"
        type="button"
        class="chip"
        :class="activeTab === tab.id ? 'chip-active' : 'chip-idle'"
        :aria-pressed="activeTab === tab.id"
        @click="activeTab = tab.id"
      >
        {{ tab.label }}
        <span class="tabular-nums">{{ counts[tab.id] }}</span>
      </button>
    </div>

    <div v-if="loading" class="card flex h-32 items-center justify-center text-sm text-ink-muted">Loading commissions...</div>
    <div v-else-if="loadError" class="card px-4 py-6 text-center">
      <p class="mb-3 text-sm text-expense">{{ loadError }}</p>
      <BaseButton variant="secondary" icon="refresh" @click="load">Try Again</BaseButton>
    </div>
    <p v-else-if="!visible.length" class="card px-4 py-8 text-center text-sm text-ink-muted">No commissions here</p>
    <div v-else class="card divide-y divide-line overflow-hidden">
      <ListRow
        v-for="item in visible"
        :key="item.id"
        clickable
        :title="item.anonymised_at ? 'Anonymised' : item.customer_name"
        :subtitle="subtitleOf(item)"
        @click="openExisting(item)"
      >
        <template #trailing>
          <span class="shrink-0 text-sm font-semibold tabular-nums text-ink">{{ formatCurrency(Number(item.agreed_price)) }}</span>
        </template>
      </ListRow>
    </div>

    <CommissionSheet
      v-model:open="sheetOpen"
      :commission="selected"
      :articles="articles"
      :deals="deals"
      :preset-items="presetItems"
      @saved="onSaved"
      @changed="onChanged"
    />
  </div>
</template>

<script setup>
import { ref, computed, onMounted } from 'vue'
import { useCommissions } from '~/composables/useCommissions'
import { useArticles } from '~/composables/useArticles'
import { useDeals } from '~/composables/useDeals'
import { useToast } from '~/composables/useToast'
import { useCommissionDraft } from '~/composables/useCommissionDraft'
import { formatCurrency } from '~/utils/currency'
import { isFinal, summaryOf } from '~/utils/commissions'

definePageMeta({ middleware: 'owner' })

const TABS = [
  { id: 'open', label: 'Open' },
  { id: 'printing', label: 'Printing' },
  { id: 'ready', label: 'Ready' },
  { id: 'done', label: 'Done' }
]

const { listCommissions, anonymiseDue } = useCommissions()
const { listActive } = useArticles()
const { listDeals } = useDeals()
const { toast } = useToast()
const { takeDraft } = useCommissionDraft()

const commissions = ref([])
const articles = ref([])
const deals = ref([])
const loading = ref(true)
const loadError = ref('')
const activeTab = ref('open')
const sheetOpen = ref(false)
const selected = ref(null)
const presetItems = ref([])

const tabOf = commission => (isFinal(commission.status) ? 'done' : commission.status)
const counts = computed(() => Object.fromEntries(TABS.map(tab => [tab.id, commissions.value.filter(item => tabOf(item) === tab.id).length])))
const visible = computed(() => commissions.value.filter(item => tabOf(item) === activeTab.value))
// The customer is the row title; the subtitle is the line summary and the delivery
const subtitleOf = item =>
  [summaryOf(item, articles.value), item.fulfilment === 'shipping' ? 'Ship' : 'Pickup'].filter(Boolean).join(' · ')

// The cart lines are taken once, when the page first loads, and kept here for Try Again:
// leaving the page drops them, so a later visit never reopens an old cart
let draftLines = null

const load = async () => {
  if (draftLines === null) draftLines = takeDraft()
  loading.value = true
  loadError.value = ''
  try {
    const [list, articleList, dealList] = await Promise.all([
      listCommissions(),
      listActive(),
      // A deploy made before the migration has no deals yet: price without them
      listDeals().catch(err => (err?.status === 404 ? [] : Promise.reject(err)))
    ])
    articles.value = articleList
    deals.value = dealList
    const { changed, failed } = await anonymiseDue(list)
    commissions.value = changed.length ? await listCommissions() : list
    if (failed.length) toast('Some customer data could not be anonymised — it will be retried next time', { tone: 'warning', duration: 6000 })
    openDraft()
  } catch (err) {
    loadError.value = 'Could not load commissions. Check your connection and try again.'
  } finally {
    loading.value = false
  }
}

onMounted(load)

// Cart lines from the catalog open the new-commission form once, after the articles and deals are loaded
// (so the price suggestion has them). A failed load keeps the lines for Try Again.
const openDraft = () => {
  const lines = draftLines || []
  draftLines = []
  if (!lines.length) return
  presetItems.value = lines
  selected.value = null
  sheetOpen.value = true
}

const openNew = () => {
  presetItems.value = []
  selected.value = null
  sheetOpen.value = true
}

const openExisting = (item) => {
  selected.value = item
  sheetOpen.value = true
}

const onSaved = (record) => {
  commissions.value = [record, ...commissions.value]
  activeTab.value = 'open'
}

const onChanged = (record) => {
  commissions.value = commissions.value.map(item => (item.id === record.id ? record : item))
  selected.value = record
}
</script>
