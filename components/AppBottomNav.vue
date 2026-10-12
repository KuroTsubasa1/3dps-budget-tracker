<template>
  <nav class="fixed inset-x-0 bottom-0 z-40 border-t border-line bg-card pb-safe md:hidden print:hidden" aria-label="Primary">
    <ul class="grid grid-cols-5">
      <li v-for="item in NAV_ITEMS" :key="item.to">
        <NuxtLink
          :to="item.to"
          :aria-label="item.label"
          class="flex h-16 flex-col items-center justify-center gap-1 text-[11px] font-medium transition-colors"
          :class="isActivePath($route.path, item.to) ? 'text-accent' : 'text-ink-muted'"
        >
          <AppIcon :name="item.icon" class="h-6 w-6" />
          {{ item.shortLabel }}
        </NuxtLink>
      </li>
    </ul>
  </nav>
</template>

<script setup>
import { NAV_ITEMS, isActivePath } from '~/utils/navigation'
</script>
