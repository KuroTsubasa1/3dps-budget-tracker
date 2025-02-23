<template>
  <div class="min-h-screen flex">
    <!-- Fixed Left Sidebar (1/3 width) -->
    <div class="w-1/3 fixed top-16 bottom-0 left-0 bg-white/90 border-r border-gray-200/50 backdrop-blur-sm">
      <!-- Total Summary Section (1/3 height) -->
      <div class="h-1/3 p-6 border-b border-gray-200/50">
        <h2 class="text-lg font-semibold text-gray-800 mb-4">Selected Products</h2>
        <div class="text-center space-y-4">
          <div>
            <p class="text-sm text-gray-500">Total Amount</p>
            <p class="text-2xl font-bold text-green-600">{{ formatCurrency(totalAmount) }}</p>
          </div>
          <button 
            @click="submitToBalance"
            class="w-full px-6 py-4 text-lg font-semibold text-white bg-gradient-to-r from-blue-600 to-blue-800 hover:from-blue-700 hover:to-blue-900 rounded-xl shadow-lg hover:shadow-xl transition-all duration-300 ease-in-out transform hover:-translate-y-0.5 hover:scale-[1.02] active:scale-[0.98] disabled:opacity-50 disabled:cursor-not-allowed"
            :disabled="selectedProducts.length === 0"
          >
            Add to Balance
          </button>
        </div>
      </div>
      <!-- Selected Products List (2/3 height) -->
      <div class="h-2/3 overflow-y-auto">
        <div class="p-6 space-y-4">
          <template v-if="selectedProducts.length > 0">
            <div v-for="product in selectedProducts" :key="product.id" class="flex justify-between items-center p-4 bg-gray-50 rounded-xl">
              <div>
                <h4 class="font-medium text-gray-800">{{ product.name }} (x{{ product.quantity }})</h4>
                <p class="text-sm text-gray-500">{{ formatCurrency(product.price * product.quantity) }}</p>
              </div>
              <div class="flex items-center space-x-2">
                <button @click="decrementQuantity(product)" class="text-blue-500 hover:text-blue-600 px-2">−</button>
                <span class="text-gray-600">{{ product.quantity }}</span>
                <button @click="incrementQuantity(product)" class="text-blue-500 hover:text-blue-600 px-2">+</button>
                <button @click="removeProduct(product)" class="text-red-500 hover:text-red-600 ml-2">
                  <span class="sr-only">Remove</span>
                  ×
                </button>
              </div>
            </div>
          </template>
          <p v-else class="text-sm text-gray-500 text-center">No products selected</p>
        </div>
      </div>
    </div>

    <!-- Scrollable Right Content (2/3 width) -->
    <div class="w-2/3 ml-[33.333333%] min-h-screen">
      <div class="max-w-5xl mx-auto py-6 px-4 sm:px-6 lg:px-8">
        <div class="mb-6 flex justify-between items-center">
          <div class="flex items-center space-x-4">
            <input
              type="text"
              v-model="searchQuery"
              placeholder="Search products..."
              class="px-4 py-2 rounded-xl border border-gray-200 focus:outline-none focus:ring-2 focus:ring-blue-500/50 focus:border-transparent"
              @keyup.enter="focusFirstProduct"
            />
            <select
              v-model="sortOption"
              class="px-4 py-2 rounded-xl border border-gray-200 focus:outline-none focus:ring-2 focus:ring-blue-500/50 focus:border-transparent"
            >
              <option value="name">Sort by Name</option>
              <option value="price">Sort by Price</option>
            </select>
            <button
              @click="sortDirection = sortDirection === 'asc' ? 'desc' : 'asc'"
              class="p-2 rounded-xl border border-gray-200 hover:bg-gray-50"
            >
              {{ sortDirection === 'asc' ? '↑' : '↓' }}
            </button>
          </div>
        </div>
        <div v-if="loading" class="flex justify-center items-center h-64">
          <div class="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-500"></div>
        </div>
        <div v-else-if="error" class="text-center p-6 bg-red-50 rounded-xl">
          <p class="text-red-600">{{ error }}</p>
          <button @click="fetchProducts" class="mt-4 px-4 py-2 bg-red-100 text-red-700 rounded-lg hover:bg-red-200">
            Try Again
          </button>
        </div>
        <div v-else class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          <!-- Product Cards -->
          <div
            v-for="product in filteredProducts"
            :key="product.id"
            class="card hover:scale-[1.02] transition-transform duration-300 cursor-pointer bg-white border border-gray-200/50 rounded-xl shadow-sm hover:shadow-lg p-4 mb-2"
            :class="{ 'ring-2 ring-blue-500': isSelected(product) }"
            @click="incrementQuantity(product)"
          >
            <div class="card-body">
              <div v-if="product.images && product.images.length > 0" class="mb-4 h-48 overflow-hidden rounded-lg bg-gray-50">
                <img 
                  :src="`https://pocket.lasseharm.space/api/files/${product.collectionId}/${product.id}/${product.images[0]}?thumb=300x300`"
                  :alt="product.name"
                  class="w-full h-full object-cover"
                />
              </div>
              <h3 class="text-lg font-semibold text-gray-800 mb-2">{{ product.name }}</h3>
              <p class="text-sm text-gray-500 mb-4">{{ product.description }}</p>
              <div class="flex justify-between items-center">
                <p class="text-lg font-bold text-blue-600">{{ formatCurrency(product.price) }}</p>
                <div class="flex items-center space-x-2">
                  <template v-if="isSelected(product)">
                    <button @click.stop="decrementQuantity(product)" class="text-blue-500 hover:text-blue-600 px-2">−</button>
                    <span class="text-gray-600 w-6 text-center">{{ product.quantity }}</span>
                    <button @click.stop="incrementQuantity(product)" class="text-blue-500 hover:text-blue-600 px-2">+</button>
                  </template>
                  <div v-else class="h-6 w-6 rounded-full border-2 border-gray-300 flex items-center justify-center"></div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, onMounted } from 'vue'
import { formatCurrency } from '~/utils/currency'
import { useTransactions } from '~/composables/useTransactions'

const products = ref([])
const loading = ref(false)
const error = ref(null)

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

onMounted(() => {
  fetchProducts()
  const savedFavorites = localStorage.getItem('favorites')
  if (savedFavorites) {
    favorites.value = JSON.parse(savedFavorites)
  }
})

const selectedProducts = computed(() => products.value.filter(p => p.quantity > 0))

const totalAmount = computed(() => {
  return products.value.reduce((sum, product) => sum + (product.price * product.quantity), 0)
})

const isSelected = (product) => {
  return product.quantity > 0
}

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

const submitToBalance = () => {
  if (selectedProducts.value.length === 0) return
  
  const productNames = selectedProducts.value
    .map(product => `${product.name} (${formatCurrency(product.price)} × ${product.quantity})`)
    .join('\n')

  addTransaction({
    description: `3D Printing Products:\n${productNames}`,
    amount: totalAmount.value,
    date: new Date().toISOString().split('T')[0]
  })

  // Reset all product quantities to 0
  products.value.forEach(product => product.quantity = 0)
}
// Add to script setup section
const searchQuery = ref('')
// Add keyboard shortcuts
onMounted(() => {
  window.addEventListener('keydown', handleKeyboardShortcuts)
})

const handleKeyboardShortcuts = (event) => {
  if (event.ctrlKey || event.metaKey) {
    switch(event.key) {
      case 'f':
        event.preventDefault()
        document.querySelector('input[type="text"]').focus()
        break
      case 's':
        event.preventDefault()
        document.querySelector('select').focus()
        break
    }
  }
}

const focusFirstProduct = () => {
  const firstProduct = document.querySelector('.card')
  if (firstProduct) firstProduct.focus()
}
</script>