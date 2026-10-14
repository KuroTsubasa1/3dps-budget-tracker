<template>
  <BottomSheet :open="open" :title="title" @update:open="$emit('update:open', $event)">
    <div class="space-y-4">
      <!-- Always mounted, so screen readers hear its text change -->
      <p role="status" :class="allPicked ? 'rounded-lg bg-income/10 px-3 py-2 text-sm font-medium text-income' : 'sr-only'">{{ allPicked ? 'All prizes picked' : '' }}</p>
      <p class="sr-only" aria-live="polite" aria-atomic="true">{{ picks.length }} of {{ picks.length + openPrizes.count }} prizes picked</p>

      <template v-if="!allPicked">
        <div class="relative">
          <AppIcon name="search" class="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-muted" />
          <input v-model="query" type="text" class="input pl-9" placeholder="Search prizes..." aria-label="Search prizes" autocomplete="off">
        </div>

        <p v-if="!groups.length" class="text-sm text-ink-muted">
          {{ query.trim() ? 'No prizes match your search' : 'No prize articles in stock' }}
        </p>
        <section v-for="group in groups" :key="group.category.id" :aria-label="group.category.name">
          <h3 class="mb-1 text-xs font-medium uppercase tracking-wide text-ink-muted">{{ group.category.name }}</h3>
          <ul class="divide-y divide-line rounded-lg border border-line">
            <li v-for="article in group.articles" :key="article.id">
              <button
                type="button"
                class="flex min-h-[44px] w-full items-center justify-between gap-3 px-3 py-2 text-left hover:bg-muted focus:outline-none focus-visible:ring-2 focus-visible:ring-accent/50"
                @click="choose(article)"
              >
                <span class="min-w-0 break-words text-sm font-medium text-ink">{{ article.name }}</span>
                <span class="shrink-0 text-xs tabular-nums text-ink-muted">{{ article.stock }} left</span>
              </button>
            </li>
          </ul>
        </section>
      </template>

      <section v-if="picks.length" aria-label="Picked">
        <h3 class="mb-1 text-xs font-medium uppercase tracking-wide text-ink-muted">Picked</h3>
        <ul class="divide-y divide-line rounded-lg border border-line">
          <li v-for="item in picks" :key="item.id" class="flex items-center justify-between gap-2 py-1 pl-3 pr-1">
            <div class="min-w-0">
              <p class="break-words text-sm font-medium text-ink">{{ item.name }}</p>
              <p v-if="isWaiting(item)" class="text-xs text-ink-muted">Waiting to sync</p>
            </div>
            <BaseButton variant="ghost" :aria-label="`Undo ${item.name}`" @click="undoOne(item)">Undo</BaseButton>
          </li>
        </ul>
      </section>

      <BaseButton v-if="!allPicked" variant="secondary" block @click="$emit('update:open', false)">Later</BaseButton>
    </div>
  </BottomSheet>
</template>

<script setup>
import { ref, computed, watch, onBeforeUnmount } from 'vue'
import { useGatchaPrizes } from '~/composables/useGatchaPrizes'
import { prizeChoices } from '~/utils/gatcha'

const props = defineProps({
  open: { type: Boolean, default: false },
  // The catalog's articles, with the stock it shows
  articles: { type: Array, required: true },
  categories: { type: Array, required: true }
})
const emit = defineEmits(['update:open', 'picked', 'undone'])

// How long "All prizes picked" shows before the sheet closes
const CLOSE_AFTER_MS = 1200

const { openPrizes, picks, pick, undo, isWaiting, endRound } = useGatchaPrizes()

const query = ref('')
const allPicked = computed(() => openPrizes.value.count === 0 && picks.value.length > 0)
const title = computed(() => `Gatcha prizes · ${picks.value.length} of ${picks.value.length + openPrizes.value.count}`)
const groups = computed(() => prizeChoices({
  articles: props.articles,
  categories: props.categories,
  prizeCategories: openPrizes.value.categories,
  query: query.value
}))

const choose = (article) => {
  if (pick(article)) emit('picked', article.id)
}

const undoOne = (item) => {
  if (undo(item)) emit('undone', item.article)
}

// Every prize picked: say so, then close after a moment, unless an Undo opened one again meanwhile
let closeTimer = null
watch(allPicked, (done) => {
  clearTimeout(closeTimer)
  if (done && props.open) closeTimer = setTimeout(() => { if (allPicked.value) emit('update:open', false) }, CLOSE_AFTER_MS)
})

watch(() => props.open, (isOpen) => {
  if (isOpen) {
    query.value = ''
    return
  }
  clearTimeout(closeTimer)
  endRound()
})

onBeforeUnmount(() => clearTimeout(closeTimer))
</script>
