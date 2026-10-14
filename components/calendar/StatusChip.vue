<template>
  <span class="inline-flex shrink-0 items-center rounded-full px-2.5 py-0.5 text-xs font-medium" :class="CLASSES[label] ?? CLASSES.Interested" data-testid="status-chip">{{ label }}</span>
</template>

<script setup>
// Written out in full so Tailwind keeps every class
const CLASSES = {
  Interested: 'bg-muted text-ink-muted',
  Applied: 'bg-warning/10 text-warning',
  Booked: 'bg-accent/10 text-accent',
  Done: 'bg-income/10 text-income',
  Rejected: 'bg-expense/10 text-expense',
  Cancelled: 'bg-expense/10 text-expense'
}

// A label from displayStatus(): Interested, Applied, Booked, Done, Rejected or Cancelled
defineProps({ label: { type: String, required: true } })
</script>
