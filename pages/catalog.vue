<template>
  <div :class="{ 'pb-20': !isDesktop && selectedProducts.length }">
    <div class="lg:grid lg:grid-cols-[minmax(0,1fr)_20rem] lg:items-start lg:gap-6">
      <div class="min-w-0">
        <PageHeader title="Product Catalog" subtitle="Browse and select 3D printing products" />

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
            <button type="button" class="chip chip-idle" @click="sortDirection = sortDirection === 'asc' ? 'desc' : 'asc'">
              <AppIcon name="sort" class="h-4 w-4" />
              {{ sortDirection === 'asc' ? 'A to Z' : 'Z to A' }}
            </button>
          </div>
        </div>

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
          <BaseButton variant="secondary" icon="x" @click="searchQuery = ''">Clear Search</BaseButton>
        </div>

        <div v-else class="grid grid-cols-2 gap-3 md:grid-cols-3 md:gap-4 xl:grid-cols-4">
          <article
            v-for="product in filteredProducts"
            :key="product.id"
            class="card flex cursor-pointer flex-col overflow-hidden transition-shadow"
            :class="{ 'ring-2 ring-accent': isSelected(product) }"
            @click="incrementQuantity(product)"
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
              <div class="hidden sm:block">
                <p class="line-clamp-2 text-xs text-ink-muted">{{ product.description }}</p>
              </div>
              <div class="mt-auto flex flex-wrap items-center justify-between gap-2">
                <p class="text-sm font-semibold tabular-nums text-ink">{{ formatCurrency(product.price) }}</p>
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
              </div>
            </div>
          </article>
        </div>
      </div>

      <aside v-if="isDesktop" class="lg:sticky lg:top-20">
        <BaseCard title="Cart" subtitle="Selected products for purchase" icon="cart">
          <CartPanel
            :items="selectedProducts"
            :total="totalAmount"
            @increment="incrementQuantity"
            @decrement="decrementQuantity"
            @remove="removeProduct"
            @submit="submitToBalance"
          />
        </BaseCard>
      </aside>
    </div>

    <template v-if="!isDesktop">
      <button
        v-if="selectedProducts.length && !isCartOpen"
        type="button"
        class="fixed inset-x-4 z-30 flex min-h-[52px] items-center justify-between gap-3 rounded-xl bg-accent px-4 text-white shadow-lg bottom-above-nav md:bottom-6 md:left-auto md:right-6 md:w-80"
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
          @increment="incrementQuantity"
          @decrement="decrementQuantity"
          @remove="removeProduct"
          @submit="submitToBalance"
        />
      </BottomSheet>
    </template>
  </div>
</template>

<script setup>
import { ref, computed, onMounted, onBeforeUnmount } from 'vue'
import { useTransactions } from '~/composables/useTransactions'
import { useMediaQuery } from '~/composables/useMediaQuery'
import { useToast } from '~/composables/useToast'
import { formatCurrency } from '~/utils/currency'

const products = ref([])
const loading = ref(false)
const error = ref(null)

const isDesktop = useMediaQuery('(min-width: 1024px)')
const isCartOpen = ref(false)
const searchInput = ref(null)
const sortSelect = ref(null)

const fetchProducts = async () => {
  loading.value = true
  error.value = null
  try {
    const response = await fetch('https://pocket.lasseharm.space/api/collections/budget_tracket_catalog/records')
    if (!response.ok) throw new Error('Failed to fetch products')
    const data = await response.json()
    products.value = data.items.map(item => ({
      ...item,
      quantity: 0
    }))
  } catch (err) {
    error.value = err.message
  } finally {
    loading.value = false
  }
}

const imageUrl = product =>
  `https://pocket.lasseharm.space/api/files/${product.collectionId}/${product.id}/${product.images[0]}?thumb=300x300`

const sortOption = ref('name') // 'name', 'price'
const sortDirection = ref('asc') // 'asc', 'desc'
const favorites = ref([])

const toggleFavorite = (product) => {
  const index = favorites.value.findIndex(fav => fav.id === product.id)
  if (index === -1) {
    favorites.value.push(product)
  } else {
    favorites.value.splice(index, 1)
  }
  localStorage.setItem('favorites', JSON.stringify(favorites.value))
}

const isFavorite = (product) => {
  return favorites.value.some(fav => fav.id === product.id)
}

const sortProducts = (products) => {
  return [...products].sort((a, b) => {
    const modifier = sortDirection.value === 'asc' ? 1 : -1
    if (sortOption.value === 'price') {
      return (a.price - b.price) * modifier
    }
    return a.name.localeCompare(b.name) * modifier
  })
}

const searchQuery = ref('')

const filteredProducts = computed(() => {
  let result = products.value
  if (searchQuery.value) {
    const query = searchQuery.value.toLowerCase()
    result = result.filter(product =>
      product.name.toLowerCase().includes(query) ||
      product.description.toLowerCase().includes(query)
    )
  }
  return sortProducts(result)
})

const selectedProducts = computed(() => products.value.filter(p => p.quantity > 0))

const totalAmount = computed(() => {
  return products.value.reduce((sum, product) => sum + (product.price * product.quantity), 0)
})

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

const { addTransaction } = useTransactions()
const { toast } = useToast()

const submitToBalance = () => {
  if (selectedProducts.value.length === 0) return

  const total = totalAmount.value
  const productNames = selectedProducts.value
    .map(product => `${product.name} (${formatCurrency(product.price)} × ${product.quantity})`)
    .join('\n')

  addTransaction({
    description: `3D Printing Products:\n${productNames}`,
    amount: total,
    date: new Date().toISOString().split('T')[0]
  })

  // Reset all product quantities to 0
  products.value.forEach(product => { product.quantity = 0 })
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
  const savedFavorites = localStorage.getItem('favorites')
  if (savedFavorites) {
    favorites.value = JSON.parse(savedFavorites)
  }
  window.addEventListener('keydown', handleKeyboardShortcuts)
})

onBeforeUnmount(() => {
  window.removeEventListener('keydown', handleKeyboardShortcuts)
})
</script>
