<template>
  <div class="min-h-screen flex">
    <!-- Fixed Left Sidebar (1/3 width) -->
    <div class="w-1/3 fixed top-16 bottom-0 left-0 bg-white/90 border-r border-gray-200/50 backdrop-blur-sm shadow-lg z-10">
      <!-- Total Summary Section (1/3 height) -->
      <div class="h-1/3 p-6 border-b border-gray-200/50">
        <div class="flex items-center mb-5">
          <div class="flex-shrink-0 w-10 h-10 bg-blue-50 rounded-full flex items-center justify-center mr-3">
            <svg xmlns="http://www.w3.org/2000/svg" class="h-5 w-5 text-blue-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M3 3h2l.4 2M7 13h10l4-8H5.4M7 13L5.4 5M7 13l-2.293 2.293c-.63.63-.184 1.707.707 1.707H17m0 0a2 2 0 100 4 2 2 0 000-4zm-8 2a2 2 0 11-4 0 2 2 0 014 0z" />
            </svg>
          </div>
          <div>
            <h2 class="text-lg font-semibold text-gray-800">Cart</h2>
            <p class="text-xs text-gray-500">Selected products for purchase</p>
          </div>
        </div>
        
        <div class="rounded-xl bg-gradient-to-br from-green-50 to-green-100/50 p-4 shadow-sm border border-green-100 mb-5">
          <div class="flex items-center justify-between mb-2">
            <h3 class="text-sm font-semibold text-green-800">Total Order</h3>
            <div class="bg-green-100 rounded-full p-1.5">
              <svg xmlns="http://www.w3.org/2000/svg" class="h-4 w-4 text-green-700" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
            </div>
          </div>
          <div>
            <div class="flex justify-between items-baseline mb-1">
              <p class="text-sm text-green-700">Amount</p>
              <p class="text-xs text-green-500">{{ selectedProducts.length }} items</p>
            </div>
            <p class="text-3xl font-bold text-green-600">{{ formatCurrency(totalAmount) }}</p>
          </div>
        </div>
        
        <button 
          @click="submitToBalance"
          class="w-full flex items-center justify-center px-6 py-4 text-base font-semibold text-white bg-gradient-to-r from-blue-600 to-blue-700 hover:from-blue-700 hover:to-blue-800 rounded-xl shadow-md hover:shadow-lg transition-all duration-300 ease-in-out transform hover:-translate-y-0.5 disabled:opacity-60 disabled:cursor-not-allowed disabled:hover:translate-y-0"
          :disabled="selectedProducts.length === 0"
        >
          <svg xmlns="http://www.w3.org/2000/svg" class="h-5 w-5 mr-2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M17 9V7a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2m2 4h10a2 2 0 002-2v-6a2 2 0 00-2-2H9a2 2 0 00-2 2v6a2 2 0 002 2zm7-5a2 2 0 11-4 0 2 2 0 014 0z" />
          </svg>
          Add to Balance
        </button>
      </div>
      
      <!-- Selected Products List (2/3 height) -->
      <div class="h-2/3 overflow-y-auto">
        <div class="p-6 space-y-4">
          <div v-if="selectedProducts.length > 0" class="space-y-3">
            <div v-for="product in selectedProducts" :key="product.id" 
                class="flex justify-between items-center p-4 rounded-xl transition-all duration-200 hover:shadow-md border border-gray-100 bg-white">
              <div class="flex items-start space-x-3">
                <div v-if="product.images && product.images.length > 0" class="w-12 h-12 bg-gray-100 rounded-lg overflow-hidden flex-shrink-0">
                  <img 
                    :src="`https://pocket.lasseharm.space/api/files/${product.collectionId}/${product.id}/${product.images[0]}?thumb=60x60`"
                    :alt="product.name"
                    class="w-full h-full object-cover"
                  />
                </div>
                <div v-else class="w-12 h-12 bg-gray-100 rounded-lg flex items-center justify-center flex-shrink-0">
                  <svg xmlns="http://www.w3.org/2000/svg" class="h-6 w-6 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                  </svg>
                </div>
                <div>
                  <h4 class="font-medium text-gray-800 text-sm">{{ product.name }}</h4>
                  <p class="text-xs text-gray-500">{{ formatCurrency(product.price) }} each</p>
                </div>
              </div>
              <div class="flex items-center">
                <div class="bg-gray-50 rounded-lg flex items-center mr-2 border border-gray-100">
                  <button 
                    @click="decrementQuantity(product)" 
                    class="text-gray-500 hover:text-gray-700 w-8 h-8 flex items-center justify-center hover:bg-gray-100 rounded-l-lg transition-colors">
                    <svg xmlns="http://www.w3.org/2000/svg" class="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M18 12H6" />
                    </svg>
                  </button>
                  <span class="text-gray-800 font-medium w-8 text-center">{{ product.quantity }}</span>
                  <button 
                    @click="incrementQuantity(product)" 
                    class="text-gray-500 hover:text-gray-700 w-8 h-8 flex items-center justify-center hover:bg-gray-100 rounded-r-lg transition-colors">
                    <svg xmlns="http://www.w3.org/2000/svg" class="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 6v6m0 0v6m0-6h6m-6 0H6" />
                    </svg>
                  </button>
                </div>
                <p class="text-sm font-semibold text-blue-600 w-16 text-right">{{ formatCurrency(product.price * product.quantity) }}</p>
                <button 
                  @click="removeProduct(product)" 
                  class="ml-2 text-red-400 hover:text-red-600 w-8 h-8 rounded-full hover:bg-red-50 flex items-center justify-center transition-colors">
                  <svg xmlns="http://www.w3.org/2000/svg" class="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                  </svg>
                </button>
              </div>
            </div>
          </div>
          <div v-else class="py-8 text-center">
            <div class="inline-flex items-center justify-center w-16 h-16 bg-gray-100 rounded-full mb-4">
              <svg xmlns="http://www.w3.org/2000/svg" class="h-8 w-8 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M3 3h2l.4 2M7 13h10l4-8H5.4M7 13L5.4 5M7 13l-2.293 2.293c-.63.63-.184 1.707.707 1.707H17m0 0a2 2 0 100 4 2 2 0 000-4zm-8 2a2 2 0 11-4 0 2 2 0 014 0z" />
              </svg>
            </div>
            <p class="text-gray-500 mb-1">Your cart is empty</p>
            <p class="text-sm text-gray-400">Select products from the catalog</p>
          </div>
        </div>
      </div>
    </div>

    <!-- Scrollable Right Content (2/3 width) -->
    <div class="w-2/3 ml-[33.333333%] min-h-screen">
      <div class="max-w-5xl mx-auto py-6 px-4 sm:px-6 lg:px-8">
        <!-- Header with Icons -->
        <div class="mb-6 flex items-center">
          <div class="flex-shrink-0 w-10 h-10 bg-purple-50 rounded-full flex items-center justify-center mr-3">
            <svg xmlns="http://www.w3.org/2000/svg" class="h-5 w-5 text-purple-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2V6zM14 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2V6zM4 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2v-2zM14 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2v-2z" />
            </svg>
          </div>
          <div>
            <h2 class="text-lg font-semibold text-gray-800">Product Catalog</h2>
            <p class="text-xs text-gray-500">Browse and select 3D printing products</p>
          </div>
        </div>
        
        <!-- Search and Filters Card -->
        <div class="card mb-6 bg-white shadow-sm border border-gray-100 rounded-xl p-5">
          <div class="flex flex-wrap gap-4">
            <div class="flex-grow min-w-[200px]">
              <label class="block text-xs font-medium text-gray-600 mb-1">Search</label>
              <div class="relative">
                <input
                  type="text"
                  v-model="searchQuery"
                  placeholder="Search products..."
                  class="w-full px-4 py-2.5 pl-10 rounded-xl border border-gray-200 focus:outline-none focus:ring-2 focus:ring-blue-500/50 focus:border-transparent text-sm"
                  @keyup.enter="focusFirstProduct"
                />
                <div class="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400">
                  <svg xmlns="http://www.w3.org/2000/svg" class="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                  </svg>
                </div>
              </div>
            </div>
            
            <div class="w-40">
              <label class="block text-xs font-medium text-gray-600 mb-1">Sort By</label>
              <div class="relative">
                <select
                  v-model="sortOption"
                  class="w-full pl-3 pr-10 py-2.5 rounded-xl border border-gray-200 focus:outline-none focus:ring-2 focus:ring-blue-500/50 focus:border-transparent text-sm appearance-none bg-white"
                >
                  <option value="name">Sort by Name</option>
                  <option value="price">Sort by Price</option>
                </select>
                <div class="absolute right-3 top-1/2 transform -translate-y-1/2 text-gray-400 pointer-events-none">
                  <svg xmlns="http://www.w3.org/2000/svg" class="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 9l-7 7-7-7" />
                  </svg>
                </div>
              </div>
            </div>
            
            <div class="w-24">
              <label class="block text-xs font-medium text-gray-600 mb-1">Direction</label>
              <button
                @click="sortDirection = sortDirection === 'asc' ? 'desc' : 'asc'"
                class="w-full px-4 py-2.5 rounded-xl border border-gray-200 hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-blue-500/50 focus:border-transparent text-sm flex items-center justify-center"
              >
                <svg xmlns="http://www.w3.org/2000/svg" class="h-4 w-4 mr-1" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M7 16V4m0 0L3 8m4-4l4 4m6 0v12m0 0l4-4m-4 4l-4-4" />
                </svg>
                {{ sortDirection === 'asc' ? 'A to Z' : 'Z to A' }}
              </button>
            </div>
          </div>
        </div>
        
        <!-- Loading State -->
        <div v-if="loading" class="flex justify-center items-center h-64 card p-8 bg-white shadow-sm border border-gray-100 rounded-xl">
          <div class="text-center">
            <div class="inline-block animate-spin rounded-full h-12 w-12 border-4 border-blue-100 border-t-blue-500 mb-4"></div>
            <p class="text-gray-600">Loading products...</p>
          </div>
        </div>
        
        <!-- Error State -->
        <div v-else-if="error" class="card p-8 bg-white shadow-sm border border-red-100 rounded-xl text-center">
          <div class="inline-flex items-center justify-center w-16 h-16 bg-red-50 rounded-full mb-4">
            <svg xmlns="http://www.w3.org/2000/svg" class="h-8 w-8 text-red-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
          </div>
          <p class="text-red-600 mb-4">{{ error }}</p>
          <button 
            @click="fetchProducts" 
            class="px-4 py-2 bg-red-50 text-red-600 rounded-lg hover:bg-red-100 transition-colors inline-flex items-center"
          >
            <svg xmlns="http://www.w3.org/2000/svg" class="h-4 w-4 mr-1" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
            </svg>
            Try Again
          </button>
        </div>
        
        <!-- Empty State -->
        <div v-else-if="filteredProducts.length === 0" class="card p-8 bg-white shadow-sm border border-gray-100 rounded-xl text-center">
          <div class="inline-flex items-center justify-center w-16 h-16 bg-gray-100 rounded-full mb-4">
            <svg xmlns="http://www.w3.org/2000/svg" class="h-8 w-8 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
            </svg>
          </div>
          <p class="text-gray-600 mb-1">No products match your search</p>
          <p class="text-sm text-gray-400 mb-4">Try adjusting your search criteria</p>
          <button 
            @click="searchQuery = ''" 
            class="px-4 py-2 bg-gray-50 text-gray-600 rounded-lg hover:bg-gray-100 transition-colors inline-flex items-center"
          >
            <svg xmlns="http://www.w3.org/2000/svg" class="h-4 w-4 mr-1" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
            </svg>
            Clear Search
          </button>
        </div>
        
        <!-- Product Grid -->
        <div v-else class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          <!-- Product Cards -->
          <div
            v-for="product in filteredProducts"
            :key="product.id"
            class="bg-white rounded-xl shadow-sm hover:shadow-md transition-all duration-300 cursor-pointer overflow-hidden border border-gray-100"
            :class="{ 'ring-2 ring-blue-500 transform scale-[1.02]': isSelected(product) }"
            @click="incrementQuantity(product)"
          >
            <!-- Product Image -->
            <div class="relative">
              <div v-if="product.images && product.images.length > 0" class="h-48 overflow-hidden bg-gray-50">
                <img 
                  :src="`https://pocket.lasseharm.space/api/files/${product.collectionId}/${product.id}/${product.images[0]}?thumb=300x300`"
                  :alt="product.name"
                  class="w-full h-full object-cover transition-transform duration-500 hover:scale-110"
                />
              </div>
              <div v-else class="h-48 bg-gray-100 flex items-center justify-center">
                <svg xmlns="http://www.w3.org/2000/svg" class="h-16 w-16 text-gray-300" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                </svg>
              </div>
              
              <!-- Selection Badge -->
              <div 
                v-if="isSelected(product)" 
                class="absolute top-2 right-2 bg-blue-500 text-white rounded-full w-6 h-6 flex items-center justify-center shadow-md"
              >
                {{ product.quantity }}
              </div>
            </div>
            
            <!-- Product Info -->
            <div class="p-5">
              <h3 class="text-lg font-semibold text-gray-800 mb-2 line-clamp-1">{{ product.name }}</h3>
              <p class="text-sm text-gray-500 mb-4 line-clamp-2 h-10">{{ product.description }}</p>
              
              <div class="flex justify-between items-center">
                <p 
                  class="text-lg font-bold rounded-lg px-3 py-1 bg-blue-50 text-blue-700"
                >
                  {{ formatCurrency(product.price) }}
                </p>
                <div class="flex items-center space-x-1">
                  <template v-if="isSelected(product)">
                    <button 
                      @click.stop="decrementQuantity(product)" 
                      class="bg-gray-50 hover:bg-gray-100 text-gray-700 w-8 h-8 rounded-lg flex items-center justify-center transition-colors"
                    >
                      <svg xmlns="http://www.w3.org/2000/svg" class="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M18 12H6" />
                      </svg>
                    </button>
                    <button 
                      @click.stop="incrementQuantity(product)" 
                      class="bg-blue-50 hover:bg-blue-100 text-blue-700 w-8 h-8 rounded-lg flex items-center justify-center transition-colors"
                    >
                      <svg xmlns="http://www.w3.org/2000/svg" class="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 6v6m0 0v6m0-6h6m-6 0H6" />
                      </svg>
                    </button>
                  </template>
                  <button 
                    v-else
                    @click.stop="incrementQuantity(product)"
                    class="bg-blue-50 hover:bg-blue-100 text-blue-700 w-8 h-8 rounded-lg flex items-center justify-center transition-colors"
                  >
                    <svg xmlns="http://www.w3.org/2000/svg" class="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M3 3h2l.4 2M7 13h10l4-8H5.4M7 13L5.4 5M7 13l-2.293 2.293c-.63.63-.184 1.707.707 1.707H17m0 0a2 2 0 100 4 2 2 0 000-4zm-8 2a2 2 0 11-4 0 2 2 0 014 0z" />
                    </svg>
                  </button>
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