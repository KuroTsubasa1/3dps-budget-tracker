<template>
  <component
    :is="clickable ? 'button' : 'div'"
    :type="clickable ? 'button' : undefined"
    class="flex min-h-[56px] w-full items-center gap-3 px-4 py-3 text-left md:px-5"
    :class="{ 'transition-colors hover:bg-muted focus:outline-none focus-visible:bg-muted': clickable }"
  >
    <div v-if="icon" class="flex h-10 w-10 shrink-0 items-center justify-center rounded-full" :class="iconClass">
      <AppIcon :name="icon" class="h-5 w-5" />
    </div>
    <div class="min-w-0 flex-1">
      <p class="truncate text-sm font-medium text-ink">{{ title }}</p>
      <p v-if="subtitle" class="truncate text-xs text-ink-muted">{{ subtitle }}</p>
    </div>
    <slot name="trailing" />
    <AppIcon v-if="clickable" name="chevron-right" class="h-4 w-4 shrink-0 text-ink-muted" />
  </component>
</template>

<script setup>
defineProps({
  title: { type: String, required: true },
  subtitle: { type: String, default: '' },
  icon: { type: String, default: '' },
  iconClass: { type: String, default: 'bg-muted text-ink-muted' },
  clickable: { type: Boolean, default: false }
})
</script>
