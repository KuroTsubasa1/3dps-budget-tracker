<template>
  <div class="px-4 py-6 sm:px-0">
    <!-- Network Status -->
    <div class="mb-3 flex justify-between items-center">
      <div class="flex items-center">
        <span class="inline-block w-3 h-3 rounded-full mr-2" :class="syncStatus.isOnline ? 'bg-green-500' : 'bg-red-500'"></span>
        <span class="text-sm font-medium" :class="syncStatus.isOnline ? 'text-green-700' : 'text-red-700'">
          {{ syncStatus.isOnline ? 'Online' : 'Offline' }}
        </span>
      </div>
      <div v-if="pendingTransactions.length > 0" class="flex items-center">
        <span class="text-sm text-amber-700 mr-2">{{ pendingTransactions.length }} pending</span>
        <button 
          v-if="syncStatus.isOnline && pendingTransactions.length > 0" 
          @click="syncTransactionsQueue" 
          class="text-xs bg-blue-50 text-blue-600 rounded-full px-2 py-1 hover:bg-blue-100 transition-colors"
          :disabled="queueSyncStatus === 'syncing'"
        >
          <span v-if="queueSyncStatus === 'syncing'">Syncing...</span>
          <span v-else>Sync now</span>
        </button>
      </div>
    </div>
    
    <!-- Budget Summary Card -->
    <div class="card mb-6 balance-card">
      <div class="card-header">
        <h2 class="text-lg font-semibold text-gray-800">Balance Summary</h2>
      </div>
      <div class="card-body">
        <div class="grid grid-cols-1 md:grid-cols-2 gap-6">
          <!-- All-time Balance -->
          <div class="border-b md:border-b-0 md:border-r border-gray-100 pb-4 md:pb-0 md:pr-6">
            <h3 class="text-sm font-semibold text-gray-700 mb-3">All-time Balance</h3>
            <div class="space-y-4">
              <div>
                <p class="text-sm text-gray-500">Total Balance</p>
                <p class="text-2xl font-bold" :class="[earnings >= 0 ? 'text-green-600' : 'text-red-600']">{{ formatCurrency(earnings) }}</p>
              </div>
              <div>
                <p class="text-sm text-gray-500">Japan Balance (10%)</p>
                <p class="text-lg font-bold" :class="[earnings >= 0 ? 'text-green-600' : 'text-red-600']">{{ formatCurrency(earnings * 0.1) }}</p>
              </div>
            </div>
          </div>
          
          <!-- Today's Balance -->
          <div class="pt-4 md:pt-0 md:pl-6">
            <h3 class="text-sm font-semibold text-gray-700 mb-3">Today's Balance</h3>
            <div class="space-y-4">
              <div>
                <p class="text-sm text-gray-500">Today's Total</p>
                <p class="text-2xl font-bold" :class="[todayEarnings >= 0 ? 'text-green-600' : 'text-red-600']">{{ formatCurrency(todayEarnings) }}</p>
              </div>
              <div>
                <p class="text-sm text-gray-500">Today's Japan (10%)</p>
                <p class="text-lg font-bold" :class="[todayEarnings >= 0 ? 'text-green-600' : 'text-red-600']">{{ formatCurrency(todayEarnings * 0.1) }}</p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>

    <!-- Add Transaction Form -->
    <div class="card mb-6">
      <div class="card-header">
        <h2 class="text-lg font-semibold text-gray-800">Add Transaction</h2>
      </div>
      <div class="card-body">
        <div v-if="error" class="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg relative">
          <button @click="clearError" class="absolute top-1 right-1 text-red-400 hover:text-red-600 rounded-full p-1">
            <svg xmlns="http://www.w3.org/2000/svg" class="h-4 w-4" viewBox="0 0 20 20" fill="currentColor">
              <path fill-rule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clip-rule="evenodd" />
            </svg>
          </button>
          <p class="text-sm text-red-600 pr-6">{{ error }}</p>
        </div>
        <div v-if="apiError" class="mb-4 p-3 bg-yellow-50 border border-yellow-200 rounded-lg relative">
          <button @click="clearApiError" class="absolute top-1 right-1 text-yellow-400 hover:text-yellow-600 rounded-full p-1">
            <svg xmlns="http://www.w3.org/2000/svg" class="h-4 w-4" viewBox="0 0 20 20" fill="currentColor">
              <path fill-rule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clip-rule="evenodd" />
            </svg>
          </button>
          <p class="text-sm text-yellow-700 pr-6">{{ apiError }} - Transaction saved locally.</p>
        </div>
        <form class="space-y-6" @submit.prevent="handleAddTransaction">
          <div class="space-y-6">
            <div class="flex gap-4 mb-4">
              <label class="flex-1">
                <input type="radio" name="transactionType" value="income" v-model="transactionType" class="hidden">
                <div class="p-3 rounded-xl text-center cursor-pointer transition-all duration-200 ease-in-out" :class="[transactionType === 'income' ? 'bg-green-100 ring-2 ring-green-500' : 'bg-white/80 hover:bg-green-50']">
                  <span class="text-2xl font-bold" :class="[transactionType === 'income' ? 'text-green-600' : 'text-green-400']">+</span>
                  <p class="text-sm font-medium" :class="[transactionType === 'income' ? 'text-green-600' : 'text-green-400']">Income</p>
                </div>
              </label>
              <label class="flex-1">
                <input type="radio" name="transactionType" value="expense" v-model="transactionType" class="hidden">
                <div class="p-3 rounded-xl text-center cursor-pointer transition-all duration-200 ease-in-out" :class="[transactionType === 'expense' ? 'bg-red-100 ring-2 ring-red-500' : 'bg-white/80 hover:bg-red-50']">
                  <span class="text-2xl font-bold" :class="[transactionType === 'expense' ? 'text-red-600' : 'text-red-400']">−</span>
                  <p class="text-sm font-medium" :class="[transactionType === 'expense' ? 'text-red-600' : 'text-red-400']">Expense</p>
                </div>
              </label>
            </div>
            <div>
              <label class="block text-sm font-medium text-gray-700 mb-2">Description</label>
              <input type="text" :class="[`input w-full text-lg`, error && !transactionDescription ? 'border-red-300 focus:ring-red-500 focus:border-red-500' : '']" placeholder="Enter description" v-model="transactionDescription">
            </div>
            <div>
              <label class="block text-sm font-medium text-gray-700 mb-2">Notes (optional)</label>
              <textarea class="input w-full text-lg" placeholder="Additional notes" v-model="transactionNotes" rows="2"></textarea>
            </div>
            <div>
              <label class="block text-sm font-medium text-gray-700 mb-2">Amount</label>
              <div class="relative">
                <span class="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-500">€</span>
                <input type="number" class="input w-full text-lg pl-8" placeholder="0.00" step="0.01" min="0" v-model="transactionAmount">
              </div>
              <div class="mt-4">
                <button type="submit" class="w-full px-6 py-3 text-base font-medium text-white bg-gradient-to-r from-blue-600 to-blue-700 hover:from-blue-700 hover:to-blue-800 rounded-lg shadow-sm hover:shadow-lg transition-all duration-200 ease-in-out transform hover:-translate-y-0.5" :disabled="isLoading">
                  <span v-if="isLoading" class="inline-block align-middle mr-2">
                    <svg class="animate-spin h-5 w-5 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                      <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle>
                      <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                    </svg>
                  </span>
                  {{ isLoading ? 'Saving...' : 'Add Transaction' }}
                </button>
              </div>
              <!-- Numpad for touch input -->
              <div class="mt-4 grid grid-cols-3 gap-2">
                <button type="button" v-for="n in 9" :key="n" @click="appendNumber(n)" class="p-4 text-xl font-semibold bg-white/80 rounded-xl hover:bg-gray-50 active:bg-gray-100 transition-colors duration-150 shadow-sm">
                  {{ n }}
                </button>
                <button type="button" @click="appendDecimal" class="p-4 text-xl font-semibold bg-white/80 rounded-xl hover:bg-gray-50 active:bg-gray-100 transition-colors duration-150 shadow-sm">.</button>
                <button type="button" @click="appendNumber(0)" class="p-4 text-xl font-semibold bg-white/80 rounded-xl hover:bg-gray-50 active:bg-gray-100 transition-colors duration-150 shadow-sm">0</button>
                <button type="button" @click="backspace" class="p-4 text-xl font-semibold bg-white/80 rounded-xl hover:bg-gray-50 active:bg-gray-100 transition-colors duration-150 shadow-sm">⌫</button>
              </div>
            </div>
            <input type="date" class="hidden" v-model="transactionDate">
          </div>
        </form>
      </div>
    </div>

    <!-- Recent Transactions List -->
    <div class="card">
      <div class="card-header flex justify-between items-center">
        <h2 class="text-lg font-semibold text-gray-800">Recent Transactions</h2>
        <button class="btn btn-primary">View All</button>
      </div>
      <div class="card-body">
        <div class="space-y-4">
          <!-- Transaction Item -->
          <div v-for="transaction in sortedTransactions" :key="transaction.id" class="flex items-center justify-between p-4 hover:bg-gray-50 rounded-lg transition-colors duration-150">
            <div class="flex items-center space-x-4">
              <div class="flex-shrink-0">
                <div :class="[`w-10 h-10 rounded-full flex items-center justify-center`, transaction.amount < 0 ? 'bg-red-100' : 'bg-green-100']">
                  <span v-if="transaction.amount < 0" class="text-xl font-bold text-red-600">-</span>
                  <span v-else class="text-xl font-bold text-green-600">+</span>
                </div>
              </div>
              <div>
                <p class="text-sm font-medium text-gray-900">{{ transaction.description }}</p>
                <p class="text-sm text-gray-500">{{ formatDate(transaction.date) }}</p>
              </div>
            </div>
            <div class="text-right">
              <p :class="[`text-sm font-medium`, transaction.amount < 0 ? 'text-red-600' : 'text-green-600']">
                {{ transaction.amount < 0 ? '-' : '+' }}{{ formatCurrency(Math.abs(transaction.amount)) }}
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, watch } from 'vue'
import { formatCurrency } from '~/utils/currency'
import { useTransactions } from '~/composables/useTransactions'

// Local form error
const error = ref('')
// Error timer references
const errorTimers = ref({
  form: null,
  api: null
})

const { 
  transactions, 
  earnings, 
  todayEarnings,
  addTransaction: addTransactionToStore, 
  isLoading, 
  apiError,
  clearApiError: clearApiErrorFromStore,
  syncStatus,
  syncTransactionsQueue,
  queueSyncStatus,
  pendingTransactions
} = useTransactions()

// Clear local form error
const clearError = () => {
  error.value = ''
  if (errorTimers.value.form) {
    clearTimeout(errorTimers.value.form)
    errorTimers.value.form = null
  }
}

// Clear API error
const clearApiError = () => {
  clearApiErrorFromStore()
  if (errorTimers.value.api) {
    clearTimeout(errorTimers.value.api)
    errorTimers.value.api = null
  }
}

// Auto-dismiss errors after delay
watch(error, (newValue) => {
  if (newValue) {
    // Clear any existing timer
    if (errorTimers.value.form) {
      clearTimeout(errorTimers.value.form)
    }
    // Set new timer to clear the error after 5 seconds
    errorTimers.value.form = setTimeout(() => {
      clearError()
    }, 5000)
  }
})

// Auto-dismiss API errors after delay
watch(() => apiError.value, (newValue) => {
  if (newValue) {
    // Clear any existing timer
    if (errorTimers.value.api) {
      clearTimeout(errorTimers.value.api)
    }
    // Set new timer to clear the API error after 5 seconds
    errorTimers.value.api = setTimeout(() => {
      clearApiError()
    }, 5000)
  }
})

const transactionType = ref('income')
const transactionDescription = ref('')
const transactionAmount = ref('')
const transactionNotes = ref('')
const transactionDate = ref(new Date().toISOString().split('T')[0])

// Sort transactions in reverse order (newest first)
const sortedTransactions = computed(() => {
  return [...transactions.value].sort((a, b) => {
    return b.id - a.id // Sort by id (timestamp) descending
  })
})

const handleAddTransaction = async (e) => {
  e.preventDefault()
  error.value = ''

  if (!transactionDescription.value?.trim()) {
    error.value = 'Please enter a description for the transaction'
    return
  }

  if (!transactionAmount.value || Number(transactionAmount.value) <= 0) {
    error.value = 'Please enter a valid amount'
    return
  }

  const amount = parseFloat(transactionAmount.value)
  const finalAmount = transactionType.value === 'expense' ? -amount : amount

  try {
    await addTransactionToStore({
      id: Date.now(),
      description: transactionDescription.value.trim(),
      amount: finalAmount,
      date: transactionDate.value,
      notes: transactionNotes.value
    })

    // Reset form
    transactionDescription.value = ''
    transactionAmount.value = ''
    transactionNotes.value = ''
    error.value = ''
  } catch (err) {
    // Error is handled in the composable
    // and displayed via apiError
  }
}

const appendNumber = (num) => {
  transactionAmount.value = (transactionAmount.value + num.toString()).replace(/^0+/, '')
}

const appendDecimal = () => {
  if (!transactionAmount.value.includes('.')) {
    transactionAmount.value = transactionAmount.value + '.'
  }
}

const backspace = () => {
  transactionAmount.value = transactionAmount.value.slice(0, -1)
}

const formatDate = (date) => {
  return new Date(date).toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric'
  })
}
</script>