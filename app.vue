<template>
  <div class="min-h-screen bg-gradient-to-br from-gray-50 to-gray-100">
    <!-- Navigation Bar -->
    <nav class="bg-white/90 backdrop-blur-sm shadow-lg sticky top-0 z-50 transition-all duration-300">
      <div class="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div class="flex justify-between h-16">
          <div class="flex items-center">
            <div class="flex-shrink-0 flex items-center">
              <h1 class="text-2xl font-bold bg-gradient-to-r from-blue-600 to-blue-800 bg-clip-text text-transparent">Budget Tracker</h1>
            </div>
            <div class="hidden sm:ml-8 sm:flex sm:space-x-8">
              <a href="#" class="nav-link border-blue-500 text-gray-900 inline-flex items-center px-1 pt-1 border-b-2 text-sm font-medium">
                Dashboard
              </a>
            </div>
          </div>
          <div class="flex items-center">
            <div class="nav-balance transition-all duration-300" :class="{ 'opacity-100': isBalanceHidden, 'opacity-0': !isBalanceHidden }">
              <p class="text-sm font-medium" :class="[earnings >= 0 ? 'text-green-600' : 'text-red-600']">{{ formatCurrency(earnings) }}</p>
            </div>
          </div>
        </div>
      </div>
    </nav>

    <!-- Main Content -->
    <main class="max-w-7xl mx-auto py-6 sm:px-6 lg:px-8">
      <div class="px-4 py-6 sm:px-0">
        <!-- Budget Summary Card -->
        <div class="card mb-6 balance-card">
          <div class="card-header">
            <h2 class="text-lg font-semibold text-gray-800">Current Balance</h2>
          </div>
          <div class="card-body">
            <div class="text-center space-y-4">
              <div>
                <p class="text-sm text-gray-500">Available Balance</p>
                <p class="text-2xl font-bold" :class="[earnings >= 0 ? 'text-green-600' : 'text-red-600']">{{ formatCurrency(earnings) }}</p>
              </div>
              <div>
                <p class="text-sm text-gray-500">Japan Balance (10%)</p>
                <p class="text-2xl font-bold" :class="[earnings >= 0 ? 'text-green-600' : 'text-red-600']">{{ formatCurrency(earnings * 0.1) }}</p>
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
            <form class="space-y-6" @submit="addTransaction">
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
                  <input type="text" class="input w-full text-lg" placeholder="Enter description" v-model="transactionDescription">
                </div>
                <div>
                  <label class="block text-sm font-medium text-gray-700 mb-2">Amount</label>
                  <div class="relative">
                    <span class="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-500">€</span>
                    <input type="number" class="input w-full text-lg pl-8" placeholder="0.00" step="0.01" min="0" v-model="transactionAmount">
                  </div>
                  <div class="mt-4">
                    <button type="submit" class="w-full px-6 py-3 text-base font-medium text-white bg-gradient-to-r from-blue-600 to-blue-700 hover:from-blue-700 hover:to-blue-800 rounded-lg shadow-sm hover:shadow-lg transition-all duration-200 ease-in-out transform hover:-translate-y-0.5">Add Transaction</button>
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
              <div v-for="transaction in transactions" :key="transaction.id" class="flex items-center justify-between p-4 hover:bg-gray-50 rounded-lg transition-colors duration-150">
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
    </main>
  </div>
</template>

<script setup>
import { ref, computed, onMounted } from 'vue'

const transactions = ref([])
const transactionAmount = ref('')
const transactionDescription = ref('')
const transactionCategory = ref('Food & Dining')
const transactionDate = ref(new Date().toISOString().split('T')[0])
const transactionType = ref('income')

const totalBudget = computed(() => {
  return transactions.value.reduce((sum, transaction) => {
    return sum + (transaction.amount > 0 ? transaction.amount : 0)
  }, 0)
})

const spent = computed(() => {
  return transactions.value.reduce((sum, transaction) => {
    return sum + (transaction.amount < 0 ? Math.abs(transaction.amount) : 0)
  }, 0)
})

const earnings = computed(() => {
  return totalBudget.value - spent.value
})

function addTransaction(e) {
  e.preventDefault()
  const amount = parseFloat(transactionAmount.value)
  if (isNaN(amount) || amount <= 0) return

  const transaction = {
    id: Date.now().toString(),
    amount: transactionType.value === 'expense' ? -amount : amount,
    description: transactionDescription.value.trim(),
    category: transactionCategory.value,
    date: transactionDate.value,
    created: new Date()
  }

  transactions.value.unshift(transaction)
  transactionAmount.value = ''
  transactionDescription.value = ''
  transactionDate.value = new Date().toISOString().split('T')[0]

  // Save to localStorage
  saveTransactions()
}

function formatDate(date) {
  return new Date(date).toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric'
  })
}

function formatCurrency(amount) {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'EUR',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
    useGrouping: false
  }).format(Math.abs(amount))
}

// Local Storage Functions
function saveTransactions() {
  if (process.client) {
    localStorage.setItem('budget-tracker-transactions', JSON.stringify(transactions.value))
  }
}

function loadTransactions() {
  if (process.client) {
    const saved = localStorage.getItem('budget-tracker-transactions')
    if (saved) {
      transactions.value = JSON.parse(saved)
    }
  }
}

// Only load transactions on client-side
if (process.client) {
  loadTransactions()
}

// Scroll animation logic
const isBalanceHidden = ref(false)

onMounted(() => {
  const observer = new IntersectionObserver(
    ([entry]) => {
      isBalanceHidden.value = !entry.isIntersecting
    },
    {
      threshold: 0,
      rootMargin: '-64px 0px 0px 0px' // Adjust based on nav height
    }
  )

  const balanceCard = document.querySelector('.balance-card')
  if (balanceCard) {
    observer.observe(balanceCard)
  }
})
// Add these functions after the existing script setup code
function appendNumber(num) {
  if (!transactionAmount.value) transactionAmount.value = ''
  transactionAmount.value = (transactionAmount.value + num).replace(/^0+(?=\d)/, '')
}

function appendDecimal() {
  if (!transactionAmount.value.includes('.')) {
    transactionAmount.value = (transactionAmount.value || '0') + '.'
  }
}

function backspace() {
  transactionAmount.value = transactionAmount.value.slice(0, -1)
}
</script>
