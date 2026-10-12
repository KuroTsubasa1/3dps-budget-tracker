<template>
  <div class="flex shrink-0 items-center rounded-lg border border-line bg-card">
    <button
      type="button"
      class="flex h-11 w-11 items-center justify-center text-ink-muted hover:text-ink"
      :aria-label="`Remove one ${name}`"
      @click.stop="$emit('decrement')"
    >
      <AppIcon name="minus" class="h-4 w-4" />
    </button>
    <span class="w-6 text-center text-sm font-semibold tabular-nums text-ink">{{ quantity }}</span>
    <button
      type="button"
      class="flex h-11 w-11 items-center justify-center text-ink-muted hover:text-ink"
      :aria-label="`Add one ${name}`"
      @click.stop="$emit('increment')"
    >
      <AppIcon name="plus" class="h-4 w-4" />
    </button>
  </div>
</template>

<script setup>
defineProps({
  quantity: { type: Number, required: true },
  name: { type: String, required: true }
})
defineEmits(['increment', 'decrement'])
</script>
