<template>
  <div class="min-w-0 space-y-4" data-testid="upcoming">
    <p v-if="!conventions.length" class="card px-4 py-8 text-center text-sm text-ink-muted">No conventions yet. Add the first one with New convention.</p>

    <section v-if="view.openApplications.length" class="card overflow-hidden" aria-labelledby="upcoming-open">
      <h2 id="upcoming-open" class="px-4 pt-4 text-base font-semibold text-ink md:px-5">Open applications</h2>
      <ul class="divide-y divide-line">
        <li v-for="item in view.openApplications" :key="item.convention.id">
          <button type="button" :class="ROW" @click="$emit('open', item.convention)">
            <span class="min-w-0 flex-1">
              <span class="block break-words text-sm font-medium text-ink">{{ item.convention.name }}</span>
              <span class="block text-xs" :class="item.daysLeft <= 7 ? 'font-medium text-warning' : 'text-ink-muted'">Applications close {{ inDays(item.daysLeft) }}</span>
            </span>
            <AppIcon name="chevron-right" class="h-4 w-4 shrink-0 text-ink-muted" />
          </button>
        </li>
      </ul>
    </section>

    <section v-for="group in view.byMonth" :key="group.key" class="card overflow-hidden" :aria-labelledby="`upcoming-${group.key}`">
      <h2 :id="`upcoming-${group.key}`" class="px-4 pt-4 text-base font-semibold text-ink md:px-5">{{ group.label }}</h2>
      <ul class="divide-y divide-line">
        <li v-for="convention in group.conventions" :key="convention.id">
          <button type="button" :class="ROW" @click="$emit('open', convention)">
            <span class="min-w-0 flex-1">
              <span class="block break-words text-sm font-medium text-ink">{{ convention.name }}</span>
              <span v-if="whereAndWhen(convention)" class="block break-words text-xs text-ink-muted">{{ whereAndWhen(convention) }}</span>
              <span v-if="convention.status === 'applied' && dayKey(convention.results_expected)" class="block text-xs text-ink-muted">
                Results expected {{ formatDay(dayKey(convention.results_expected)) }}
              </span>
            </span>
            <StatusChip :label="displayStatus(convention, now)" />
          </button>
        </li>
      </ul>
    </section>

    <section v-if="view.past.length" class="card overflow-hidden">
      <button
        type="button"
        class="flex min-h-[56px] w-full items-center justify-between gap-3 px-4 text-left text-base font-semibold text-ink md:px-5"
        :aria-expanded="pastOpen"
        @click="pastOpen = !pastOpen"
      >
        Past ({{ view.past.length }})
        <AppIcon :name="pastOpen ? 'chevron-up' : 'chevron-down'" class="h-4 w-4 text-ink-muted" />
      </button>
      <ul v-if="pastOpen" class="divide-y divide-line border-t border-line" aria-label="Past conventions">
        <li v-for="convention in view.past" :key="convention.id">
          <button type="button" :class="ROW" @click="$emit('open', convention)">
            <span class="min-w-0 flex-1">
              <span class="block break-words text-sm font-medium text-ink">{{ convention.name }}</span>
              <span v-if="whereAndWhen(convention)" class="block break-words text-xs text-ink-muted">{{ whereAndWhen(convention) }}</span>
            </span>
            <StatusChip :label="displayStatus(convention, now)" />
          </button>
        </li>
      </ul>
    </section>
  </div>
</template>

<script setup>
import { ref, computed } from 'vue'
import StatusChip from '~/components/calendar/StatusChip.vue'
import { upcoming, displayStatus } from '~/utils/calendar/views'
import { dayKey, formatDay, inDays } from '~/utils/calendar/dates'
import { lastDayOf } from '~/utils/calendar/status'

const props = defineProps({
  conventions: { type: Array, required: true },
  now: { type: Date, required: true }
})
defineEmits(['open'])

const ROW = 'flex min-h-[56px] w-full items-center gap-3 px-4 py-3 text-left transition-colors hover:bg-muted focus:outline-none focus-visible:bg-muted md:px-5'

const view = computed(() => upcoming(props.conventions, props.now))
const pastOpen = ref(false)

// 'Sat 7 Nov – Sun 8 Nov · Messe, Düsseldorf'
const whereAndWhen = (convention) => {
  const start = dayKey(convention.starts_on)
  const end = lastDayOf(convention)
  const dates = !start ? '' : end && end !== start ? `${formatDay(start)} – ${formatDay(end)}` : formatDay(start)
  const place = [convention.venue, convention.city].filter(Boolean).join(', ')
  return [dates, place].filter(Boolean).join(' · ')
}
</script>
