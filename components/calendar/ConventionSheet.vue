<template>
  <div class="space-y-5" data-testid="convention-sheet">
    <p v-if="readOnly" class="rounded-lg bg-muted px-3 py-2 text-sm text-ink-muted">Needs a connection</p>
    <p v-if="error" role="alert" class="rounded-lg bg-expense/10 px-3 py-2 text-sm text-expense">{{ error }}</p>

    <div v-if="convention" class="flex flex-wrap items-center gap-2">
      <StatusChip :label="displayStatus(convention, new Date())" />
      <BaseButton v-if="convention.status === 'interested'" variant="secondary" :disabled="readOnly || busy" @click="setStatus('applied')">Mark applied</BaseButton>
      <BaseButton v-if="convention.status === 'interested' || convention.status === 'applied'" variant="secondary" :disabled="readOnly || busy" @click="setStatus('booked')">Mark booked</BaseButton>
      <BaseButton v-if="convention.status === 'applied'" variant="danger-ghost" :disabled="readOnly || busy" @click="setStatus('rejected')">Rejected</BaseButton>
    </div>

    <form class="space-y-5" novalidate @submit.prevent="save">
      <fieldset :disabled="readOnly || busy" class="min-w-0 space-y-5">
        <section class="space-y-3" aria-labelledby="convention-basics">
          <h3 id="convention-basics" class="text-sm font-semibold text-ink">Basics</h3>
          <div>
            <label for="convention-name" class="label">Name</label>
            <input id="convention-name" v-model="form.name" type="text" class="input" autocomplete="off">
          </div>
          <div class="grid gap-3 sm:grid-cols-2">
            <div class="min-w-0">
              <label for="convention-city" class="label">City</label>
              <input id="convention-city" v-model="form.city" type="text" class="input" autocomplete="off">
            </div>
            <div class="min-w-0">
              <label for="convention-venue" class="label">Venue</label>
              <input id="convention-venue" v-model="form.venue" type="text" class="input" autocomplete="off">
            </div>
            <div class="min-w-0">
              <label for="convention-start" class="label">Start</label>
              <input id="convention-start" v-model="form.starts_on" type="date" class="input">
            </div>
            <div class="min-w-0">
              <label for="convention-end" class="label">End</label>
              <input id="convention-end" v-model="form.ends_on" type="date" class="input">
            </div>
          </div>
          <div>
            <label for="convention-status" class="label">Status</label>
            <select id="convention-status" v-model="form.status" class="input">
              <option v-for="status in STATUSES" :key="status" :value="status">{{ STATUS_LABEL[status] }}</option>
            </select>
          </div>
        </section>

        <section class="space-y-3" aria-labelledby="convention-application">
          <h3 id="convention-application" class="text-sm font-semibold text-ink">Application</h3>
          <div class="grid gap-3 sm:grid-cols-3">
            <div class="min-w-0">
              <label for="convention-opens" class="label">Opens</label>
              <input id="convention-opens" v-model="form.applications_open" type="date" class="input">
            </div>
            <div class="min-w-0">
              <label for="convention-closes" class="label">Closes</label>
              <input id="convention-closes" v-model="form.applications_close" type="date" class="input">
            </div>
            <div class="min-w-0">
              <label for="convention-results" class="label">Results expected</label>
              <input id="convention-results" v-model="form.results_expected" type="date" class="input">
            </div>
          </div>
        </section>

        <section class="space-y-3" aria-labelledby="convention-setup">
          <h3 id="convention-setup" class="text-sm font-semibold text-ink">Setup</h3>
          <div class="grid gap-3 sm:grid-cols-2">
            <div class="min-w-0">
              <label for="convention-hall" class="label">Hall</label>
              <input id="convention-hall" v-model="form.hall" type="text" class="input" autocomplete="off">
            </div>
            <div class="min-w-0">
              <label for="convention-table" class="label">Table</label>
              <input id="convention-table" v-model="form.table" type="text" class="input" autocomplete="off">
            </div>
          </div>
          <div>
            <label for="convention-setup-at" class="label">Setup time</label>
            <input id="convention-setup-at" v-model="form.setup_at" type="datetime-local" class="input">
          </div>
        </section>

        <section class="space-y-3" aria-labelledby="convention-fee">
          <h3 id="convention-fee" class="text-sm font-semibold text-ink">Stand fee</h3>
          <div>
            <label for="convention-stand-fee" class="label">Amount</label>
            <input id="convention-stand-fee" v-model="form.stand_fee" type="text" inputmode="decimal" class="input" placeholder="0,00">
          </div>
          <p v-if="convention?.fee_paid_at" class="text-sm font-medium text-income" data-testid="fee-paid">Paid {{ paidOn }}</p>
          <BaseButton
            v-else-if="convention && Number(convention.stand_fee) > 0"
            variant="secondary"
            block
            icon="cash"
            :loading="paying"
            @click="payFee"
          >
            Mark fee paid
          </BaseButton>
          <p v-if="convention && !convention.fee_paid_at && Number(convention.stand_fee) > 0" class="hint">
            Books {{ formatCurrency(Number(convention.stand_fee)) }} as an expense dated today
          </p>
        </section>

        <section class="space-y-3" aria-labelledby="convention-reminders">
          <h3 id="convention-reminders" class="text-sm font-semibold text-ink">Reminders</h3>
          <ReminderEditor
            :reminders="shownReminders"
            :convention="draft"
            :disabled="readOnly || busy"
            @edit="(id, change) => { reminders = editReminder(currentReminders(), id, change) }"
            @remove="id => { reminders = removeReminder(currentReminders(), id) }"
            @add="change => { reminders = addReminder(currentReminders(), { id: `custom-${newRecordId()}`, ...change }) }"
          />
        </section>
      </fieldset>

      <BaseButton type="submit" size="lg" block :loading="busy" :disabled="readOnly">{{ convention ? 'Save changes' : 'Create convention' }}</BaseButton>
    </form>

    <div v-if="convention" class="border-t border-line pt-4">
      <BaseButton v-if="!confirmingDelete" variant="danger-ghost" block icon="trash" :disabled="readOnly || busy" @click="confirmingDelete = true">Delete convention</BaseButton>
      <div v-else class="space-y-3">
        <p class="text-sm text-ink-muted">Delete {{ convention.name }} and its reminders? A booked stand fee stays in the transactions.</p>
        <div class="grid grid-cols-2 gap-2">
          <BaseButton variant="secondary" @click="confirmingDelete = false">Keep it</BaseButton>
          <BaseButton variant="danger" :loading="busy" @click="remove">Delete</BaseButton>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, watch } from 'vue'
import ReminderEditor from '~/components/calendar/ReminderEditor.vue'
import StatusChip from '~/components/calendar/StatusChip.vue'
import { useConventions } from '~/composables/useConventions'
import { useToast } from '~/composables/useToast'
import { formatCurrency } from '~/utils/currency'
import { newRecordId } from '~/utils/inventory'
import { STATUSES, STATUS_LABEL, displayStatus } from '~/utils/calendar/status'
import { blankForm, formFrom, fieldsFrom, validateConvention } from '~/utils/calendar/form'
import { syncReminders, editReminder, removeReminder, addReminder, visibleReminders } from '~/utils/calendar/reminders'
import { formatDay, localDayKey, parseInstant } from '~/utils/calendar/dates'

const props = defineProps({
  // null for a new convention
  convention: { type: Object, default: null },
  // Offline, or showing the saved copy: everything is read-only
  readOnly: { type: Boolean, default: false }
})
const emit = defineEmits(['saved', 'changed', 'deleted'])

const { createConvention, updateConvention, deleteConvention, markFeePaid } = useConventions()
const { toast } = useToast()

const form = ref(blankForm())
// The reminders as the owner left them (edited, added, removed markers); the defaults are worked out from the form
const reminders = ref([])
const error = ref('')
const busy = ref(false)
const paying = ref(false)
const confirmingDelete = ref(false)

// A fresh form whenever another convention (or a new one) is shown
watch(() => props.convention?.id ?? null, () => {
  form.value = props.convention ? formFrom(props.convention) : blankForm()
  reminders.value = Array.isArray(props.convention?.reminders) ? props.convention.reminders : []
  error.value = ''
  confirmingDelete.value = false
}, { immediate: true })

// The form as a convention record, so the reminders move while the dates are typed
const draft = computed(() => ({ ...(props.convention ?? {}), ...fieldsFrom(form.value) }))
const currentReminders = () => syncReminders(draft.value, reminders.value, new Date())
const shownReminders = computed(() => visibleReminders(syncReminders(draft.value, reminders.value, new Date())))
const paidOn = computed(() => {
  const paid = parseInstant(props.convention?.fee_paid_at)
  return paid ? formatDay(localDayKey(paid)) : ''
})

const failed = () => toast('Could not save the convention. Check your connection and try again.', { tone: 'error', duration: 6000 })

const save = async () => {
  if (busy.value || props.readOnly) return
  error.value = validateConvention(form.value)
  if (error.value) return
  busy.value = true
  try {
    const fields = fieldsFrom(form.value)
    if (props.convention) {
      const record = await updateConvention(props.convention, fields, currentReminders())
      reminders.value = record.reminders ?? []
      emit('changed', record)
      toast('Convention saved')
    } else {
      const record = await createConvention(fields, currentReminders())
      emit('saved', record)
      toast('Convention created')
    }
  } catch {
    // The sheet stays open with what was typed
    failed()
  } finally {
    busy.value = false
  }
}

// Mark applied / Mark booked / Rejected save straight away, with the saved dates (not unsaved edits)
const setStatus = async (status) => {
  if (busy.value || props.readOnly) return
  error.value = status === 'booked' ? validateConvention({ ...formFrom(props.convention), status }) : ''
  if (error.value) return
  busy.value = true
  try {
    const record = await updateConvention(props.convention, { status })
    form.value.status = record.status
    reminders.value = record.reminders ?? []
    emit('changed', record)
  } catch {
    failed()
  } finally {
    busy.value = false
  }
}

const payFee = async () => {
  if (paying.value || props.readOnly) return
  paying.value = true
  try {
    const { record, booked } = await markFeePaid(props.convention)
    emit('changed', record)
    if (booked) toast(`Stand fee booked — ${formatCurrency(Number(record.stand_fee))}`)
    else error.value = 'The fee was already marked paid on another device'
  } catch {
    failed()
  } finally {
    paying.value = false
  }
}

const remove = async () => {
  if (busy.value) return
  busy.value = true
  try {
    await deleteConvention(props.convention.id)
    emit('deleted', props.convention.id)
    toast('Convention deleted')
  } catch {
    toast('Could not delete the convention. Check your connection and try again.', { tone: 'error', duration: 6000 })
  } finally {
    busy.value = false
  }
}
</script>
