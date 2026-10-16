<template>
  <form class="space-y-4" novalidate @submit.prevent="handleSubmit">
    <SegmentedControl v-model="transactionType" label="Transaction type" :options="TYPE_OPTIONS" />

    <p v-if="error" role="alert" class="rounded-lg bg-expense/10 px-3 py-2 text-sm text-expense">{{ error }}</p>

    <div>
      <label for="tx-description" class="label">Description</label>
      <input
        id="tx-description"
        v-model="transactionDescription"
        type="text"
        class="input"
        placeholder="What is this transaction for?"
        autocomplete="off"
      >
    </div>

    <div>
      <label for="tx-amount" class="label">Amount</label>
      <div class="relative">
        <span class="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-ink-muted">€</span>
        <!-- Text + inputmode keeps "12." intact for the keypad and accepts a decimal comma -->
        <input
          id="tx-amount"
          v-model="transactionAmount"
          type="text"
          inputmode="decimal"
          class="input pl-8 text-lg font-semibold tabular-nums"
          placeholder="0.00"
          autocomplete="off"
        >
      </div>
    </div>

    <div class="grid grid-cols-3 gap-2" role="group" aria-label="Keypad">
      <button
        v-for="key in KEYPAD"
        :key="key"
        type="button"
        class="flex h-12 items-center justify-center rounded-lg bg-muted text-lg font-semibold text-ink active:bg-line"
        :aria-label="key === 'back' ? 'Delete last digit' : undefined"
        @click="pressKey(key)"
      >
        <AppIcon v-if="key === 'back'" name="backspace" class="h-5 w-5" />
        <template v-else>{{ key }}</template>
      </button>
    </div>

    <div>
      <label for="tx-notes" class="label">Notes <span class="font-normal text-ink-muted">(optional)</span></label>
      <textarea
        id="tx-notes"
        v-model="transactionNotes"
        rows="2"
        class="input py-2"
        placeholder="Additional details about this transaction..."
      />
    </div>

    <div class="space-y-2">
      <BaseButton type="submit" size="lg" block :loading="isLoading">
        {{ isLoading ? 'Saving...' : 'Add to Balance' }}
      </BaseButton>
      <!-- Income only, and only with a paired Solo -->
      <template v-if="showCard">
        <BaseButton size="lg" block variant="secondary" icon="credit-card" :disabled="!online" @click="payByCard">Pay by card</BaseButton>
        <p v-if="!online" class="text-center text-xs text-ink-muted">Needs a connection</p>
      </template>
    </div>

    <CardPaymentSheet v-model:open="isCardSheetOpen" :request="cardRequest" @paid="onCardPaid" />
  </form>
</template>

<script setup>
import { ref, computed, watch, onMounted, onBeforeUnmount } from 'vue'
import { useTransactions } from '~/composables/useTransactions'
import { useCheckout } from '~/composables/useCheckout'
import { useCardPayments } from '~/composables/useCardPayments'
import { localDate } from '~/utils/transactions'
import { homeBooking } from '~/utils/checkout'

const emit = defineEmits(['saved'])

const TYPE_OPTIONS = [
  { value: 'income', label: 'Income', activeClass: 'text-income' },
  { value: 'expense', label: 'Expense', activeClass: 'text-expense' }
]
const KEYPAD = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '.', '0', 'back']

const { addTransaction, isLoading } = useTransactions()
const { bookSale } = useCheckout()

const transactionType = ref('income')
const transactionDescription = ref('')
const transactionAmount = ref('')
const transactionNotes = ref('')
const error = ref('')
let errorTimer = null

// Auto-dismiss validation errors after 5 seconds
watch(error, (message) => {
  clearTimeout(errorTimer)
  if (message) errorTimer = setTimeout(() => { error.value = '' }, 5000)
})

const pressKey = (key) => {
  const current = String(transactionAmount.value ?? '')
  if (key === 'back') {
    transactionAmount.value = current.slice(0, -1)
  } else if (key === '.') {
    if (!current.includes('.')) transactionAmount.value = `${current || '0'}.`
  } else {
    transactionAmount.value = `${current}${key}`.replace(/^0+(?=\d)/, '')
  }
}

const parseAmount = value => Number(String(value).trim().replace(',', '.'))

// The checked amount, or null after showing what is missing
const validAmount = () => {
  error.value = ''
  if (!transactionDescription.value.trim()) {
    error.value = 'Please enter a description for the transaction'
    return null
  }
  const amount = parseAmount(transactionAmount.value)
  if (!(amount > 0)) {
    error.value = 'Please enter a valid amount'
    return null
  }
  return amount
}

const clearForm = () => {
  transactionDescription.value = ''
  transactionAmount.value = ''
  transactionNotes.value = ''
}

const handleSubmit = async () => {
  const amount = validAmount()
  if (amount === null) return

  // Both save locally first and never throw; API failures surface via apiError. Income typed here is cash
  // (Pay by card books its own); an expense has no payment method.
  if (transactionType.value === 'income') {
    await bookSale(homeBooking({ description: transactionDescription.value.trim(), amount, notes: transactionNotes.value }), { paymentMethod: 'cash' })
  } else {
    await addTransaction({ description: transactionDescription.value.trim(), amount: -amount, date: localDate(), notes: transactionNotes.value })
  }

  clearForm()
  emit('saved')
}

// Pay by card: the income this form would book, stored with the card payment and booked on approval.
// Declined or cancelled, the form keeps what was typed.
const { terminalState, loadTerminal } = useCardPayments()
const online = ref(true)
const showCard = computed(() => transactionType.value === 'income' && !!terminalState.value?.configured && !!terminalState.value?.paired)
const isCardSheetOpen = ref(false)
const cardRequest = ref(null)
let paidByCard = false

const payByCard = () => {
  const amount = validAmount()
  if (amount === null || !online.value) return
  const booking = homeBooking({ description: transactionDescription.value.trim(), amount, notes: transactionNotes.value })
  cardRequest.value = { source: 'home', amount: booking.amount, description: 'Akinai sale', cart: booking }
  paidByCard = false
  isCardSheetOpen.value = true
}

const onCardPaid = () => {
  paidByCard = true
  clearForm()
}

// Done on Paid ✓ closes the form too, like Add to Balance
watch(isCardSheetOpen, (open) => {
  if (open || !paidByCard) return
  paidByCard = false
  emit('saved')
})

const setOnline = () => { online.value = navigator.onLine }

onMounted(() => {
  setOnline()
  window.addEventListener('online', setOnline)
  window.addEventListener('offline', setOnline)
  loadTerminal()
})

onBeforeUnmount(() => {
  clearTimeout(errorTimer)
  window.removeEventListener('online', setOnline)
  window.removeEventListener('offline', setOnline)
})
</script>
