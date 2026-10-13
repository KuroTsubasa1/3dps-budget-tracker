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
          <p class="label">Delivery</p>
          <SegmentedControl v-model="form.fulfilment" label="Delivery" :options="FULFILMENT_OPTIONS" />
        </div>
        <div v-if="form.fulfilment === 'shipping'">
          <label for="commission-address" class="label">Address</label>
          <textarea id="commission-address" v-model="form.address" rows="3" class="input py-2" />
        </div>
      </template>
      <div>
        <label for="commission-article" class="label">Article</label>
        <select id="commission-article" v-model="form.article" class="input pr-9">
          <option value="" disabled>Choose an article</option>
          <option v-for="article in articles" :key="article.id" :value="article.id">{{ article.name }}</option>
        </select>
      </div>
      <div class="grid grid-cols-2 gap-3">
        <div>
          <label for="commission-quantity" class="label">Quantity</label>
          <input id="commission-quantity" v-model="form.quantity" type="text" inputmode="numeric" class="input">
        </div>
        <div>
          <label for="commission-price" class="label">Agreed price</label>
          <input id="commission-price" v-model="form.price" type="text" inputmode="decimal" class="input" @input="priceTouched = true">
        </div>
      </div>
      <div>
        <label for="commission-notes" class="label">Notes <span class="font-normal text-ink-muted">(optional)</span></label>
        <textarea id="commission-notes" v-model="form.notes" rows="2" class="input py-2" placeholder="Colour, size, engraving…" />
      </div>
      <BaseButton type="submit" size="lg" block :loading="busy">{{ commission ? 'Save changes' : 'Create commission' }}</BaseButton>
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
        <div class="flex justify-between gap-3"><dt class="text-ink-muted">Delivery</dt><dd class="text-right text-ink">{{ commission.fulfilment === 'shipping' ? 'Shipping' : 'Pickup' }}</dd></div>
        <div v-if="commission.fulfilment === 'shipping'" class="flex justify-between gap-3"><dt class="text-ink-muted">Address</dt><dd class="whitespace-pre-line text-right text-ink">{{ commission.address }}</dd></div>
        <div class="flex justify-between gap-3"><dt class="text-ink-muted">Article</dt><dd class="text-right text-ink">{{ articleName }} × {{ commission.quantity }}</dd></div>
        <div class="flex justify-between gap-3"><dt class="text-ink-muted">Agreed price</dt><dd class="text-right font-semibold tabular-nums text-ink">{{ formatCurrency(Number(commission.agreed_price)) }}</dd></div>
        <div v-if="commission.notes" class="flex justify-between gap-3"><dt class="text-ink-muted">Notes</dt><dd class="whitespace-pre-line text-right text-ink">{{ commission.notes }}</dd></div>
      </dl>

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
        <BaseButton v-if="confirming !== 'cancel'" variant="ghost" block :disabled="busy" @click="confirming = 'cancel'">Cancel commission</BaseButton>
        <div v-else class="space-y-3">
          <p class="text-sm text-ink-muted">Cancel this commission? It moves to Done and can't be reopened.</p>
          <div class="grid grid-cols-2 gap-2">
            <BaseButton variant="secondary" @click="confirming = ''">Keep it</BaseButton>
            <BaseButton variant="danger" :loading="busy" @click="move('cancelled')">Yes, cancel</BaseButton>
          </div>
        </div>
      </div>

      <div v-if="!commission.anonymised_at" class="border-t border-line pt-4">
        <BaseButton v-if="confirming !== 'delete'" variant="ghost" block icon="trash" :disabled="busy" @click="confirming = 'delete'">Delete customer data</BaseButton>
        <div v-else class="space-y-3">
          <p class="text-sm text-ink-muted">Remove the name, email and address for good? The article, price and status stay.</p>
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
import { ref, computed, watch } from 'vue'
import { useCommissions } from '~/composables/useCommissions'
import { useTransactions } from '~/composables/useTransactions'
import { useToast } from '~/composables/useToast'
import { formatCurrency } from '~/utils/currency'
import { priceCart } from '~/utils/deals'
import {
  STATUS_LABEL,
  NEXT,
  PREVIOUS,
  NEXT_ACTION,
  isFinal,
  canCancel,
  transitionPatch,
  incomeFor,
  validateCommission
} from '~/utils/commissions'

const props = defineProps({
  open: { type: Boolean, default: false },
  commission: { type: Object, default: null },
  articles: { type: Array, required: true },
  deals: { type: Array, default: () => [] },
  presetArticleId: { type: String, default: '' }
})
const emit = defineEmits(['update:open', 'saved', 'changed'])

const STEPS = ['open', 'printing', 'ready', 'delivered']
const FULFILMENT_OPTIONS = [
  { value: 'pickup', label: 'Pickup' },
  { value: 'shipping', label: 'Shipping' }
]

const { getCommission, createCommission, updateCommission, anonymise } = useCommissions()
const { addTransaction } = useTransactions()
const { toast } = useToast()

const mode = ref('view')
const form = ref({})
const priceTouched = ref(false)
const error = ref('')
const busy = ref(false)
const confirming = ref('')

const toPriceText = amount => (Number(amount) > 0 ? Number(amount).toFixed(2).replace('.', ',') : '')
const parseNumber = value => Number(String(value).trim().replace(',', '.'))

const blankForm = () => ({ customerName: '', email: '', fulfilment: 'pickup', address: '', article: props.presetArticleId, quantity: '1', price: '', notes: '' })
const formFrom = commission => ({
  customerName: commission.customer_name,
  email: commission.customer_email,
  fulfilment: commission.fulfilment,
  address: commission.address,
  article: commission.article,
  quantity: String(commission.quantity),
  price: toPriceText(commission.agreed_price),
  notes: commission.notes
})

const title = computed(() => {
  if (mode.value === 'form') return props.commission ? 'Edit commission' : 'New commission'
  return 'Commission'
})

const articleById = id => props.articles.find(article => article.id === id)
const articleName = computed(() => props.commission?.expand?.article?.name ?? articleById(props.commission?.article)?.name ?? 'Unknown article')
const anonymised = computed(() => !!props.commission?.anonymised_at)
const customerLabel = computed(() => (props.commission?.anonymised_at ? 'Anonymised' : props.commission?.customer_name))

// Deal-aware suggestion for the chosen article and quantity
const suggestedPrice = computed(() => {
  const article = articleById(form.value.article)
  const quantity = parseNumber(form.value.quantity)
  if (!article || !Number.isInteger(quantity) || quantity < 1) return 0
  return priceCart([{
    articleId: article.id,
    name: article.name,
    quantity,
    categoryId: article.category,
    basePrice: article.expand?.category?.base_price ?? 0,
    override: Number(article.price) > 0 ? Number(article.price) : 0
  }], props.deals).total
})

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
  } else {
    mode.value = 'form'
    form.value = blankForm()
    priceTouched.value = false
    // Re-opening for the same article leaves suggestedPrice unchanged, so its watcher would not fire
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
        fulfilment: form.value.fulfilment,
        address: shipping ? form.value.address.trim() : ''
      }
  const fields = {
    ...customer,
    article: form.value.article,
    quantity: parseNumber(form.value.quantity),
    agreed_price: parseNumber(form.value.price),
    notes: form.value.notes.trim()
  }
  try {
    if (props.commission) {
      const record = await updateCommission(props.commission.id, fields)
      emit('changed', record)
      mode.value = 'view'
    } else {
      const record = await createCommission(fields)
      emit('saved', record)
      emit('update:open', false)
      toast('Commission created')
    }
  } catch (err) {
    error.value = failMessage(err, 'Could not save the commission. Try again.')
  } finally {
    busy.value = false
  }
}

// The commission is updated first; income is only booked once the server has accepted "delivered"
const bookDelivery = (record) => {
  emit('changed', record)
  const income = incomeFor(record, record.expand?.article?.name ?? articleName.value)
  addTransaction({ ...income, date: new Date().toISOString().split('T')[0] })
  toast(`Delivered — ${formatCurrency(income.amount)} added to balance`)
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
      // A second device may have delivered it already: never book from a stale screen
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
    if (delivering) bookDelivery(record)
    else emit('changed', record)
  } catch (err) {
    // The reply may have been lost after the server accepted "delivered": confirm before giving up
    const landed = delivering && patchSent ? await getCommission(props.commission.id).catch(() => null) : null
    if (landed?.status === 'delivered') {
      confirming.value = ''
      bookDelivery(landed)
    } else {
      error.value = failMessage(err, 'Could not update the commission. Check your connection and try again.')
    }
  } finally {
    busy.value = false
  }
}

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
