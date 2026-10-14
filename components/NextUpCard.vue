<template>
  <BaseCard v-if="next.deadline || next.booked" title="Next up" icon="calendar" flush>
    <div class="divide-y divide-line">
      <ListRow
        v-if="next.deadline"
        :to="`/calendar?c=${next.deadline.convention.id}`"
        :title="next.deadline.convention.name"
        :subtitle="`Applications close ${inDays(next.deadline.daysLeft)}`"
        icon="clipboard"
        :icon-class="next.deadline.daysLeft <= 7 ? 'bg-warning/10 text-warning' : 'bg-muted text-ink-muted'"
      />
      <ListRow
        v-if="next.booked"
        :to="`/calendar?c=${next.booked.convention.id}`"
        :title="next.booked.convention.name"
        :subtitle="next.booked.daysLeft === 0 ? 'On now' : `Starts ${inDays(next.booked.daysLeft)}`"
        icon="calendar"
        icon-class="bg-accent/10 text-accent"
      />
    </div>
  </BaseCard>
</template>

<script setup>
import { ref, computed, onMounted } from 'vue'
import { useConventions } from '~/composables/useConventions'
import { nextUp } from '~/utils/calendar/views'
import { inDays } from '~/utils/calendar/dates'

const { listConventions } = useConventions()
const conventions = ref([])
const next = computed(() => nextUp(conventions.value, new Date()))

onMounted(async () => {
  try {
    conventions.value = await listConventions()
  } catch {
    // No conventions collection yet (404/403) or offline: the card stays hidden
  }
})
</script>
