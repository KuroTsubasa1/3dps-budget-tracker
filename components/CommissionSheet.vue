<template>
  <BottomSheet :open="open" :title="title" @update:open="$emit('update:open', $event)">
    <form v-if="mode === 'form'" class="space-y-4" novalidate @submit.prevent="save">
      <p v-if="error" role="alert" class="rounded-lg bg-expense/10 px-3 py-2 text-sm text-expense">{{ error }}</p>
      <p v-if="anonymised" class="rounded-lg bg-muted px-3 py-2 text-sm text-ink-muted">Customer data deleted</p>
      <template v-else>
        <div>
          <label for="commission-name" class="label">Customer name</label>
          <input id="commission-name" v-model="form.customerName" type="text" class="input" autocomplete="off">
        </div>
        <div>
          <label for="commission-email" class="label">Email</label>
          <input id="commission-email" v-model="form.email" type="email" inputmode="email" class="input" autocomplete="off">
        </div>
        <div>
          <label for="commission-phone" class="label">Phone</label>
          <input id="commission-phone" v-model="form.phone" type="tel" inputmode="tel" class="input" autocomplete="off">
        </div>
        <div>
          <p class="label">Delivery</p>
          <SegmentedControl v-model="form.fulfilment" label="Delivery" :options="FULFILMENT_OPTIONS" />
        </div>
        <div v-if="form.fulfilment === 'shipping'">
          <label for="commission-address" class="label">Address</label>
          <textarea id="commission-address" v-model="form.address" rows="3" class="input py-2" />
        </div>
      </template>
      <ul v-if="form.items.length" class="divide-y divide-line rounded-lg border border-line" aria-label="Articles">
        <li v-for="(line, index) in form.items" :key="line.article" class="flex items-center gap-2 py-2 pl-3 pr-1">
          <p class="min-w-0 flex-1 break-words text-sm font-medium text-ink">{{ line.name }}</p>
          <QuantityStepper
            :quantity="Number(line.quantity)"
            :name="line.name"
            :label="`Quantity of ${line.name}`"
            @increment="form.items = setLineQuantity(form.items, index, Number(line.quantity) + 1)"
            @decrement="form.items = setLineQuantity(form.items, index, Number(line.quantity) - 1)"
          />
          <button
            type="button"
            class="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg text-ink-muted hover:bg-muted hover:text-expense"
            :aria-label="`Remove ${line.name}`"
            @click="form.items = removeLine(form.items, index)"
          >
            <AppIcon name="trash" class="h-4 w-4" />
          </button>
        </li>
      </ul>
      <div>
        <label for="commission-price" class="label">Agreed price</label>
        <input id="commission-price" v-model="form.price" type="text" inputmode="decimal" class="input" @input="priceTouched = true">
      </div>
      <div>
        <label for="commission-notes" class="label">Notes <span class="font-normal text-ink-muted">(optional)</span></label>
        <textarea id="commission-notes" v-model="form.notes" rows="2" class="input py-2" placeholder="Colour, size, engraving…" />
      </div>
      <div class="space-y-2">
        <BaseButton type="submit" size="lg" block :loading="busy">{{ commission ? 'Save changes' : 'Create commission' }}</BaseButton>
        <BaseButton v-if="commission" variant="secondary" block :disabled="busy" @click="cancelEdit">Cancel</BaseButton>
      </div>
    </form>

    <div v-else-if="commission" class="space-y-5">
      <p v-if="error" role="alert" class="rounded-lg bg-expense/10 px-3 py-2 text-sm text-expense">{{ error }}</p>

      <ol class="grid grid-cols-4 gap-1 text-center text-xs" aria-label="Progress">
        <li
          v-for="step in STEPS"
          :key="step"
          class="rounded-md px-1 py-2 font-medium"
          :class="stepClass(step)"
          :aria-current="commission.status === step ? 'step' : undefined"
        >
          {{ STATUS_LABEL[step] }}
        </li>
      </ol>
      <p v-if="commission.status === 'cancelled'" class="rounded-lg bg-muted px-3 py-2 text-sm text-ink-muted">Cancelled</p>

      <dl class="space-y-2 text-sm">
        <div class="flex justify-between gap-3"><dt class="text-ink-muted">Customer</dt><dd class="text-right font-medium text-ink">{{ customerLabel }}</dd></div>
        <div v-if="commission.customer_email" class="flex justify-between gap-3"><dt class="text-ink-muted">Email</dt><dd class="min-w-0 break-all text-right text-ink">{{ commission.customer_email }}</dd></div>
        <div v-if="phone" class="flex items-center justify-between gap-3">
          <dt class="text-ink-muted">Phone</dt>
          <dd class="min-w-0 text-right">
            <a :href="`tel:${phone.replace(/[^\d+]/g, '')}`" class="inline-flex min-h-[44px] items-center break-all font-medium text-accent hover:underline">{{ phone }}</a>
          </dd>
        </div>
        <div class="flex justify-between gap-3"><dt class="text-ink-muted">Delivery</dt><dd class="text-right text-ink">{{ commission.fulfilment === 'shipping' ? 'Shipping' : 'Pickup' }}</dd></div>
        <div v-if="commission.fulfilment === 'shipping'" class="flex justify-between gap-3"><dt class="text-ink-muted">Address</dt><dd class="whitespace-pre-line text-right text-ink">{{ commission.address }}</dd></div>
        <div class="flex justify-between gap-3">
          <dt class="text-ink-muted">Articles</dt>
          <dd class="min-w-0 text-right text-ink">
            <ul>
              <li v-for="(line, index) in lines" :key="index" class="break-words">{{ line.name }} × {{ line.quantity }}</li>
            </ul>
          </dd>
        </div>
        <div class="flex justify-between gap-3"><dt class="text-ink-muted">Agreed price</dt><dd class="text-right font-semibold tabular-nums text-ink">{{ formatCurrency(Number(commission.agreed_price)) }}</dd></div>
        <div v-if="commission.notes" class="flex justify-between gap-3"><dt class="text-ink-muted">Notes</dt><dd class="whitespace-pre-line text-right text-ink">{{ commission.notes }}</dd></div>
      </dl>

      <div class="border-t border-line pt-3">
        <ToggleSwitch
          :model-value="paid"
          label="Paid"
          :description="online ? '' : 'Needs a connection'"
          :disabled="!online || busy"
          @update:model-value="setPaid"
        />
        <div v-if="confirming === 'pay'" class="mt-2 space-y-3">
          <p class="text-sm text-ink-muted">This commission was delivered before payments were tracked, so its income may already be in your balance.</p>
          <div class="grid grid-cols-2 gap-2">
            <BaseButton variant="secondary" :disabled="busy" @click="pay('only')">Only mark paid</BaseButton>
            <BaseButton :loading="busy" @click="pay('book')">Book income again</BaseButton>
          </div>
        </div>
      </div>

      <div class="space-y-2">
        <BaseButton v-if="NEXT[commission.status]" size="lg" block :loading="busy" @click="move(NEXT[commission.status])">
          {{ NEXT_ACTION[commission.status] }}
        </BaseButton>
        <BaseButton v-if="PREVIOUS[commission.status]" variant="secondary" block :disabled="busy" @click="move(PREVIOUS[commission.status])">
          Back to {{ STATUS_LABEL[PREVIOUS[commission.status]] }}
        </BaseButton>
        <BaseButton v-if="!isFinal(commission.status)" variant="secondary" block :disabled="busy" @click="startEdit">Edit</BaseButton>
      </div>

      <div v-if="canCancel(commission.status)" class="border-t border-line pt-4">
        <BaseButton v-if="confirming !== 'cancel'" variant="danger-ghost" block :disabled="busy" @click="confirming = 'cancel'">Cancel commission</BaseButton>
        <div v-else class="space-y-3">
          <p class="text-sm text-ink-muted">Cancel this commission? It moves to Done and can't be reopened.</p>
          <div class="grid grid-cols-2 gap-2">
            <BaseButton variant="secondary" @click="confirming = ''">Keep it</BaseButton>
            <BaseButton variant="danger" :loading="busy" @click="move('cancelled')">Yes, cancel</BaseButton>
          </div>
        </div>
      </div>

      <div v-if="!commission.anonymised_at" class="border-t border-line pt-4">
        <BaseButton v-if="confirming !== 'delete'" variant="danger-ghost" block icon="trash" :disabled="busy" @click="confirming = 'delete'">Delete customer data</BaseButton>
        <div v-else class="space-y-3">
          <p class="text-sm text-ink-muted">Remove the name, email, phone and address for good? The article, price and status stay.</p>
          <div class="grid grid-cols-2 gap-2">
            <BaseButton variant="secondary" @click="confirming = ''">Keep data</BaseButton>
            <BaseButton variant="danger" :loading="busy" @click="deleteData">Delete data</BaseButton>
          </div>
        </div>
      </div>
    </div>
  </BottomSheet>
</template>

<script setup>
import { ref, computed, watch, onMounted, onBeforeUnmount } from 'vue'
import { useCommissions } from '~/composables/useCommissions'
import { useToast } from '~/composables/useToast'
import { formatCurrency } from '~/utils/currency'
import {
  STATUS_LABEL,
  NEXT,
  PREVIOUS,
  NEXT_ACTION,
  isFinal,
  canCancel,
  transitionPatch,
  itemsOf,
  isPaid,
  validateCommission,
  NOT_MIGRATED,
  setLineQuantity,
  removeLine,
  suggestedPriceFor
} from '~/utils/commissions'

const props = defineProps({
  open: { type: Boolean, default: false },
  commission: { type: Object, default: null },
  articles: { type: Array, required: true },
  deals: { type: Array, default: () => [] },
  // Lines a new commission starts with ([{ article, name, quantity }]); copied, never changed in place
  presetItems: { type: Array, default: () => [] }
})
const emit = defineEmits(['update:open', 'saved', 'changed'])

const STEPS = ['open', 'printing', 'ready', 'delivered']
const FULFILMENT_OPTIONS = [
  { value: 'pickup', label: 'Pickup' },
  { value: 'shipping', label: 'Shipping' }
]

const { getCommission, createCommission, updateCommission, anonymise, markPaid, markUnpaid, repairPayment } = useCommissions()
const { toast } = useToast()

const mode = ref('view')
const form = ref({ items: [] })
const priceTouched = ref(false)
const error = ref('')
const busy = ref(false)
const confirming = ref('')
// Counts Paid / Unpaid actions, so a repair started on open stands down once the owner acts
let paymentTaps = 0
// Paying and taking a payment back both need the server: the switch follows the connection
const online = ref(true)
const followConnection = () => { online.value = navigator.onLine }
onMounted(() => {
  followConnection()
  window.addEventListener('online', followConnection)
  window.addEventListener('offline', followConnection)
})
onBeforeUnmount(() => {
  window.removeEventListener('online', followConnection)
  window.removeEventListener('offline', followConnection)
})

const toPriceText = amount => (Number(amount) > 0 ? Number(amount).toFixed(2).replace('.', ',') : '')
const parseNumber = value => Number(String(value).trim().replace(',', '.'))
const copyLines = lines => lines.map(line => ({ article: line.article, name: line.name, quantity: Number(line.quantity) }))

const blankForm = () => ({ customerName: '', email: '', phone: '', fulfilment: 'pickup', address: '', items: copyLines(props.presetItems), price: '', notes: '' })
const formFrom = commission => ({
  customerName: commission.customer_name,
  email: commission.customer_email,
  phone: commission.customer_phone ?? '',
  fulfilment: commission.fulfilment,
  address: commission.address,
  // A legacy record (article × quantity) becomes its one line here and is saved as items
  items: copyLines(itemsOf(commission, props.articles)),
  price: toPriceText(commission.agreed_price),
  notes: commission.notes
})

const title = computed(() => {
  if (mode.value === 'form') return props.commission ? 'Edit commission' : 'New commission'
  return 'Commission'
})

const lines = computed(() => (props.commission ? itemsOf(props.commission, props.articles) : []))
const anonymised = computed(() => !!props.commission?.anonymised_at)
const customerLabel = computed(() => (props.commission?.anonymised_at ? 'Anonymised' : props.commission?.customer_name))
// An anonymised commission never shows a phone, even one entered again by an old client
const phone = computed(() => (props.commission?.anonymised_at ? '' : String(props.commission?.customer_phone ?? '').trim()))
const paid = computed(() => isPaid(props.commission))

// Deal-aware suggestion over every line; it follows the lines until the price is edited
const suggestedPrice = computed(() => suggestedPriceFor(form.value.items ?? [], props.articles, props.deals))

watch(suggestedPrice, (price) => {
  if (mode.value === 'form' && !priceTouched.value) form.value.price = toPriceText(price)
}, { immediate: true })

// Fresh state every time the sheet opens: a new commission starts in the form, an existing one in the read view
watch(() => props.open, (isOpen) => {
  if (!isOpen) return
  error.value = ''
  confirming.value = ''
  if (props.commission) {
    mode.value = 'view'
    repairOnOpen()
  } else {
    mode.value = 'form'
    form.value = blankForm()
    priceTouched.value = false
    // Re-opening with the same lines leaves suggestedPrice unchanged, so its watcher would not fire
    form.value.price = toPriceText(suggestedPrice.value)
  }
}, { immediate: true })

const stepClass = (step) => {
  const reached = STEPS.indexOf(props.commission.status) >= STEPS.indexOf(step)
  return reached ? 'bg-accent/10 text-accent' : 'bg-muted text-ink-muted'
}

const isOffline = err => (typeof navigator !== 'undefined' && !navigator.onLine) || err?.status === 0
const failMessage = (err, fallback) => (isOffline(err) ? "You're offline — commissions need a connection" : fallback)

const startEdit = () => {
  form.value = formFrom(props.commission)
  priceTouched.value = true
  error.value = ''
  mode.value = 'form'
}

const cancelEdit = () => {
  error.value = ''
  mode.value = 'view'
}

const save = async () => {
  if (busy.value) return
  error.value = validateCommission({ ...form.value, anonymised: anonymised.value })
  if (error.value) return
  busy.value = true
  const shipping = form.value.fulfilment === 'shipping'
  // Anonymised records keep their wiped customer fields untouched
  const customer = anonymised.value
    ? {}
    : {
        customer_name: form.value.customerName.trim(),
        customer_email: form.value.email.trim(),
        customer_phone: form.value.phone.trim(),
        fulfilment: form.value.fulfilment,
        address: shipping ? form.value.address.trim() : ''
      }
  // article / quantity belong to records from before items: left untouched on edit, empty on create
  const fields = {
    ...customer,
    items: copyLines(form.value.items),
    agreed_price: parseNumber(form.value.price),
    notes: form.value.notes.trim()
  }
  try {
    if (props.commission) {
      // While paid the booked income is the agreed price: it cannot change until the payment is taken back.
      // The server's copy decides, as another device may have changed the payment since this screen loaded.
      const fresh = await getCommission(props.commission.id)
      const locked = validateCommission({ ...form.value, anonymised: anonymised.value, lockedPrice: isPaid(fresh) ? Number(fresh.agreed_price) : null })
      if (locked) {
        error.value = locked
        return
      }
      const record = await updateCommission(props.commission.id, fields)
      if (!Array.isArray(record.items)) throw new Error(NOT_MIGRATED)
      emit('changed', record)
      mode.value = 'view'
    } else {
      const record = await createCommission(fields)
      if (!Array.isArray(record.items)) throw new Error(NOT_MIGRATED)
      emit('saved', record)
      emit('update:open', false)
      toast('Commission created')
    }
  } catch (err) {
    // PocketBase 0.22 reports field errors under response.data.<field>
    // A server without the migration has no items field and still requires an article
    if (err?.message === NOT_MIGRATED || (err?.status === 400 && err.response?.data?.article)) error.value = NOT_MIGRATED
    else if (err?.status === 400 && err.response?.data?.customer_email) error.value = 'Enter a valid email address'
    else error.value = failMessage(err, 'Could not save the commission. Try again.')
  } finally {
    busy.value = false
  }
}

const move = async (target) => {
  if (busy.value) return
  busy.value = true
  error.value = ''
  const delivering = target === 'delivered'
  let patchSent = false
  try {
    let current = props.commission
    if (delivering) {
      // A second device may have delivered it already: never act on a stale screen
      current = await getCommission(props.commission.id)
      if (current.status !== props.commission.status) {
        emit('changed', current)
        error.value = 'This commission was already updated — check its status'
        return
      }
    }
    patchSent = true
    const record = await updateCommission(props.commission.id, transitionPatch(current, target))
    patchSent = false
    confirming.value = ''
    // Delivering books nothing: the income is booked when the commission is marked paid
    emit('changed', record)
  } catch (err) {
    // The reply may have been lost after the server accepted "delivered": confirm before giving up
    const landed = delivering && patchSent ? await getCommission(props.commission.id).catch(() => null) : null
    if (landed?.status === 'delivered') {
      confirming.value = ''
      emit('changed', landed)
    } else {
      error.value = failMessage(err, 'Could not update the commission. Check your connection and try again.')
    }
  } finally {
    busy.value = false
  }
}

const PAYMENT_FAILED = 'Could not change the payment. Check your connection and try again.'

// Paid on books the income (see markPaid), Paid off takes it back (see markUnpaid). Any failure leaves the switch as it was.
const pay = async (choice = '') => {
  paymentTaps++
  if (busy.value) return
  busy.value = true
  error.value = ''
  try {
    const { record, ask, booked } = await markPaid(props.commission, props.articles, { choice })
    emit('changed', record)
    if (ask) {
      confirming.value = 'pay'
      return
    }
    confirming.value = ''
    if (booked) toast(`Paid — ${formatCurrency(booked)} added to balance`)
  } catch (err) {
    error.value = err?.message === NOT_MIGRATED ? NOT_MIGRATED : PAYMENT_FAILED
  } finally {
    busy.value = false
  }
}

const unpay = async () => {
  paymentTaps++
  if (busy.value) return
  busy.value = true
  error.value = ''
  confirming.value = ''
  try {
    emit('changed', await markUnpaid(props.commission))
  } catch {
    error.value = PAYMENT_FAILED
  } finally {
    busy.value = false
  }
}

// A paid commission whose income never arrived (it names one the server does not have) gets it booked
// when opened. Quiet in the background: a failure just leaves it for the next time.
function repairOnOpen () {
  const commission = props.commission
  if (busy.value || !commission?.payment_transaction || !isPaid(commission) || typeof navigator === 'undefined' || !navigator.onLine) return
  // Any tap on the switch after this calls it off
  const started = paymentTaps
  const stillWanted = () => paymentTaps === started && !busy.value
  repairPayment(commission, props.articles, { stillWanted })
    .then(({ record, booked }) => { if (booked && props.commission?.id === record.id) emit('changed', record) })
    .catch(() => {})
}

const setPaid = value => (value ? pay() : unpay())

const deleteData = async () => {
  if (busy.value) return
  busy.value = true
  error.value = ''
  try {
    const record = await anonymise(props.commission.id)
    confirming.value = ''
    emit('changed', record)
  } catch (err) {
    error.value = failMessage(err, 'Could not delete the customer data. Try again.')
  } finally {
    busy.value = false
  }
}
</script>
