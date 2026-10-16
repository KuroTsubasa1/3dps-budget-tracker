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
          :class="{ 'bg-income/10 text-income': state === 'approved', 'bg-warning/10 text-warning': state === 'unknown', 'bg-expense/10 text-expense': !['approved', 'unknown'].includes(state) }"
          aria-hidden="true"
        >
          <AppIcon :name="{ approved: 'check', unknown: 'exclamation' }[state] || 'x'" class="h-6 w-6" />
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
        <!-- The way out while the terminal still has it: an approval is booked on the next start or reconnect -->
        <BaseButton v-if="canLeave" block variant="secondary" @click="leave">Close, book it when it lands</BaseButton>
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
// A payment found after a lost charge answer must be at most this much older than the tap (clock skew)
const FIND_SLACK_MS = 5000
const FAILED = "The payment didn't go through"
const TERMINAL_UNREACHABLE = "The terminal didn't answer. Check that it's on and online."
const UNCERTAIN = 'The terminal may still show the amount. Check the Solo before taking cash.'
const CHARGE_WAITING = 'A card payment is already waiting on the terminal'
// The server's 502s that it sends only once it knows the Solo has no payment (the record failed, or never made)
const CERTAIN_502 = new Set([TERMINAL_UNREACHABLE, FAILED, "SumUp didn't answer. Try again.", 'Could not save the payment. Try again.'])

const props = defineProps({
  open: { type: Boolean, default: false },
  // { source: 'cart' | 'home', amount, description, cart }: sent once each time the sheet opens
  request: { type: Object, default: null }
})
// paid(payment, booking): booking resolves once the sale is booked (true), or could not be yet (false)
const emit = defineEmits(['update:open', 'paid'])

const { charge, findStarted, cancel, watch: watchPayment, bookPayment, bookApproved } = useCardPayments()

// 'starting' | 'waiting' | 'still' | 'cancelling' | 'approved' | 'declined' | 'cancelled' | 'failed' | 'unknown'
const state = ref('starting')
const failure = ref('')
const error = ref('')
const cancelFailed = ref(false)
let paymentId = ''
let stopWatching = () => {}
let stillTimer = null

const settled = computed(() => ['approved', 'declined', 'cancelled', 'failed', 'unknown'].includes(state.value))
const canLeave = computed(() => state.value === 'still' || (cancelFailed.value && state.value === 'waiting'))
const amount = computed(() => formatCurrency(props.request?.amount ?? 0))
const headline = computed(() => ({
  starting: 'Sending to the terminal...',
  waiting: `Waiting for card · ${amount.value}`,
  cancelling: `Waiting for card · ${amount.value}`,
  still: 'Still waiting for the terminal',
  approved: 'Paid ✓',
  declined: 'Card declined',
  cancelled: 'Cancelled',
  failed: failure.value || FAILED,
  unknown: UNCERTAIN
})[state.value])
const detail = computed(() => {
  if (['approved', 'still', 'unknown'].includes(state.value)) return amount.value
  if (['declined', 'cancelled', 'failed'].includes(state.value)) return 'Nothing was booked'
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
  error.value = ''
  cancelFailed.value = false
  if (payment.status === 'approved') {
    state.value = 'approved'
    // Booked here, and if this fails (no connection) on the next start or when the connection returns
    emit('paid', payment, bookPayment(payment).catch(() => false))
    return
  }
  state.value = payment.status
}

const follow = (id) => {
  paymentId = id
  state.value = 'waiting'
  startStillTimer()
  stopWatching = watchPayment(id, onPayment)
}

// A refusal the server answered knowing the Solo has no payment: a 4xx with its message (except "already
// waiting", which means one is there), or one of its certain 502s. Anything else (no answer, a timeout, a
// 5xx without our message) may have reached the Solo.
const isCertain = (err) => {
  const status = err?.statusCode ?? err?.response?.status
  const message = err?.data?.message
  if (!status || !message || message === CHARGE_WAITING) return false
  return (status >= 400 && status < 500) || (status === 502 && CERTAIN_502.has(message))
}

const start = async () => {
  stop()
  state.value = 'starting'
  failure.value = ''
  error.value = ''
  cancelFailed.value = false
  paymentId = ''
  const startedAt = Date.now()
  try {
    const { id } = await charge(props.request)
    if (!props.open) return
    follow(id)
  } catch (err) {
    if (!props.open) return
    if (isCertain(err)) {
      state.value = 'failed'
      failure.value = err.data.message
      return
    }
    // The Solo may have the amount: take over the payment the server made for it, if there is one
    let found = null
    try {
      found = await findStarted(props.request, startedAt - FIND_SLACK_MS)
    } catch {}
    if (!props.open) return
    if (found) follow(found.id)
    else state.value = 'unknown'
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
  cancelFailed.value = false
  try {
    const { status } = await cancel(paymentId)
    // approved: the card went through after all, and the watch brings it; pending: the poll settles it
    if (status === 'cancelled') {
      stop()
      state.value = 'cancelled'
    } else if (state.value === 'cancelling') {
      state.value = before
      // The 120 s question may have come and gone during the cancel
      if (before === 'waiting') startStillTimer()
    }
  } catch (err) {
    if (state.value === 'cancelling') {
      state.value = before
      if (before === 'waiting') startStillTimer()
      cancelFailed.value = true
      error.value = err?.data?.message || TERMINAL_UNREACHABLE
    }
  }
}

const close = (value) => {
  if (value || !settled.value) return
  stop()
  emit('update:open', false)
  // Not sure the Solo had nothing: an approval that lands meanwhile is booked now or on the next start
  if (state.value === 'unknown') bookApproved()
}

// The owner stops waiting: the watch ends, and an approval is booked now (if it is already in) or on the
// next start or reconnect
const leave = () => {
  stop()
  emit('update:open', false)
  bookApproved()
}

watch(() => props.open, (isOpen) => {
  if (isOpen && props.request) start()
  else stop()
}, { immediate: true })

onBeforeUnmount(stop)
</script>
