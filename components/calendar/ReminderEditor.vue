<template>
  <div class="space-y-2">
    <p v-if="!reminders.length" class="text-sm text-ink-muted">No reminders</p>
    <ul v-else class="divide-y divide-line rounded-lg border border-line" aria-label="Reminders">
      <li v-for="reminder in reminders" :key="reminder.id" class="flex items-center gap-1 py-2 pl-3 pr-1">
        <div class="min-w-0 flex-1">
          <p class="break-words text-sm font-medium text-ink">{{ labelOf(reminder) }}</p>
          <p class="text-xs text-ink-muted">
            {{ ruleOf(reminder, convention) }} · {{ formatMoment(new Date(reminder.at)) }}<template v-if="stateOf(reminder)"> · {{ stateOf(reminder) }}</template>
          </p>
        </div>
        <BaseButton v-if="!reminder.sent_at" variant="ghost" :disabled="disabled" :aria-label="`Edit ${labelOf(reminder)}, ${formatMoment(new Date(reminder.at))}`" @click="startEdit(reminder)">Edit</BaseButton>
        <button
          type="button"
          class="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg text-ink-muted hover:bg-muted hover:text-expense disabled:opacity-50"
          :disabled="disabled"
          :aria-label="`Remove ${labelOf(reminder)}, ${formatMoment(new Date(reminder.at))}`"
          @click="$emit('remove', reminder.id)"
        >
          <AppIcon name="trash" class="h-4 w-4" />
        </button>
      </li>
    </ul>

    <!-- One small form for Edit and Add reminder; not a <form>, it sits inside the sheet's form -->
    <div v-if="editing" class="space-y-2 rounded-lg border border-line p-3" data-testid="reminder-form">
      <p class="text-sm font-semibold text-ink">{{ editing === NEW ? 'New reminder' : `Edit ${editingLabel}` }}</p>
      <p v-if="error" role="alert" class="text-sm text-expense">{{ error }}</p>
      <div v-if="draft.custom">
        <label for="reminder-text" class="label">Remind me to</label>
        <input id="reminder-text" v-model="draft.text" type="text" class="input" autocomplete="off" @keydown.enter.prevent="submit">
      </div>
      <div class="grid grid-cols-2 gap-2">
        <div class="min-w-0">
          <label for="reminder-date" class="label">Date</label>
          <input id="reminder-date" v-model="draft.date" type="date" class="input" @keydown.enter.prevent="submit">
        </div>
        <div class="min-w-0">
          <label for="reminder-time" class="label">Time</label>
          <input id="reminder-time" v-model="draft.time" type="time" class="input" @keydown.enter.prevent="submit">
        </div>
      </div>
      <div class="grid grid-cols-2 gap-2">
        <BaseButton variant="secondary" @click="editing = ''">Cancel</BaseButton>
        <BaseButton @click="submit">{{ editing === NEW ? 'Add' : 'Save reminder' }}</BaseButton>
      </div>
    </div>
    <BaseButton v-else variant="secondary" icon="plus" block :disabled="disabled" @click="startAdd">Add reminder</BaseButton>
  </div>
</template>

<script setup>
import { ref, computed } from 'vue'
import { KIND_LABEL, ruleOf, stateOf } from '~/utils/calendar/reminders'
import { formatMoment } from '~/utils/calendar/dates'
import { splitMoment, joinMoment, validateReminder } from '~/utils/calendar/form'

const props = defineProps({
  // The visible reminders (removed defaults left out)
  reminders: { type: Array, required: true },
  // The convention as the form has it now, for the rules ("1 hour before setup")
  convention: { type: Object, required: true },
  disabled: { type: Boolean, default: false }
})
const emit = defineEmits(['edit', 'remove', 'add'])

const NEW = 'new'
const editing = ref('')
const draft = ref({ date: '', time: '', text: '', custom: true })
const error = ref('')

const labelOf = reminder => (reminder.kind === 'custom' ? reminder.text || KIND_LABEL.custom : KIND_LABEL[reminder.kind])
const editingLabel = computed(() => {
  const reminder = props.reminders.find(item => item.id === editing.value)
  return reminder ? labelOf(reminder) : ''
})

const startEdit = (reminder) => {
  draft.value = { ...splitMoment(reminder.at), text: reminder.text ?? '', custom: reminder.kind === 'custom' }
  error.value = ''
  editing.value = reminder.id
}

const startAdd = () => {
  draft.value = { date: '', time: '09:00', text: '', custom: true }
  error.value = ''
  editing.value = NEW
}

const submit = () => {
  error.value = validateReminder(draft.value)
  if (error.value) return
  const change = { at: joinMoment(draft.value.date, draft.value.time), text: draft.value.text.trim() }
  if (editing.value === NEW) emit('add', change)
  else emit('edit', editing.value, change)
  editing.value = ''
}
</script>
