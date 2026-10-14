<template>
  <div :class="{ 'pb-20': showCartBar }">
    <div class="lg:grid lg:items-start lg:gap-6" :class="{ 'lg:grid-cols-[minmax(0,1fr)_20rem]': isOwner }">
      <div class="min-w-0">
        <PageHeader title="Product Catalog" subtitle="Browse and select 3D printing products">
          <template v-if="isOwner" #actions>
            <BaseButton variant="secondary" :class="managing ? 'border-accent bg-accent/10 text-accent' : ''" icon="cog" :aria-pressed="managing" @click="managing = !managing">
              {{ managing ? 'Done' : 'Manage' }}
            </BaseButton>
          </template>
        </PageHeader>

        <div class="mb-4 space-y-3">
          <div class="relative">
            <AppIcon name="search" class="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-muted" />
            <input
              ref="searchInput"
              v-model="searchQuery"
              type="text"
              class="input pl-9"
              placeholder="Search products..."
              aria-label="Search products"
            >
          </div>
          <div class="flex gap-2">
            <select ref="sortSelect" v-model="sortOption" class="input w-auto flex-1 pr-9 sm:flex-none" aria-label="Sort by">
              <option value="name">Sort by Name</option>
              <option value="price">Sort by Price</option>
            </select>
            <button type="button" class="chip" :class="sortOption !== 'name' || sortDirection !== 'asc' ? 'chip-active' : 'chip-idle'" @click="sortDirection = sortDirection === 'asc' ? 'desc' : 'asc'">
              <AppIcon name="sort" class="h-4 w-4" />
              {{ sortDirection === 'asc' ? 'A to Z' : 'Z to A' }}
            </button>
          </div>
          <div v-if="categories.length" class="no-scrollbar -mx-4 flex gap-2 overflow-x-auto px-4 md:mx-0 md:flex-wrap md:px-0" role="group" aria-label="Categories">
            <button
              type="button"
              class="chip"
              :class="selectedCategory === 'all' ? 'chip-active' : 'chip-idle'"
              :aria-pressed="selectedCategory === 'all'"
              @click="selectedCategory = 'all'"
            >
              All
            </button>
            <button
              v-for="category in categories"
              :key="category.id"
              type="button"
              class="chip"
              :class="selectedCategory === category.id ? 'chip-active' : 'chip-idle'"
              :aria-pressed="selectedCategory === category.id"
              @click="selectedCategory = category.id"
            >
              {{ category.name }}
            </button>
          </div>
        </div>

        <BaseButton v-if="managing" class="mb-4" block icon="plus" @click="openEditor(null)">New article</BaseButton>

        <div v-if="loading" class="card flex h-48 flex-col items-center justify-center gap-3">
          <span class="h-8 w-8 animate-spin rounded-full border-4 border-muted border-t-accent" aria-hidden="true" />
          <p class="text-sm text-ink-muted">Loading products...</p>
        </div>

        <div v-else-if="error" class="card px-4 py-8 text-center">
          <AppIcon name="exclamation" class="mx-auto mb-3 h-8 w-8 text-expense" />
          <p class="mb-4 text-sm text-expense">{{ error }}</p>
          <BaseButton variant="secondary" icon="refresh" @click="fetchProducts">Try Again</BaseButton>
        </div>

        <div v-else-if="filteredProducts.length === 0" class="card px-4 py-8 text-center">
          <p class="text-sm font-medium text-ink">No products match your search</p>
          <p class="mb-4 mt-1 text-sm text-ink-muted">Try adjusting your search criteria</p>
          <BaseButton variant="secondary" icon="x" @click="clearFilters">Clear Search</BaseButton>
        </div>

        <div v-else class="grid grid-cols-2 gap-3 md:grid-cols-3 md:gap-4 xl:grid-cols-4">
          <article
            v-for="product in filteredProducts"
            :key="product.id"
            class="card flex flex-col overflow-hidden transition-shadow"
            :class="{ 'cursor-pointer': isOwner, 'ring-2 ring-accent': isSelected(product) }"
            @click="onCardClick(product)"
          >
            <div class="relative aspect-square bg-muted">
              <img
                v-if="product.images && product.images.length > 0"
                :src="imageUrl(product)"
                :alt="product.name"
                class="h-full w-full object-cover"
                loading="lazy"
              >
              <div v-else class="flex h-full items-center justify-center text-ink-muted">
                <AppIcon name="image" class="h-10 w-10" />
              </div>
              <span
                v-if="isSelected(product)"
                class="absolute right-2 top-2 flex h-6 min-w-[1.5rem] items-center justify-center rounded-full bg-accent px-1.5 text-xs font-semibold text-white"
              >
                {{ product.quantity }}
              </span>
            </div>
            <div class="flex flex-1 flex-col gap-2 p-3">
              <h3 class="line-clamp-2 break-words text-sm font-semibold text-ink">{{ product.name }}</h3>
              <span class="self-start rounded-full px-2 py-0.5 text-xs font-medium" :class="STOCK_BADGE[stockStatus(product.stock, product.low_stock_threshold)]">
                {{ stockLabel(product) }}
              </span>
              <span v-if="dealHint(product)" class="self-start rounded-full bg-accent/10 px-2 py-0.5 text-xs font-medium text-accent">
                {{ dealHint(product) }}
              </span>
              <div class="hidden sm:block">
                <p class="line-clamp-2 text-xs text-ink-muted">{{ product.description }}</p>
              </div>
              <div class="mt-auto flex flex-wrap items-center justify-between gap-2">
                <p class="text-sm font-semibold tabular-nums text-ink">{{ formatCurrency(priceOf(product)) }}</p>
                <template v-if="isOwner && !managing">
                  <QuantityStepper
                    v-if="isSelected(product)"
                    :quantity="product.quantity"
                    :name="product.name"
                    @increment="incrementQuantity(product)"
                    @decrement="decrementQuantity(product)"
                  />
                  <button
                    v-else
                    type="button"
                    class="flex h-11 w-11 items-center justify-center rounded-lg bg-accent/10 text-accent hover:bg-accent/20"
                    :aria-label="`Add ${product.name} to cart`"
                    @click.stop="incrementQuantity(product)"
                  >
                    <AppIcon name="plus" class="h-5 w-5" />
                  </button>
                </template>
              </div>
            </div>
          </article>
        </div>
      </div>

      <aside v-if="isOwner && isDesktop" class="lg:sticky lg:top-20">
        <BaseCard title="Cart" subtitle="Selected products for purchase" icon="cart">
          <CartPanel
            :items="selectedProducts"
            :total="totalAmount"
            :price-of="priceOf"
            :applied="pricedCart.applied"
            @increment="incrementQuantity"
            @decrement="decrementQuantity"
            @remove="removeProduct"
            @submit="submitToBalance"
          @commission="startCommission"
          />
        </BaseCard>
      </aside>
    </div>

    <template v-if="isOwner && !isDesktop">
      <button
        v-if="showCartBar"
        type="button"
        class="fixed inset-x-4 z-30 flex min-h-[52px] items-center justify-between gap-3 rounded-xl bg-accent px-4 text-white shadow-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/50 bottom-above-nav md:bottom-6 md:left-auto md:right-6 md:w-80"
        @click="isCartOpen = true"
      >
        <span class="text-sm font-medium">
          {{ selectedProducts.length }} items · <span class="tabular-nums">{{ formatCurrency(totalAmount) }}</span>
        </span>
        <span class="flex items-center gap-1 text-sm font-semibold">
          View cart
          <AppIcon name="chevron-right" class="h-4 w-4" />
        </span>
      </button>
      <BottomSheet v-model:open="isCartOpen" title="Cart">
        <CartPanel
          :items="selectedProducts"
          :total="totalAmount"
          :price-of="priceOf"
          :applied="pricedCart.applied"
          @increment="incrementQuantity"
          @decrement="decrementQuantity"
          @remove="removeProduct"
          @submit="submitToBalance"
            @commission="startCommission"
        />
      </BottomSheet>
    </template>

    <ArticleSheet
      v-model:open="isEditorOpen"
      :article="editingArticle"
      :categories="categories"
      @saved="onArticleSaved"
      @deleted="onArticleDeleted"
      @stock-changed="onStockChanged"
    />
  </div>
</template>

<script setup>
import { ref, computed, watch, onMounted, onBeforeUnmount } from 'vue'
import { useTransactions } from '~/composables/useTransactions'
import { localDate } from '~/utils/transactions'
import { useArticles } from '~/composables/useArticles'
import { useCategories } from '~/composables/useCategories'
import { useDeals } from '~/composables/useDeals'
import { useAuth } from '~/composables/useAuth'
import { useMediaQuery } from '~/composables/useMediaQuery'
import { useToast } from '~/composables/useToast'
import { useCommissionDraft } from '~/composables/useCommissionDraft'
import { formatCurrency } from '~/utils/currency'
import { effectivePrice } from '~/utils/pricing'
import { priceCart, describeDeal, dealForCategory } from '~/utils/deals'
import { saleLines } from '~/utils/reports/lines'
import { stockStatus, saleMovement, newRecordId } from '~/utils/inventory'

const STOCK_BADGE = {
  out: 'bg-expense/10 text-expense',
  low: 'bg-warning/10 text-warning',
  ok: 'bg-muted text-ink-muted'
}

const { listActive, imageUrl } = useArticles()
const { listCategories } = useCategories()
const { listDeals } = useDeals()
const { isOwner } = useAuth()

const products = ref([])
const categories = ref([])
const deals = ref([])
const loading = ref(false)
const error = ref(null)

const isDesktop = useMediaQuery('(min-width: 1024px)')
const isCartOpen = ref(false)
// The sheet is dropped at lg+; don't let it reappear (unlocked) when the screen shrinks again
watch(isDesktop, (desktop) => { if (desktop) isCartOpen.value = false })
const searchInput = ref(null)
const sortSelect = ref(null)

const fetchProducts = async () => {
  loading.value = true
  error.value = null
  try {
    // A missing `deals` collection (deploy made before the migration's --apply) means no deals
    const noDealsIfMissing = listDeals().catch(err => (err?.status === 404 ? [] : Promise.reject(err)))
    const [articles, categoryList, dealList] = await Promise.all([listActive(), listCategories(), noDealsIfMissing])
    products.value = articles.map(item => ({ ...item, quantity: 0 }))
    categories.value = categoryList
    deals.value = dealList
  } catch (err) {
    error.value = 'Could not load products. Check your connection and try again.'
  } finally {
    loading.value = false
  }
}

const priceOf = product => effectivePrice(product, product.expand?.category)

const stockLabel = (product) => {
  const status = stockStatus(product.stock, product.low_stock_threshold)
  if (status === 'out') return 'Out of stock'
  return status === 'low' ? `Low · ${product.stock} left` : `${product.stock} left`
}

const sortOption = ref('name') // 'name', 'price'
const sortDirection = ref('asc') // 'asc', 'desc'
const searchQuery = ref('')
const selectedCategory = ref('all')

const sortProducts = (list) => {
  return [...list].sort((a, b) => {
    const modifier = sortDirection.value === 'asc' ? 1 : -1
    if (sortOption.value === 'price') {
      return (priceOf(a) - priceOf(b)) * modifier
    }
    return a.name.localeCompare(b.name) * modifier
  })
}

const filteredProducts = computed(() => {
  let result = products.value
  if (selectedCategory.value !== 'all') {
    result = result.filter(product => product.category === selectedCategory.value)
  }
  if (searchQuery.value) {
    const query = searchQuery.value.toLowerCase()
    result = result.filter(product =>
      product.name.toLowerCase().includes(query) ||
      (product.description || '').toLowerCase().includes(query)
    )
  }
  return sortProducts(result)
})

const clearFilters = () => {
  searchQuery.value = ''
  selectedCategory.value = 'all'
}

const selectedProducts = computed(() => products.value.filter(p => p.quantity > 0))

// Cart lines in the shape priceCart expects; an article's own price (> 0) is an override that skips deals
const cartLines = computed(() => selectedProducts.value.map(product => ({
  articleId: product.id,
  name: product.name,
  quantity: product.quantity,
  categoryId: product.category,
  // Stored on the sale's lines, so the reports can name the category even after it changes
  categoryName: product.expand?.category?.name ?? '',
  basePrice: product.expand?.category?.base_price ?? 0,
  override: Number(product.price) > 0 ? Number(product.price) : 0
})))

const pricedCart = computed(() => priceCart(cartLines.value, deals.value))
const totalAmount = computed(() => pricedCart.value.total)

// Card hint: only regular (non-override) articles take part in deals
const dealHint = (product) => {
  if (Number(product.price) > 0) return ''
  const deal = dealForCategory(deals.value, product.category)
  return deal ? describeDeal(deal) : ''
}

const showCartBar = computed(() => isOwner.value && !isDesktop.value && selectedProducts.value.length > 0 && !isCartOpen.value)

const isSelected = product => product.quantity > 0

const incrementQuantity = (product) => {
  product.quantity++
}

const decrementQuantity = (product) => {
  if (product.quantity > 0) {
    product.quantity--
  }
}

const removeProduct = (product) => {
  product.quantity = 0
}

const managing = ref(false)
const isEditorOpen = ref(false)
const editingArticle = ref(null)

const openEditor = (article) => {
  editingArticle.value = article
  isEditorOpen.value = true
}

// In manage mode a tap edits the article; otherwise only the owner sells and visitors browse
const onCardClick = (product) => {
  if (managing.value) openEditor(product)
  else if (isOwner.value) incrementQuantity(product)
}

const onArticleSaved = (article) => {
  const index = products.value.findIndex(product => product.id === article.id)
  if (index === -1) products.value.push({ ...article, quantity: 0 })
  else products.value[index] = { ...article, quantity: products.value[index].quantity }
}

const onArticleDeleted = (id) => {
  products.value = products.value.filter(product => product.id !== id)
}

const onStockChanged = (id, stock) => {
  const product = products.value.find(item => item.id === id)
  if (product) product.stock = stock
}

const { setDraft } = useCommissionDraft()

// The cart's lines travel to the Commissions page once; the cart itself stays page-local and empties on leaving
const startCommission = () => {
  if (selectedProducts.value.length === 0) return
  setDraft(selectedProducts.value.map(product => ({ article: product.id, name: product.name, quantity: product.quantity })))
  isCartOpen.value = false
  navigateTo('/commissions')
}

const { addTransaction } = useTransactions()
const { toast } = useToast()

const submitToBalance = () => {
  if (selectedProducts.value.length === 0) return

  const total = totalAmount.value
  const productNames = selectedProducts.value
    .map(product => `${product.name} (${formatCurrency(priceOf(product))} × ${product.quantity})`)
    .join('\n')
  // Overselling is allowed: the movement deducts what is left and notes the rest
  const stockMovements = selectedProducts.value.map(product => ({
    id: newRecordId(),
    article: product.id,
    ...saleMovement(product.stock, product.quantity)
  }))

  const dealNote = pricedCart.value.applied.length
    ? `\nDeals: ${pricedCart.value.applied.map(deal => `${deal.name} (−${formatCurrency(deal.saving)})`).join(', ')}`
    : ''

  addTransaction({
    description: `3D Printing Products:\n${productNames}${dealNote}`,
    amount: total,
    date: localDate(),
    // The lines and the time of the sale for the reports: Σ lineTotal − Σ discount = amount
    items: saleLines(pricedCart.value, deals.value),
    sold_at: new Date().toISOString(),
    stockMovements
  })

  products.value.forEach((product) => {
    if (product.quantity) product.stock = Math.max(0, product.stock - product.quantity)
    product.quantity = 0
  })
  isCartOpen.value = false
  toast(`Added ${formatCurrency(total)} to balance`)
}

// Ctrl/Cmd+F focuses search, Ctrl/Cmd+S focuses sort
const handleKeyboardShortcuts = (event) => {
  if (!(event.ctrlKey || event.metaKey)) return
  if (event.key === 'f') {
    event.preventDefault()
    searchInput.value?.focus()
  } else if (event.key === 's') {
    event.preventDefault()
    sortSelect.value?.focus()
  }
}

onMounted(() => {
  fetchProducts()
  window.addEventListener('keydown', handleKeyboardShortcuts)
})

onBeforeUnmount(() => {
  window.removeEventListener('keydown', handleKeyboardShortcuts)
})
</script>
