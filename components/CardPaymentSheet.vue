<template>
  <BottomSheet :open="open" title="Card payment" :dismissible="settled" @update:open="close">
    <div class="space-y-4" data-testid="card-payment">
      <div class="flex flex-col items-center gap-3 py-4 text-center" role="status">
        <span
          v-if="!settled"
          class="h-10 w-10 animate-spin rounded-full border-4 border-muted border-t-accent motion-reduce:animate-none"
          aria-hidden="true"
        />
        <span
          v-else
          class="flex h-12 w-12 items-center justify-center rounded-full"
          :class="state === 'approved' ? 'bg-income/10 text-income' : 'bg-expense/10 text-expense'"
          aria-hidden="true"
        >
          <AppIcon :name="state === 'approved' ? 'check' : 'x'" class="h-6 w-6" />
        </span>
        <p class="break-words text-lg font-semibold text-ink" data-testid="card-payment-state">{{ headline }}</p>
        <p v-if="detail" class="break-words text-sm text-ink-muted">{{ detail }}</p>
      </div>

      <p v-if="error" role="alert" class="rounded-lg bg-expense/10 px-3 py-2 text-sm text-expense">{{ error }}</p>

      <div class="space-y-2">
        <BaseButton v-if="state === 'still'" block @click="keepWaiting">Keep waiting</BaseButton>
        <BaseButton
          v-if="['waiting', 'still', 'cancelling'].includes(state)"
          block
          variant="secondary"
          icon="x"
          :loading="state === 'cancelling'"
          @click="cancelOnTerminal"
        >
          Cancel on terminal
        </BaseButton>
        <BaseButton v-if="settled" block :variant="state === 'approved' ? 'primary' : 'secondary'" @click="close(false)">
          {{ state === 'approved' ? 'Done' : 'Close' }}
        </BaseButton>
      </div>
    </div>
  </BottomSheet>
</template>

<script setup>
import { ref, computed, watch, onBeforeUnmount } from 'vue'
import { useCardPayments } from '~/composables/useCardPayments'
import { formatCurrency } from '~/utils/currency'

// No result this long after the start: ask whether to keep waiting
const STILL_WAITING_MS = 120_000
const FAILED = "The payment didn't go through"

const props = defineProps({
  open: { type: Boolean, default: false },
  // { source: 'cart' | 'home', amount, description, cart }: sent once each time the sheet opens
  request: { type: Object, default: null }
})
const emit = defineEmits(['update:open', 'paid'])

const { charge, cancel, watch: watchPayment, bookPayment } = useCardPayments()

// 'starting' | 'waiting' | 'still' | 'cancelling' | 'approved' | 'declined' | 'cancelled' | 'failed'
const state = ref('starting')
const failure = ref('')
const error = ref('')
let paymentId = ''
let stopWatching = () => {}
let stillTimer = null

const settled = computed(() => ['approved', 'declined', 'cancelled', 'failed'].includes(state.value))
const amount = computed(() => formatCurrency(props.request?.amount ?? 0))
const headline = computed(() => ({
  starting: 'Sending to the terminal...',
  waiting: `Waiting for card · ${amount.value}`,
  cancelling: `Waiting for card · ${amount.value}`,
  still: 'Still waiting for the terminal',
  approved: 'Paid ✓',
  declined: 'Card declined',
  cancelled: 'Cancelled',
  failed: failure.value || FAILED
})[state.value])
const detail = computed(() => {
  if (state.value === 'approved') return amount.value
  if (['declined', 'cancelled', 'failed'].includes(state.value)) return 'Nothing was booked'
  if (state.value === 'still') return amount.value
  return ''
})

const startStillTimer = () => {
  clearTimeout(stillTimer)
  stillTimer = setTimeout(() => { if (state.value === 'waiting') state.value = 'still' }, STILL_WAITING_MS)
}

const stop = () => {
  stopWatching()
  stopWatching = () => {}
  clearTimeout(stillTimer)
}

const onPayment = (payment) => {
  if (payment.status === 'pending') return
  stop()
  if (payment.status === 'approved') {
    state.value = 'approved'
    // Booked here, and if this fails (no connection) on the next start or when the connection returns
    bookPayment(payment).catch(() => {})
    emit('paid', payment)
    return
  }
  state.value = payment.status
}

const start = async () => {
  stop()
  state.value = 'starting'
  failure.value = ''
  error.value = ''
  paymentId = ''
  try {
    const { id } = await charge(props.request)
    if (!props.open) return
    paymentId = id
    state.value = 'waiting'
    startStillTimer()
    stopWatching = watchPayment(id, onPayment)
  } catch (err) {
    state.value = 'failed'
    failure.value = err?.data?.message || FAILED
  }
}

const keepWaiting = () => {
  state.value = 'waiting'
  startStillTimer()
}

const cancelOnTerminal = async () => {
  if (!paymentId || state.value === 'cancelling') return
  const before = state.value
  state.value = 'cancelling'
  error.value = ''
  try {
    const { status } = await cancel(paymentId)
    // approved: the card went through after all, and the watch brings it; pending: the poll settles it
    if (status === 'cancelled') {
      stop()
      state.value = 'cancelled'
    } else if (state.value === 'cancelling') {
      state.value = before
    }
  } catch (err) {
    if (state.value === 'cancelling') state.value = before
    error.value = err?.data?.message || "The terminal didn't answer. Check that it's on and online."
  }
}

const close = (value) => {
  if (value || !settled.value) return
  stop()
  emit('update:open', false)
}

watch(() => props.open, (isOpen) => {
  if (isOpen && props.request) start()
  else stop()
}, { immediate: true })

onBeforeUnmount(stop)
</script>
