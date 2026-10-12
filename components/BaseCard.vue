<template>
  <section class="card overflow-hidden">
    <header v-if="title" class="flex items-center gap-3 px-4 pt-4 md:px-5 md:pt-5">
      <AppIcon v-if="icon" :name="icon" class="h-5 w-5 shrink-0 text-ink-muted" />
      <div class="min-w-0 flex-1">
        <h2 class="text-base font-semibold text-ink">{{ title }}</h2>
        <p v-if="subtitle" class="text-xs text-ink-muted">{{ subtitle }}</p>
      </div>
      <slot name="actions" />
    </header>
    <div :class="flush ? 'pt-2' : 'p-4 md:p-5'">
      <slot />
    </div>
  </section>
</template>

<script setup>
defineProps({
  title: { type: String, default: '' },
  subtitle: { type: String, default: '' },
  icon: { type: String, default: '' },
  flush: { type: Boolean, default: false }
})
</script>
