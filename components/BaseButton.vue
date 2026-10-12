<template>
  <button
    :type="type"
    :disabled="disabled || loading"
    class="btn"
    :class="[`btn-${variant}`, { 'btn-lg': size === 'lg', 'w-full': block }]"
  >
    <span v-if="loading" class="h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent" aria-hidden="true" />
    <AppIcon v-else-if="icon" :name="icon" class="h-4 w-4" />
    <slot />
  </button>
</template>

<script setup>
defineProps({
  variant: { type: String, default: 'primary' },
  size: { type: String, default: 'md' },
  type: { type: String, default: 'button' },
  icon: { type: String, default: '' },
  block: { type: Boolean, default: false },
  loading: { type: Boolean, default: false },
  disabled: { type: Boolean, default: false }
})
</script>
