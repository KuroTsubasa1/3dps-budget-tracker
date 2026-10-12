<template>
  <div class="mb-4 flex items-start justify-between gap-3 md:mb-6">
    <div class="min-w-0">
      <h1 class="text-xl font-semibold text-ink">{{ title }}</h1>
      <p v-if="subtitle" class="mt-0.5 text-sm text-ink-muted">{{ subtitle }}</p>
    </div>
    <div v-if="$slots.actions" class="flex shrink-0 items-center gap-2">
      <slot name="actions" />
    </div>
  </div>
</template>

<script setup>
defineProps({
  title: { type: String, required: true },
  subtitle: { type: String, default: '' }
})
</script>
