<template>
  <!-- Top of the screen on phones keeps toasts clear of the add button and cart bar -->
  <div
    class="pointer-events-none fixed inset-x-4 top-[calc(4rem+env(safe-area-inset-top))] z-[60] flex flex-col items-center gap-2 md:inset-x-auto md:bottom-6 md:right-6 md:top-auto md:items-end print:hidden"
    aria-live="polite"
  >
    <slot />
    <TransitionGroup name="toast">
      <div
        v-for="item in toasts"
        :key="item.id"
        role="status"
        class="pointer-events-auto flex w-full max-w-sm items-start gap-3 rounded-xl border border-line bg-card py-2 pl-4 pr-1 text-sm text-ink shadow-lg"
      >
        <AppIcon :name="item.tone === 'success' ? 'check' : 'exclamation'" class="mt-2.5 h-5 w-5 shrink-0" :class="TONE_CLASS[item.tone]" />
        <p class="flex-1 py-2">{{ item.message }}</p>
        <button
          type="button"
          class="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg text-ink-muted hover:bg-muted"
          aria-label="Dismiss"
          @click="dismiss(item.id)"
        >
          <AppIcon name="x" class="h-4 w-4" />
        </button>
      </div>
    </TransitionGroup>
  </div>
</template>

<script setup>
import { useToast } from '~/composables/useToast'

const TONE_CLASS = {
  success: 'text-income',
  warning: 'text-warning',
  error: 'text-expense'
}

const { toasts, dismiss } = useToast()
</script>
