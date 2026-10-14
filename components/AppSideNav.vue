<template>
  <nav class="fixed inset-y-0 left-0 z-30 hidden w-20 flex-col border-r border-line bg-card md:flex lg:w-60 print:hidden" aria-label="Primary">
    <div class="flex h-14 items-center justify-center border-b border-line px-4 lg:justify-start">
      <img src="/logo.svg" alt="Akinai logo" class="h-8 w-8 shrink-0">
      <span class="ml-2 hidden text-base font-semibold text-ink lg:inline">Akinai</span>
    </div>
    <ul class="flex-1 space-y-1 p-3">
      <li v-for="item in NAV_ITEMS" :key="item.to">
        <NuxtLink
          :to="item.to"
          :aria-label="item.label"
          :title="item.label"
          class="flex min-h-[44px] items-center justify-center gap-3 rounded-lg px-3 text-sm font-medium transition-colors lg:justify-start"
          :class="isActivePath($route.path, item.to) ? 'bg-accent/10 text-accent' : 'text-ink-muted hover:bg-muted hover:text-ink'"
        >
          <AppIcon :name="item.icon" class="h-5 w-5 shrink-0" />
          <span class="hidden lg:inline">{{ item.label }}</span>
        </NuxtLink>
      </li>
    </ul>
  </nav>
</template>

<script setup>
import { NAV_ITEMS, isActivePath } from '~/utils/navigation'
</script>
