<template>
  <div class="px-4 py-6 sm:px-0">
    <div class="card mb-6">
      <div class="card-header flex justify-between items-center">
        <h2 class="text-lg font-semibold text-gray-800">Budget Planning</h2>
        <button @click="addCategory" class="btn btn-primary">Add Category</button>
      </div>
      <div class="card-body">
        <div class="space-y-6">
          <div v-for="category in categories" :key="category.id" class="p-4 bg-gray-50 rounded-lg">
            <div class="flex items-center justify-between mb-4">
              <div class="flex-1">
                <input
                  v-model="category.name"
                  type="text"
                  class="input w-full text-lg"
                  placeholder="Category Name"
                />
              </div>
              <div class="ml-4 flex items-center space-x-4">
                <div class="relative">
                  <span class="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-500">€</span>
                  <input
                    v-model="category.limit"
                    type="number"
                    class="input pl-8"
                    placeholder="0.00"
                    step="0.01"
                    min="0"
                  />
                </div>
                <button @click="removeCategory(category.id)" class="text-red-500 hover:text-red-600">
                  <span class="sr-only">Remove</span>
                  ×
                </button>
              </div>
            </div>
            <div class="relative pt-1">
              <div class="flex mb-2 items-center justify-between">
                <div>
                  <span class="text-xs font-semibold inline-block py-1 px-2 uppercase rounded-full" 
                        :class="getProgressColor(category)">
                    {{ getProgressPercentage(category) }}%
                  </span>
                </div>
                <div class="text-right">
                  <span class="text-xs font-semibold inline-block">
                    {{ formatCurrency(getCategorySpent(category)) }} / {{ formatCurrency(category.limit) }}
                  </span>
                </div>
              </div>
              <div class="overflow-hidden h-2 mb-4 text-xs flex rounded bg-gray-200">
                <div
                  :style="{ width: `${getProgressPercentage(category)}%` }"
                  class="shadow-none flex flex-col text-center whitespace-nowrap text-white justify-center transition-all duration-500"
                  :class="getProgressColor(category)"
                ></div>
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

const { transactions } = useTransactions()

const categories = ref([
  { id: 1, name: 'Filaments', limit: 100 },
  { id: 2, name: 'Parts', limit: 200 },
  { id: 3, name: 'Tools', limit: 150 }
])

const nextId = computed(() => {
  return Math.max(...categories.value.map(c => c.id)) + 1
})

const addCategory = () => {
  categories.value.push({
    id: nextId.value,
    name: '',
    limit: 0
  })
}

const removeCategory = (id) => {
  const index = categories.value.findIndex(c => c.id === id)
  if (index !== -1) {
    categories.value.splice(index, 1)
  }
}

const getCategorySpent = (category) => {
  return transactions.value.reduce((sum, transaction) => {
    if (transaction.description.toLowerCase().includes(category.name.toLowerCase())) {
      return sum + transaction.amount
    }
    return sum
  }, 0)
}

const getProgressPercentage = (category) => {
  if (category.limit === 0) return 0
  const spent = getCategorySpent(category)
  return Math.min(Math.round((spent / category.limit) * 100), 100)
}

const getProgressColor = (category) => {
  const percentage = getProgressPercentage(category)
  if (percentage >= 90) return 'bg-red-500 text-red-100'
  if (percentage >= 75) return 'bg-yellow-500 text-yellow-100'
  return 'bg-green-500 text-green-100'
}
</script>