<template>
  <section class="card min-w-0 p-2 md:p-4" aria-labelledby="month-title">
    <div class="mb-2 flex items-center justify-between gap-2">
      <button type="button" class="flex h-11 w-11 items-center justify-center rounded-lg text-ink-muted hover:bg-muted" aria-label="Previous month" @click="move(-1)">
        <AppIcon name="chevron-left" class="h-5 w-5" />
      </button>
      <h2 id="month-title" class="text-base font-semibold text-ink">{{ formatMonth(year, month) }}</h2>
      <button type="button" class="flex h-11 w-11 items-center justify-center rounded-lg text-ink-muted hover:bg-muted" aria-label="Next month" @click="move(1)">
        <AppIcon name="chevron-right" class="h-5 w-5" />
      </button>
    </div>

    <div class="grid grid-cols-7 text-center text-xs font-medium text-ink-muted" aria-hidden="true">
      <span v-for="name in WEEKDAYS" :key="name" class="py-1">{{ name }}</span>
    </div>
    <div class="grid grid-cols-7 gap-px" role="group" :aria-label="formatMonth(year, month)">
      <button
        v-for="day in days"
        :key="day.date"
        type="button"
        class="flex min-h-[48px] min-w-0 flex-col items-stretch gap-0.5 rounded-md px-0.5 pb-1 pt-0.5 text-xs transition-colors hover:bg-muted"
        :class="[day.inMonth ? 'text-ink' : 'text-ink-muted opacity-60', selected === day.date ? 'bg-accent/10' : '']"
        :aria-label="labelOf(day)"
        :aria-pressed="selected === day.date"
        @click="selected = day.date"
      >
        <span class="text-center tabular-nums" :class="day.date === today ? 'font-bold text-accent' : ''">{{ day.day }}</span>
        <span
          v-for="bar in day.bars.slice(0, 3)"
          :key="bar.id"
          class="h-1.5"
          :class="[
            bar.status === 'booked' ? 'bg-accent' : 'border border-accent',
            bar.starts ? 'ml-0.5 rounded-l-full' : '',
            bar.ends ? 'mr-0.5 rounded-r-full' : ''
          ]"
          data-testid="day-bar"
          :data-status="bar.status"
        />
        <span v-if="day.dots.length" class="flex justify-center gap-0.5">
          <span v-for="dot in day.dots.slice(0, 3)" :key="dot.id" class="h-1.5 w-1.5 rounded-full bg-warning" data-testid="day-dot" />
        </span>
      </button>
    </div>
    <p class="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-ink-muted">
      <span class="flex items-center gap-1"><span class="inline-block h-1.5 w-4 rounded-full bg-accent" />Booked</span>
      <span class="flex items-center gap-1"><span class="inline-block h-1.5 w-4 rounded-full border border-accent" />Applied or interested</span>
      <span class="flex items-center gap-1"><span class="inline-block h-1.5 w-1.5 rounded-full bg-warning" />Applications close</span>
    </p>

    <div v-if="selectedDay" class="mt-3 border-t border-line pt-3" data-testid="day-entries">
      <h3 class="mb-1 text-sm font-semibold text-ink">{{ formatDay(selectedDay.date) }}</h3>
      <p v-if="!entries.length" class="text-sm text-ink-muted">Nothing on this day</p>
      <ul v-else class="divide-y divide-line">
        <li v-for="entry in entries" :key="entry.key">
          <button type="button" class="flex min-h-[44px] w-full items-center gap-2 text-left text-sm text-ink hover:text-accent" @click="$emit('open', entry.convention)">
            <span class="min-w-0 flex-1 break-words">{{ entry.text }}</span>
            <AppIcon name="chevron-right" class="h-4 w-4 shrink-0 text-ink-muted" />
          </button>
        </li>
      </ul>
    </div>
  </section>
</template>

<script setup>
import { ref, computed } from 'vue'
import { monthGrid } from '~/utils/calendar/views'
import { formatDay, formatMonth, localDayKey } from '~/utils/calendar/dates'
import { STATUS_LABEL } from '~/utils/calendar/status'

const props = defineProps({
  conventions: { type: Array, required: true },
  now: { type: Date, required: true }
})
defineEmits(['open'])

const WEEKDAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']

const year = ref(props.now.getFullYear())
const month = ref(props.now.getMonth())
const selected = ref('')
const today = computed(() => localDayKey(props.now))

const move = (step) => {
  const next = new Date(year.value, month.value + step, 1)
  year.value = next.getFullYear()
  month.value = next.getMonth()
  selected.value = ''
}

const days = computed(() => monthGrid(year.value, month.value, props.conventions).flat())
const selectedDay = computed(() => days.value.find(day => day.date === selected.value) ?? null)
const byId = id => props.conventions.find(convention => convention.id === id)

// The day's conventions, then its application deadlines
const entries = computed(() => (selectedDay.value
  ? [
      ...selectedDay.value.bars.map(bar => ({ key: `bar-${bar.id}`, text: `${bar.name} (${STATUS_LABEL[bar.status]})`, convention: byId(bar.id) })),
      ...selectedDay.value.dots.map(dot => ({ key: `dot-${dot.id}`, text: `Applications close: ${dot.name}`, convention: byId(dot.id) }))
    ]
  : []))

const labelOf = (day) => {
  const parts = [...day.bars.map(bar => bar.name), ...day.dots.map(dot => `applications close: ${dot.name}`)]
  return parts.length ? `${formatDay(day.date)}: ${parts.join(', ')}` : formatDay(day.date)
}
</script>
