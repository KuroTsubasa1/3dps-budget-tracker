<template>
  <nav class="fixed inset-x-0 bottom-0 z-40 border-t border-line bg-card pb-safe md:hidden print:hidden" aria-label="Primary">
    <ul class="grid grid-cols-5">
      <li v-for="item in PHONE_TABS" :key="item.to">
        <NuxtLink
          :to="item.to"
          :aria-label="item.label"
          :class="[TAB_CLASS, isActivePath(route.path, item.to) ? 'text-accent' : 'text-ink-muted']"
        >
          <AppIcon :name="item.icon" class="h-6 w-6" />
          <span class="max-w-full truncate px-1">{{ item.shortLabel }}</span>
        </NuxtLink>
      </li>
      <li>
        <button
          type="button"
          :class="[TAB_CLASS, 'w-full', moreActive ? 'text-accent' : 'text-ink-muted']"
          :aria-current="moreActive ? 'page' : undefined"
          aria-haspopup="dialog"
          :aria-expanded="moreOpen"
          @click="moreOpen = true"
        >
          <AppIcon name="dots" class="h-6 w-6" />
          More
        </button>
      </li>
    </ul>

    <BottomSheet v-model:open="moreOpen" title="More">
      <ul class="-mx-4 divide-y divide-line md:-mx-6">
        <li v-for="item in MORE_ITEMS" :key="item.to">
          <ListRow
            :to="item.to"
            :title="item.label"
            :icon="item.icon"
            :icon-class="isActivePath(route.path, item.to) ? 'bg-accent/10 text-accent' : 'bg-muted text-ink-muted'"
          />
        </li>
      </ul>
    </BottomSheet>
  </nav>
</template>

<script setup>
import { ref, computed, watch } from 'vue'
import { PHONE_TABS, MORE_ITEMS, isActivePath, isMoreActive } from '~/utils/navigation'

const TAB_CLASS = 'flex h-16 flex-col items-center justify-center gap-1 text-[11px] font-medium transition-colors'

const route = useRoute()
const moreOpen = ref(false)
// More stands in for Reports, Business Card and Settings, so it lights up on those pages
const moreActive = computed(() => isMoreActive(route.path))

// Picking a page in the sheet (or any other navigation) closes it
watch(() => route.path, () => { moreOpen.value = false })
</script>
