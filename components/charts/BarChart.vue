<template>
  <svg :viewBox="`0 0 ${WIDTH} ${HEIGHT}`" class="block h-auto w-full" role="img" :aria-label="label">
    <line x1="0" :x2="WIDTH" :y1="BASE" :y2="BASE" class="stroke-line" stroke-width="1" />
    <text x="0" y="10" class="fill-ink-muted" font-size="10">{{ format(max) }}</text>
    <g v-for="group in groups" :key="group.index">
      <rect
        v-for="bar in group.bars"
        :key="bar.key"
        :x="bar.x"
        :y="bar.y"
        :width="bar.width"
        :height="bar.height"
        rx="2"
        :class="FILL[bar.tone] || FILL.accent"
      />
      <text v-if="group.showLabel" :x="group.center" :y="HEIGHT - 4" text-anchor="middle" class="fill-ink-muted" font-size="10">{{ group.label }}</text>
    </g>
  </svg>
</template>

<script setup>
import { computed } from 'vue'
import { formatCurrency } from '~/utils/currency'

// Plain SVG bars in the semantic colours, so they follow light and dark mode. Written out in full:
// Tailwind only keeps classes it can find in the code.
const FILL = { accent: 'fill-accent', income: 'fill-income', expense: 'fill-expense' }
const WIDTH = 320
const HEIGHT = 160
const TOP = 16
const BASE = HEIGHT - 18
// At most this many x labels; the others are skipped evenly
const MAX_LABELS = 8

const props = defineProps({
  // One label per group of bars (an hour, a week, a month)
  labels: { type: Array, required: true },
  // [{ name, values, tone }]: values line up with labels; tone is accent, income or expense
  series: { type: Array, required: true },
  // What the chart shows, read out by screen readers instead of the bars
  label: { type: String, required: true },
  format: { type: Function, default: formatCurrency }
})

const max = computed(() => Math.max(0, ...props.series.flatMap(item => item.values.map(value => Number(value) || 0))))

const groups = computed(() => {
  const count = Math.max(1, props.labels.length)
  const slot = WIDTH / count
  const barWidth = (slot * 0.7) / Math.max(1, props.series.length)
  const step = Math.ceil(count / MAX_LABELS)
  return props.labels.map((label, index) => ({
    index,
    label,
    center: slot * index + slot / 2,
    showLabel: index % step === 0,
    bars: props.series.map((item, position) => {
      const value = Math.max(0, Number(item.values[index]) || 0)
      const height = max.value > 0 ? (value / max.value) * (BASE - TOP) : 0
      return { key: item.name, tone: item.tone, x: slot * index + slot * 0.15 + barWidth * position, y: BASE - height, width: barWidth, height }
    })
  }))
})
</script>
