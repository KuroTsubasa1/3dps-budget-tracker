<template>
  <button
    :type="type"
    :disabled="disabled || loading"
    class="btn"
    :class="[VARIANT_CLASSES[variant] ?? VARIANT_CLASSES.primary, { 'btn-lg': size === 'lg', 'w-full': block }]"
  >
    <span v-if="loading" class="h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent" aria-hidden="true" />
    <AppIcon v-else-if="icon" :name="icon" class="h-4 w-4" />
    <slot />
  </button>
</template>

<script setup>
// Written out in full: Tailwind only keeps classes it can find in the code, so `btn-${variant}` would be dropped
const VARIANT_CLASSES = {
  primary: 'btn-primary',
  secondary: 'btn-secondary',
  ghost: 'btn-ghost',
  danger: 'btn-danger',
  link: 'btn-link',
  'danger-ghost': 'btn-danger-ghost'
}

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
