import { ref } from 'vue'
import { usePocketBase } from './usePocketBase'
import { useTransactions } from './useTransactions'
import { useCheckout } from './useCheckout'
import { useGatchaPrizes } from './useGatchaPrizes'
import { useToast } from './useToast'
import { formatCurrency } from '~/utils/currency'
import { wasCharged, rememberCharged, forgetCharged } from '~/utils/cardCharged'

const CARD_PAYMENTS = 'card_payments'
// Whether a Solo was paired when the server last said, so Pay by card shows (disabled) offline too.
// Only the two flags are kept, never the reader's id.
const TERMINAL_KEY = 'akinai-card-terminal'
export const WATCH_MS = 2000

// App-wide: the server's last answer about the terminal, the bookings under way and the online listener
const terminalState = ref(null)
const TERMINAL_MAX_AGE_MS = 5 * 60_000
let fetchedAt = 0
const bookings = new Map()
let listening = false
let bookRun = null

const readSaved = () => {
  try {
    const saved = JSON.parse(localStorage.getItem(TERMINAL_KEY))
    return saved && typeof saved === 'object' ? { configured: !!saved.configured, paired: !!saved.paired, reader: null } : null
  } catch {
    return null
  }
}
const save = (value) => {
  try {
    localStorage.setItem(TERMINAL_KEY, JSON.stringify({ configured: !!value.configured, paired: !!value.paired }))
  } catch {}
}

// A cart payment booked here was not booked by its sheet (closed with "Close, book it when it lands", or
// uncertain): the cart may still hold what was paid for
export const bookedMessage = payment => payment.source === 'cart'
  ? `Card payment of ${formatCurrency(payment.amount)} booked. Remove those items from the cart if it still holds them.`
  : `Card payment of ${formatCurrency(payment.amount)} booked`

// Card payments on the SumUp Solo: the server's card routes (with the owner's token), watching a payment's
// record, and booking an approved payment exactly once
export const useCardPayments = () => {
  const pb = usePocketBase()
  const { transactionExists } = useTransactions()
  const { bookSale } = useCheckout()
  const { addOpenPrizes } = useGatchaPrizes()
  const { toast } = useToast()
  const auth = () => ({ Authorization: pb.authStore.token })

  const remember = (value) => {
    fetchedAt = Date.now()
    terminalState.value = value
    save(value)
    return value
  }

  // GET /api/card/terminal → { configured, paired, reader: { id, name, status } | null }
  const terminal = async () => remember(await $fetch('/api/card/terminal', { headers: auth() }))

  // The last known state at once, then the server's when online (a failure keeps the last known one).
  // The server asks SumUp, so an answer younger than 5 minutes is reused (Settings always asks afresh).
  const loadTerminal = async () => {
    if (!terminalState.value) terminalState.value = readSaved()
    if (!navigator.onLine || !pb.authStore.isValid || Date.now() - fetchedAt < TERMINAL_MAX_AGE_MS) return terminalState.value
    try {
      return await terminal()
    } catch {
      return terminalState.value
    }
  }

  const pair = async code => remember({ configured: true, ...(await $fetch('/api/card/pair', { method: 'POST', headers: auth(), body: { code } })) })
  const unpair = async () => remember({ configured: true, ...(await $fetch('/api/card/unpair', { method: 'POST', headers: auth() })) })

  // request: { source: 'cart' | 'home', amount, description, cart } → { id }
  // The server gives SumUp 15 s; a request that hangs past 45 s fails, so the sheet never waits for ever
  // This device started the payment: it books the gatcha prizes too, whenever it books the sale
  const charged = (id) => {
    try {
      rememberCharged(localStorage, id)
    } catch {}
  }
  const charge = async (request) => {
    const result = await $fetch('/api/card/charge', { method: 'POST', headers: auth(), body: request, timeout: 45_000 })
    if (result?.id) charged(result.id)
    return result
  }

  // After a charge whose answer was lost (or "already waiting"): the newest pending payment of this source
  // and amount created since `since` (ms), which the Solo may be showing now; null when there is none.
  // Throws when it cannot look.
  const findStarted = async ({ source, amount }, since) => {
    const { items } = await pb.collection(CARD_PAYMENTS).getList(1, 1, {
      filter: pb.filter('status = "pending" && source = {:source} && amount = {:amount} && created >= {:since}', {
        source,
        amount,
        since: new Date(since).toISOString().replace('T', ' ')
      }),
      sort: '-created'
    })
    const payment = items[0] ?? null
    if (payment) charged(payment.id)
    return payment
  }

  // → { status } once SumUp has taken the stop. Like the refresh, it gives up after 20 s.
  const cancel = id => $fetch('/api/card/cancel', { method: 'POST', headers: auth(), body: { id }, timeout: 20_000 })

  // → { payment }: the server asks SumUp and records a result with the owner's token
  const refresh = id => $fetch('/api/card/refresh', { method: 'POST', headers: auth(), body: { id }, timeout: 20_000 })

  // Refreshes the payment every 2 s and hands each answer to onChange, until it is no longer pending or
  // stop() is called. The refresh brings the result even without SumUp's return URL and the server's poll;
  // when it fails (SumUp did not answer), the record is read instead, and the next round tries again.
  const watch = (id, onChange) => {
    let stopped = false
    let timer = null
    const read = async () => {
      if (stopped) return
      let payment = null
      try {
        payment = (await refresh(id)).payment
      } catch {
        try {
          payment = await pb.collection(CARD_PAYMENTS).getOne(id)
        } catch {}
      }
      if (stopped) return
      if (payment) {
        // A callback that throws must not end the watch
        try {
          onChange(payment)
        } catch {}
        if (payment.status !== 'pending') return
      }
      if (!stopped) timer = setTimeout(read, WATCH_MS)
    }
    read()
    return () => {
      stopped = true
      clearTimeout(timer)
    }
  }

  // An approved payment is booked once, with the payment's record id as the sale's id: a sale already on
  // this device, in its queue or on the server is not booked again (and the server refuses a second record
  // with that id anyway). Then the payment is marked booked. Resolves true when this call booked the sale.
  // Throws only when it cannot tell whether the sale exists (no connection): it is tried again later.
  const runBooking = async (payment) => {
    // Only the server, the queue and sends in flight count: this device's cached history may hold an entry
    // that never reached the server. Posting the same id again is safe, the server refuses the duplicate.
    const exists = await transactionExists(payment.id, { history: false })
    // The gatcha prizes go to the device that charged, once: it forgets the payment before anything else is
    // awaited, so a reload mid-post cannot add them a second time
    let charged = false
    try {
      charged = wasCharged(localStorage, payment.id)
      forgetCharged(localStorage, payment.id)
    } catch {}
    const { prizes, ...withoutPrizes } = payment.cart
    if (!exists) {
      // bookSale adds the prizes at once, before its post
      await bookSale(charged ? payment.cart : withoutPrizes, { paymentMethod: 'card', sumupTransaction: payment.sumup_transaction, recordId: payment.id })
    } else if (charged && prizes?.count) {
      // Another device booked the sale (without prizes): this one still owes them
      addOpenPrizes(prizes)
    }
    try {
      await pb.collection(CARD_PAYMENTS).update(payment.id, { booked_transaction: payment.id })
    } catch {
      // The next check finds the sale and only sets the mark
    }
    return !exists
  }

  const bookPayment = (payment) => {
    if (payment?.status !== 'approved' || payment.booked_transaction || !payment.cart) return Promise.resolve(false)
    // A second call while the first is booking (the sheet and the check on mount) shares it
    if (!bookings.has(payment.id)) bookings.set(payment.id, runBooking(payment).finally(() => bookings.delete(payment.id)))
    return bookings.get(payment.id)
  }

  // Payments still pending (the app closed before the result, and no return URL or poll settled them, as in
  // nuxt dev): each is refreshed once, so an approved one is booked below
  const settlePending = async () => {
    let pending = []
    try {
      pending = await pb.collection(CARD_PAYMENTS).getFullList({ filter: 'status = "pending"', sort: 'created' })
    } catch {
      return
    }
    for (const payment of pending) {
      try {
        await refresh(payment.id)
      } catch {}
    }
  }

  // Approved payments that no device has booked yet (the app closed or lost signal while the customer
  // paid): each is booked once, with a toast. Offline or logged out it does nothing.
  const runBookApproved = async () => {
    if (!navigator.onLine || !pb.authStore.isValid) return 0
    await settlePending()
    let approved
    try {
      approved = await pb.collection(CARD_PAYMENTS).getFullList({ filter: 'status = "approved" && booked_transaction = ""', sort: 'created' })
    } catch {
      // Not migrated yet (404), still locked (403) or unreachable: nothing to book now
      return 0
    }
    let booked = 0
    for (const payment of approved) {
      try {
        if (await bookPayment(payment)) {
          booked++
          toast(bookedMessage(payment))
        }
      } catch {}
    }
    return booked
  }

  // One run at a time: a second start (catalog and Home mounting, then the online event) shares it
  const bookApproved = () => {
    if (!bookRun) bookRun = runBookApproved().finally(() => { bookRun = null })
    return bookRun
  }

  // From the catalog's and Home's onMounted: book what waits now, and whenever the connection returns
  const startCardBooking = () => {
    bookApproved()
    if (!listening) {
      listening = true
      window.addEventListener('online', () => bookApproved())
    }
  }

  return { terminalState, terminal, loadTerminal, pair, unpair, charge, findStarted, cancel, refresh, watch, bookPayment, bookApproved, startCardBooking }
}
