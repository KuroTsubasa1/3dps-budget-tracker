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
        <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          <!-- Product Cards -->
          <div
            v-for="product in products"
            :key="product.id"
            class="card hover:scale-[1.02] transition-transform duration-300 cursor-pointer"
            :class="{ 'ring-2 ring-blue-500': isSelected(product) }"
            @click="incrementQuantity(product)"
          >
            <div class="card-body">
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
import { ref, computed } from 'vue'
import { formatCurrency } from '~/utils/currency'
import { useTransactions } from '~/composables/useTransactions'

// Sample products data
const products = ref([
  { id: 1, name: 'Classic Pokéball', description: '3D printed classic red and white Pokéball, perfect display size', price: 24.99 },
  { id: 2, name: 'Great Ball Set', description: 'Set of 3 blue Great Balls with enhanced detail', price: 59.99 },
  { id: 3, name: 'Master Ball Premium', description: 'Highly detailed purple Master Ball with metallic finish', price: 49.99 },
  { id: 4, name: 'Mini Pokéball Collection', description: 'Set of 6 miniature Pokéballs', price: 39.99 },
  { id: 5, name: 'Ultra Ball Deluxe', description: 'Large Ultra Ball with opening mechanism', price: 44.99 },
  { id: 6, name: 'Safari Ball Bundle', description: 'Set of 2 Safari Balls with display stand', price: 34.99 },
  { id: 7, name: 'Love Ball Special', description: 'Pink Love Ball with heart details, perfect gift', price: 29.99 },
  { id: 8, name: 'Luxury Ball Elite', description: 'Premium black and gold Luxury Ball', price: 54.99 },
  { id: 9, name: 'Quick Ball Starter', description: 'Blue and yellow Quick Ball, beginner-friendly', price: 19.99 }
].map(product => ({ ...product, quantity: 0 })))

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
  
  addTransaction({
    description: `Catalog Purchase - ${selectedProducts.value.length} items`,
    amount: totalAmount.value,
    date: new Date().toISOString().split('T')[0]
  })

  // Reset all product quantities to 0
  products.value.forEach(product => product.quantity = 0)
}
</script>