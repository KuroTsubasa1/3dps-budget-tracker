<template>
  <BaseCard title="Deals" subtitle="Cart prices for several items" icon="cash" flush>
    <template #actions>
      <BaseButton variant="ghost" icon="plus" aria-label="Add deal" @click="openEditor(null)">Add</BaseButton>
    </template>

    <p v-if="loadError" class="px-4 py-6 text-sm text-expense md:px-5">{{ loadError }}</p>
    <p v-else-if="!deals.length" class="px-4 py-6 text-sm text-ink-muted md:px-5">No deals yet</p>
    <ul v-else class="divide-y divide-line" aria-label="Deals">
      <li v-for="deal in deals" :key="deal.id">
        <button
          type="button"
          class="flex min-h-[56px] w-full items-center gap-3 px-4 py-2 text-left hover:bg-muted md:px-5"
          :aria-label="`Edit ${deal.name}`"
          @click="openEditor(deal)"
        >
          <span class="min-w-0 flex-1">
            <span class="block truncate text-sm font-medium text-ink">{{ deal.name }}</span>
            <span class="block truncate text-xs text-ink-muted">{{ categoryNames(deal) }}</span>
          </span>
          <span class="shrink-0 text-sm tabular-nums text-ink-muted">{{ describeDeal(deal) }}</span>
        </button>
      </li>
    </ul>

    <BottomSheet v-model:open="isEditorOpen" :title="editing ? 'Edit deal' : 'New deal'">
      <form class="space-y-4" novalidate @submit.prevent="save">
        <p v-if="error" role="alert" class="rounded-lg bg-expense/10 px-3 py-2 text-sm text-expense">{{ error }}</p>

        <div>
          <label for="deal-name" class="label">Name</label>
          <input id="deal-name" v-model="form.name" type="text" class="input" autocomplete="off">
        </div>

        <div>
          <p class="label">Type</p>
          <SegmentedControl v-model="form.type" label="Deal type" :options="TYPE_OPTIONS" />
        </div>

        <fieldset>
          <legend class="label">Categories</legend>
          <div class="divide-y divide-line rounded-lg border border-line">
            <label v-for="category in categories" :key="category.id" class="flex min-h-[44px] cursor-pointer items-center gap-3 px-3">
              <input v-model="form.categories" type="checkbox" :value="category.id" class="h-5 w-5 rounded border-line text-accent focus:ring-accent/30">
              <span class="min-w-0 flex-1 truncate text-sm text-ink">{{ category.name }}</span>
              <span class="shrink-0 text-xs tabular-nums text-ink-muted">{{ formatCurrency(category.base_price) }}</span>
            </label>
          </div>
        </fieldset>

        <div class="grid grid-cols-2 gap-3">
          <div>
            <label for="deal-qty" class="label">Number of items (N)</label>
            <input id="deal-qty" v-model="form.minQty" type="text" inputmode="numeric" class="input" placeholder="2">
          </div>
          <div>
            <label for="deal-price" class="label">Price</label>
            <input id="deal-price" v-model="form.price" type="text" inputmode="decimal" class="input" placeholder="0.00">
            <p class="hint">{{ form.type === 'bundle' ? 'For all N items together' : 'Per item' }}</p>
          </div>
        </div>

        <p v-if="example" class="rounded-lg bg-muted px-3 py-2 text-sm text-ink" data-testid="deal-example">{{ example }}</p>

        <BaseButton type="submit" size="lg" block :loading="saving">Save</BaseButton>
      </form>

      <div v-if="editing" class="mt-6 border-t border-line pt-5">
        <BaseButton v-if="!confirmingDelete" variant="ghost" block icon="trash" @click="confirmingDelete = true">Delete deal</BaseButton>
        <div v-else class="space-y-3">
          <p class="text-sm text-ink-muted">Delete “{{ editing.name }}”? Carts stop using it straight away.</p>
          <div class="grid grid-cols-2 gap-2">
            <BaseButton variant="secondary" @click="confirmingDelete = false">Cancel</BaseButton>
            <BaseButton variant="danger" :loading="deleting" @click="remove">Delete</BaseButton>
          </div>
        </div>
      </div>
    </BottomSheet>
  </BaseCard>
</template>

<script setup>
import { ref, computed, onMounted } from 'vue'
import { useDeals } from '~/composables/useDeals'
import { useCategories } from '~/composables/useCategories'
import { formatCurrency } from '~/utils/currency'
import { describeDeal, isValidDeal, priceCart } from '~/utils/deals'

const TYPE_OPTIONS = [
  { value: 'bundle', label: 'N for X €' },
  { value: 'group', label: 'Each X € from N' }
]

const { listDeals, createDeal, updateDeal, deleteDeal } = useDeals()
const { listCategories } = useCategories()

const deals = ref([])
const categories = ref([])
const loadError = ref('')
const isEditorOpen = ref(false)
const editing = ref(null)
const form = ref({ name: '', type: 'bundle', categories: [], minQty: '2', price: '' })
const error = ref('')
const saving = ref(false)
const deleting = ref(false)
const confirmingDelete = ref(false)

const load = async () => {
  try {
    const [dealList, categoryList] = await Promise.all([listDeals(), listCategories()])
    deals.value = dealList
    categories.value = categoryList
    loadError.value = ''
  } catch (err) {
    loadError.value = 'Could not load deals. Check your connection and try again.'
  }
}

onMounted(load)

const categoryName = id => categories.value.find(category => category.id === id)?.name ?? 'Unknown'
const categoryNames = deal => deal.categories.map(categoryName).join(', ')

const openEditor = (deal) => {
  editing.value = deal
  form.value = deal
    ? { name: deal.name, type: deal.type, categories: [...deal.categories], minQty: String(deal.min_qty), price: String(deal.price) }
    : { name: '', type: 'bundle', categories: [], minQty: '2', price: '' }
  error.value = ''
  confirmingDelete.value = false
  isEditorOpen.value = true
}

const parseNumber = value => Number(String(value).trim().replace(',', '.'))

const draft = computed(() => ({
  id: editing.value?.id ?? 'draft',
  name: form.value.name.trim(),
  type: form.value.type,
  categories: form.value.categories,
  min_qty: parseNumber(form.value.minQty),
  price: parseNumber(form.value.price)
}))

// One worked example so the owner can sanity-check the deal before saving
const example = computed(() => {
  if (!isValidDeal(draft.value)) return ''
  const first = categories.value.find(category => category.id === draft.value.categories[0])
  if (!first) return ''
  const quantity = draft.value.type === 'bundle' ? draft.value.min_qty + 1 : draft.value.min_qty
  const { total } = priceCart([{ articleId: 'example', name: first.name, quantity, categoryId: first.id, basePrice: first.base_price, override: 0 }], [draft.value])
  return `${quantity} items → ${formatCurrency(total)}`
})

const validate = () => {
  const deal = draft.value
  if (!deal.name) return 'Enter a name'
  if (!deal.categories.length) return 'Choose a category'
  if (deal.type === 'bundle' && deal.categories.length !== 1) return 'Choose exactly one category for an "N for X €" deal'
  if (!Number.isInteger(deal.min_qty) || deal.min_qty < 2) return 'N must be a whole number of 2 or more'
  if (!(deal.price > 0)) return 'Price must be above 0'
  // One deal per category; the deal being edited may keep its own categories
  for (const id of deal.categories) {
    const other = deals.value.find(item => item.id !== editing.value?.id && item.categories.includes(id))
    if (other) return `${categoryName(id)} is already in the deal "${other.name}"`
  }
  return ''
}

const save = async () => {
  error.value = ''
  saving.value = true
  const { name, type, categories: chosen, min_qty: minQty, price } = draft.value
  const fields = { name, type, categories: chosen, min_qty: minQty, price }
  try {
    // Refresh first so the overlap check sees deals saved from another device
    deals.value = await listDeals()
    error.value = validate()
    if (error.value) return
    if (editing.value) await updateDeal(editing.value.id, fields)
    else await createDeal(fields)
    await load()
    isEditorOpen.value = false
  } catch (err) {
    error.value = 'Could not save the deal. Check your connection and try again.'
  } finally {
    saving.value = false
  }
}

const remove = async () => {
  deleting.value = true
  try {
    await deleteDeal(editing.value.id)
    await load()
    isEditorOpen.value = false
  } catch (err) {
    error.value = 'Could not delete the deal. Check your connection and try again.'
    confirmingDelete.value = false
  } finally {
    deleting.value = false
  }
}
</script>
