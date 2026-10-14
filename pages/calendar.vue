<template>
  <div>
    <PageHeader title="Calendar" subtitle="Conventions, applications and reminders">
      <template v-if="loadError !== 'missing'" #actions>
        <BaseButton icon="plus" :disabled="loading || readOnly" @click="openNew">New convention</BaseButton>
      </template>
    </PageHeader>

    <p v-if="savedAt" class="mb-3 flex flex-wrap items-center justify-between gap-2 rounded-lg bg-muted px-3 py-2 text-sm text-ink-muted" data-testid="saved-copy">
      Saved copy from {{ formatMoment(savedAt) }} · Needs a connection to edit
      <BaseButton variant="ghost" icon="refresh" @click="load">Try Again</BaseButton>
    </p>

    <div v-if="loading" class="card flex h-32 items-center justify-center text-sm text-ink-muted">Loading calendar...</div>
    <p v-else-if="loadError === 'missing'" class="card px-4 py-8 text-center text-sm text-ink-muted">The calendar isn't set up on the server yet</p>
    <div v-else-if="loadError" class="card px-4 py-6 text-center">
      <p class="mb-3 text-sm" :class="loadError === 'offline' ? 'font-medium text-ink' : 'text-expense'">
        {{ loadError === 'offline' ? 'Needs a connection' : 'Could not load the calendar. Check your connection and try again.' }}
      </p>
      <BaseButton variant="secondary" icon="refresh" @click="load">Try Again</BaseButton>
    </div>

    <template v-else>
      <SegmentedControl v-if="!isDesktop" v-model="view" class="mb-4" label="View" :options="VIEWS" />
      <div class="grid gap-4 lg:grid-cols-2 lg:items-start">
        <UpcomingList v-if="isDesktop || view === 'upcoming'" :conventions="conventions" :now="now" @open="openExisting" />
        <div v-if="isDesktop || view === 'month'" class="min-w-0">
          <!-- On lg+ the convention opens in place of the month grid (kept, so it stays on its month);
               the Upcoming list stays beside it -->
          <section v-if="isDesktop && panelOpen" class="card p-4 md:p-5" aria-labelledby="convention-panel-title">
            <div class="mb-3 flex items-center justify-between gap-3">
              <h2 id="convention-panel-title" class="min-w-0 break-words text-base font-semibold text-ink">{{ panelTitle }}</h2>
              <button type="button" class="-mr-2 flex h-11 w-11 shrink-0 items-center justify-center rounded-lg text-ink-muted hover:bg-muted" aria-label="Close" @click="closePanel">
                <AppIcon name="x" class="h-5 w-5" />
              </button>
            </div>
            <ConventionSheet :key="selectedId ?? 'new'" :convention="selected" :read-only="readOnly" @saved="onSaved" @changed="onChanged" @deleted="onDeleted" />
          </section>
          <MonthGrid v-show="!(isDesktop && panelOpen)" :conventions="conventions" :now="now" @open="openExisting" />
        </div>
      </div>
    </template>

    <BottomSheet v-if="!isDesktop" v-model:open="panelOpen" :title="panelTitle">
      <ConventionSheet :key="selectedId ?? 'new'" :convention="selected" :read-only="readOnly" @saved="onSaved" @changed="onChanged" @deleted="onDeleted" />
    </BottomSheet>
  </div>
</template>

<script setup>
import { ref, computed, watch, onMounted, onBeforeUnmount } from 'vue'
import ConventionSheet from '~/components/calendar/ConventionSheet.vue'
import MonthGrid from '~/components/calendar/MonthGrid.vue'
import UpcomingList from '~/components/calendar/UpcomingList.vue'
import { useConventions } from '~/composables/useConventions'
import { useMediaQuery } from '~/composables/useMediaQuery'
import { formatMoment } from '~/utils/calendar/dates'

definePageMeta({ middleware: 'owner' })

const VIEWS = [
  { value: 'upcoming', label: 'Upcoming' },
  { value: 'month', label: 'Month' }
]

const { listConventions, saveCopy, savedCopy } = useConventions()
const route = useRoute()
const router = useRouter()
const isDesktop = useMediaQuery('(min-width: 1024px)')

const conventions = ref([])
const loading = ref(true)
// '' | 'missing' (no collection yet, or still locked) | 'offline' | 'failed'
const loadError = ref('')
// Set while the list is the saved copy from an earlier visit
const savedAt = ref(null)
const offline = ref(false)
const now = ref(new Date())
const view = ref('upcoming')
const selectedId = ref(null)
const creating = ref(false)

const readOnly = computed(() => offline.value || !!savedAt.value)
const selected = computed(() => conventions.value.find(item => item.id === selectedId.value) ?? null)
const panelOpen = computed({
  get: () => creating.value || !!selected.value,
  set: (open) => { if (!open) closePanel() }
})
const panelTitle = computed(() => (creating.value ? 'New convention' : selected.value?.name ?? 'Convention'))

const isOffline = () => typeof navigator !== 'undefined' && !navigator.onLine

let loadingNow = false
let loadedOnce = false
const load = async () => {
  if (loadingNow) return
  loadingNow = true
  // Only the first load (or a retry after an error) replaces the page with a spinner; a reload in the
  // background must not unmount the open convention
  const background = loadedOnce && !loadError.value
  if (!background) loading.value = true
  loadError.value = ''
  offline.value = isOffline()
  now.value = new Date()
  try {
    const list = await listConventions()
    conventions.value = list
    savedAt.value = null
    saveCopy(list)
    loadedOnce = true
  } catch (err) {
    if (err?.status === 404 || err?.status === 403) {
      loadError.value = 'missing'
    } else {
      const copy = savedCopy()
      if (copy) {
        conventions.value = copy.items
        savedAt.value = new Date(copy.savedAt)
        loadedOnce = true
      } else {
        loadError.value = isOffline() || err?.status === 0 ? 'offline' : 'failed'
      }
    }
  } finally {
    loading.value = false
    loadingNow = false
  }
  openFromQuery()
}

// /calendar?c=<id> (a notification, the dashboard card) opens that convention
const openFromQuery = () => {
  const id = route.query.c
  if (typeof id === 'string' && conventions.value.some(item => item.id === id)) {
    creating.value = false
    selectedId.value = id
  }
}
watch(() => route.query.c, openFromQuery)

const openNew = () => {
  selectedId.value = null
  creating.value = true
}

const openExisting = (convention) => {
  creating.value = false
  selectedId.value = convention.id
}

const closePanel = () => {
  creating.value = false
  selectedId.value = null
  if (route.query.c) router.replace({ query: {} })
}

const remember = () => saveCopy(conventions.value)

const onSaved = (record) => {
  conventions.value = [...conventions.value, record]
  remember()
  creating.value = false
  selectedId.value = record.id
}

const onChanged = (record) => {
  conventions.value = conventions.value.map(item => (item.id === record.id ? record : item))
  remember()
}

const onDeleted = (id) => {
  conventions.value = conventions.value.filter(item => item.id !== id)
  remember()
  closePanel()
}

const goneOffline = () => { offline.value = true }

onMounted(() => {
  window.addEventListener('online', load)
  window.addEventListener('offline', goneOffline)
  load()
})

onBeforeUnmount(() => {
  window.removeEventListener('online', load)
  window.removeEventListener('offline', goneOffline)
})
</script>
