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
      class="min-h-[44px] truncate rounded-md font-medium transition-colors"
      :class="[
        dense ? 'px-1 text-xs sm:px-2 sm:text-sm' : 'px-2 text-sm',
        modelValue === option.value ? ['bg-card shadow-sm', option.activeClass || 'text-ink'] : 'text-ink-muted hover:text-ink'
      ]"
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
  options: { type: Array, required: true },
  // Smaller type on phones for long labels such as date formats
  dense: { type: Boolean, default: false }
})
defineEmits(['update:modelValue'])
</script>
