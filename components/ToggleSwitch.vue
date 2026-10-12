<template>
  <label class="flex min-h-[44px] cursor-pointer items-center justify-between gap-4 py-1" :class="{ 'cursor-not-allowed opacity-50': disabled }">
    <span class="min-w-0">
      <span class="block text-sm font-medium text-ink">{{ label }}</span>
      <span v-if="description" class="block text-xs text-ink-muted">{{ description }}</span>
    </span>
    <button
      type="button"
      role="switch"
      :aria-checked="modelValue"
      :disabled="disabled"
      class="relative inline-flex h-7 w-12 shrink-0 items-center rounded-full transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-accent/50"
      :class="modelValue ? 'bg-accent' : 'bg-line'"
      @click="$emit('update:modelValue', !modelValue)"
    >
      <span class="inline-block h-5 w-5 rounded-full bg-white shadow transition-transform" :class="modelValue ? 'translate-x-6' : 'translate-x-1'" />
    </button>
  </label>
</template>

<script setup>
defineProps({
  modelValue: { type: Boolean, default: false },
  label: { type: String, required: true },
  description: { type: String, default: '' },
  disabled: { type: Boolean, default: false }
})
defineEmits(['update:modelValue'])
</script>
