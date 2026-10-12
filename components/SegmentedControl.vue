<template>
  <div
    role="radiogroup"
    :aria-label="label"
    class="grid gap-1 rounded-lg bg-muted p-1"
    :style="{ gridTemplateColumns: `repeat(${options.length}, minmax(0, 1fr))` }"
  >
    <button
      v-for="option in options"
      :key="option.value"
      type="button"
      role="radio"
      :aria-checked="modelValue === option.value"
      class="min-h-[44px] truncate rounded-md px-2 text-sm font-medium transition-colors"
      :class="modelValue === option.value ? ['bg-card shadow-sm', option.activeClass || 'text-ink'] : 'text-ink-muted hover:text-ink'"
      @click="$emit('update:modelValue', option.value)"
    >
      {{ option.label }}
    </button>
  </div>
</template>

<script setup>
defineProps({
  modelValue: { type: [String, Number], required: true },
  label: { type: String, required: true },
  options: { type: Array, required: true }
})
defineEmits(['update:modelValue'])
</script>
