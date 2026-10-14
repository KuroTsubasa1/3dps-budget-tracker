<template>
  <svg :viewBox="`0 0 ${WIDTH} ${HEIGHT}`" class="block h-auto w-full" role="img" :aria-label="label">
    <line x1="0" :x2="WIDTH" :y1="zeroY" :y2="zeroY" class="stroke-line" stroke-width="1" />
    <text x="0" y="10" class="fill-ink-muted" font-size="10">{{ format(scale.high) }}</text>
    <polyline
      :points="points.map(point => `${point.x},${point.y}`).join(' ')"
      fill="none"
      :class="STROKE[tone] || STROKE.accent"
      stroke-width="2"
      stroke-linejoin="round"
      stroke-linecap="round"
    />
    <circle v-for="point in points" :key="point.index" :cx="point.x" :cy="point.y" r="2.5" :class="FILL[tone] || FILL.accent" />
    <template v-for="point in points" :key="`label-${point.index}`">
      <text v-if="point.showLabel" :x="point.x" :y="HEIGHT - 4" text-anchor="middle" class="fill-ink-muted" font-size="10">{{ point.label }}</text>
    </template>
  </svg>
</template>

<script setup>
import { computed } from 'vue'
import { formatCurrency } from '~/utils/currency'

// A plain SVG line in a semantic colour; the zero line shows when values go below 0.
// Written out in full: Tailwind only keeps classes it can find in the code.
const STROKE = { accent: 'stroke-accent', income: 'stroke-income', expense: 'stroke-expense' }
const FILL = { accent: 'fill-accent', income: 'fill-income', expense: 'fill-expense' }
const WIDTH = 320
const HEIGHT = 160
const TOP = 16
const BASE = HEIGHT - 18
const PAD = 12
const MAX_LABELS = 8

const props = defineProps({
  labels: { type: Array, required: true },
  // One value per label
  values: { type: Array, required: true },
  // What the chart shows, read out by screen readers instead of the line
  label: { type: String, required: true },
  tone: { type: String, default: 'accent' },
  format: { type: Function, default: formatCurrency }
})

// The scale always includes 0, so a balance below zero sits under the zero line
const scale = computed(() => {
  const values = props.values.map(value => Number(value) || 0)
  const low = Math.min(0, ...values)
  const high = Math.max(0, ...values)
  return { low, high: high === low ? low + 1 : high }
})
const yOf = value => BASE - ((value - scale.value.low) / (scale.value.high - scale.value.low)) * (BASE - TOP)
const zeroY = computed(() => yOf(0))

const points = computed(() => {
  const count = props.values.length
  const step = Math.ceil(Math.max(1, count) / MAX_LABELS)
  return props.values.map((value, index) => ({
    index,
    label: props.labels[index],
    showLabel: index % step === 0,
    x: count > 1 ? PAD + index * ((WIDTH - 2 * PAD) / (count - 1)) : WIDTH / 2,
    y: yOf(Number(value) || 0)
  }))
})
</script>
