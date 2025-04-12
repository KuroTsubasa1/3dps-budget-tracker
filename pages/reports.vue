<template>
  <div class="px-4 py-6 sm:px-0">
    <!-- Reports Header -->
    <div class="mb-6">
      <div class="flex items-center mb-2">
        <div class="flex-shrink-0 w-10 h-10 bg-blue-50 rounded-full flex items-center justify-center mr-3">
          <svg xmlns="http://www.w3.org/2000/svg" class="h-5 w-5 text-blue-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
          </svg>
        </div>
        <div>
          <h1 class="text-xl font-bold text-gray-800">Financial Reports</h1>
          <p class="text-sm text-gray-500">Analyze your income and expense trends</p>
        </div>
      </div>
    </div>

    <!-- Date Range Selector -->
    <div class="card mb-6">
      <div class="card-header flex items-center justify-between">
        <div class="flex items-center">
          <div class="flex-shrink-0 w-8 h-8 bg-purple-50 rounded-full flex items-center justify-center mr-3">
            <svg xmlns="http://www.w3.org/2000/svg" class="h-4 w-4 text-purple-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
            </svg>
          </div>
          <div>
            <h2 class="text-lg font-semibold text-gray-800">Time Period</h2>
            <p class="text-xs text-gray-500">Select date range for report</p>
          </div>
        </div>
        <button 
          class="btn btn-primary flex items-center justify-center" 
          @click="refreshData"
        >
          <svg xmlns="http://www.w3.org/2000/svg" class="h-4 w-4 mr-1" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
          </svg>
          Refresh Data
        </button>
      </div>
      <div class="card-body">
        <div class="flex flex-wrap gap-4">
          <button
            v-for="(period, index) in timePeriods"
            :key="index"
            @click="selectedPeriod = period.value"
            :class="[
              'px-4 py-2 rounded-lg text-sm font-medium transition-all duration-200',
              selectedPeriod === period.value
                ? 'bg-blue-100 text-blue-700 border-2 border-blue-300'
                : 'bg-white border border-gray-200 text-gray-700 hover:bg-gray-50'
            ]"
          >
            {{ period.label }}
          </button>
          
          <div v-if="selectedPeriod === 'custom'" class="mt-4 w-full">
            <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label class="block text-sm font-medium text-gray-700 mb-1">Start Date</label>
                <input type="date" v-model="customDateRange.start" class="input w-full" />
              </div>
              <div>
                <label class="block text-sm font-medium text-gray-700 mb-1">End Date</label>
                <input type="date" v-model="customDateRange.end" class="input w-full" />
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
    
    <!-- Summary Cards Row -->
    <div class="grid grid-cols-1 md:grid-cols-3 gap-6 mb-6">
      <!-- Total Income Card -->
      <div class="card">
        <div class="p-6">
          <div class="flex items-center justify-between mb-4">
            <div class="flex-shrink-0 w-10 h-10 bg-green-50 rounded-full flex items-center justify-center">
              <svg xmlns="http://www.w3.org/2000/svg" class="h-5 w-5 text-green-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 6v6m0 0v6m0-6h6m-6 0H6" />
              </svg>
            </div>
            <span class="text-xs font-medium px-2 py-1 rounded-full bg-green-50 text-green-600">Income</span>
          </div>
          <h3 class="text-sm font-medium text-gray-500 mb-1">Total Income</h3>
          <p class="text-3xl font-bold text-gray-900">{{ formatCurrency(summaryData.income) }}</p>
          <div class="mt-2 flex items-center">
            <svg xmlns="http://www.w3.org/2000/svg" class="h-4 w-4 text-green-500 mr-1" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 7h8m0 0v8m0-8l-8 8-4-4-6 6" />
            </svg>
            <span class="text-xs font-medium text-green-600">+{{ summaryData.incomePercentChange }}% from previous period</span>
          </div>
        </div>
      </div>
      
      <!-- Total Expenses Card -->
      <div class="card">
        <div class="p-6">
          <div class="flex items-center justify-between mb-4">
            <div class="flex-shrink-0 w-10 h-10 bg-red-50 rounded-full flex items-center justify-center">
              <svg xmlns="http://www.w3.org/2000/svg" class="h-5 w-5 text-red-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M18 12H6" />
              </svg>
            </div>
            <span class="text-xs font-medium px-2 py-1 rounded-full bg-red-50 text-red-600">Expense</span>
          </div>
          <h3 class="text-sm font-medium text-gray-500 mb-1">Total Expenses</h3>
          <p class="text-3xl font-bold text-gray-900">{{ formatCurrency(Math.abs(summaryData.expenses)) }}</p>
          <div class="mt-2 flex items-center">
            <svg xmlns="http://www.w3.org/2000/svg" class="h-4 w-4 text-red-500 mr-1" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 17h8m0 0v-8m0 8l-8-8-4 4-6-6" />
            </svg>
            <span class="text-xs font-medium text-red-600">+{{ summaryData.expensesPercentChange }}% from previous period</span>
          </div>
        </div>
      </div>
      
      <!-- Net Balance Card -->
      <div class="card">
        <div class="p-6">
          <div class="flex items-center justify-between mb-4">
            <div class="flex-shrink-0 w-10 h-10 bg-blue-50 rounded-full flex items-center justify-center">
              <svg xmlns="http://www.w3.org/2000/svg" class="h-5 w-5 text-blue-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
            </div>
            <span class="text-xs font-medium px-2 py-1 rounded-full bg-blue-50 text-blue-600">Balance</span>
          </div>
          <h3 class="text-sm font-medium text-gray-500 mb-1">Net Balance</h3>
          <p class="text-3xl font-bold" :class="summaryData.netBalance >= 0 ? 'text-green-600' : 'text-red-600'">
            {{ formatCurrency(summaryData.netBalance) }}
          </p>
          <div class="mt-2 flex items-center">
            <svg v-if="summaryData.netBalancePercentChange >= 0" xmlns="http://www.w3.org/2000/svg" class="h-4 w-4 text-green-500 mr-1" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 7h8m0 0v8m0-8l-8 8-4-4-6 6" />
            </svg>
            <svg v-else xmlns="http://www.w3.org/2000/svg" class="h-4 w-4 text-red-500 mr-1" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 17h8m0 0v-8m0 8l-8-8-4 4-6-6" />
            </svg>
            <span class="text-xs font-medium" :class="summaryData.netBalancePercentChange >= 0 ? 'text-green-600' : 'text-red-600'">
              {{ summaryData.netBalancePercentChange >= 0 ? '+' : '' }}{{ summaryData.netBalancePercentChange }}% from previous period
            </span>
          </div>
        </div>
      </div>
    </div>
    
    <!-- Charts Row -->
    <div class="grid grid-cols-1 md:grid-cols-2 gap-6 mb-6">
      <!-- Income vs Expenses Bar Chart -->
      <div class="card">
        <div class="card-header flex items-center">
          <div class="flex-shrink-0 w-8 h-8 bg-indigo-50 rounded-full flex items-center justify-center mr-3">
            <svg xmlns="http://www.w3.org/2000/svg" class="h-4 w-4 text-indigo-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
            </svg>
          </div>
          <div>
            <h2 class="text-lg font-semibold text-gray-800">Income vs Expenses</h2>
            <p class="text-xs text-gray-500">Monthly comparison</p>
          </div>
        </div>
        <div class="card-body">
          <div class="h-64 flex items-center justify-center text-gray-500 text-sm">
            Chart would be displayed here 
            (Monthly income/expense comparison bar chart)
          </div>
        </div>
      </div>
      
      <!-- Balance Trend Line Chart -->
      <div class="card">
        <div class="card-header flex items-center">
          <div class="flex-shrink-0 w-8 h-8 bg-green-50 rounded-full flex items-center justify-center mr-3">
            <svg xmlns="http://www.w3.org/2000/svg" class="h-4 w-4 text-green-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 7h8m0 0v8m0-8l-8 8-4-4-6 6" />
            </svg>
          </div>
          <div>
            <h2 class="text-lg font-semibold text-gray-800">Balance Trend</h2>
            <p class="text-xs text-gray-500">Over time analysis</p>
          </div>
        </div>
        <div class="card-body">
          <div class="h-64 flex items-center justify-center text-gray-500 text-sm">
            Chart would be displayed here 
            (Balance trend line chart)
          </div>
        </div>
      </div>
    </div>
    
    <!-- Expense Breakdown -->
    <div class="grid grid-cols-1 md:grid-cols-3 gap-6 mb-6">
      <!-- Expense by Category Pie Chart -->
      <div class="card md:col-span-1">
        <div class="card-header flex items-center">
          <div class="flex-shrink-0 w-8 h-8 bg-red-50 rounded-full flex items-center justify-center mr-3">
            <svg xmlns="http://www.w3.org/2000/svg" class="h-4 w-4 text-red-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M11 3.055A9.001 9.001 0 1020.945 13H11V3.055z" />
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M20.488 9H15V3.512A9.025 9.025 0 0120.488 9z" />
            </svg>
          </div>
          <div>
            <h2 class="text-lg font-semibold text-gray-800">Expenses by Category</h2>
            <p class="text-xs text-gray-500">Where you spend money</p>
          </div>
        </div>
        <div class="card-body">
          <div class="h-64 flex items-center justify-center text-gray-500 text-sm">
            Chart would be displayed here 
            (Expense by category pie chart)
          </div>
        </div>
      </div>
      
      <!-- Top Expense Categories Table -->
      <div class="card md:col-span-2">
        <div class="card-header flex items-center">
          <div class="flex-shrink-0 w-8 h-8 bg-amber-50 rounded-full flex items-center justify-center mr-3">
            <svg xmlns="http://www.w3.org/2000/svg" class="h-4 w-4 text-amber-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
            </svg>
          </div>
          <div>
            <h2 class="text-lg font-semibold text-gray-800">Top Expense Categories</h2>
            <p class="text-xs text-gray-500">Your biggest spending areas</p>
          </div>
        </div>
        <div class="card-body overflow-x-auto">
          <table class="min-w-full divide-y divide-gray-200">
            <thead>
              <tr>
                <th class="px-4 py-3 bg-gray-50 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Category
                </th>
                <th class="px-4 py-3 bg-gray-50 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Amount
                </th>
                <th class="px-4 py-3 bg-gray-50 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  % of Total
                </th>
                <th class="px-4 py-3 bg-gray-50 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Change
                </th>
              </tr>
            </thead>
            <tbody class="bg-white divide-y divide-gray-200">
              <tr v-for="(category, index) in topExpenseCategories" :key="index">
                <td class="px-4 py-3">
                  <div class="flex items-center">
                    <div class="flex-shrink-0 w-8 h-8 rounded-full" :class="category.bgColor"></div>
                    <div class="ml-3">
                      <p class="text-sm font-medium text-gray-900">{{ category.name }}</p>
                    </div>
                  </div>
                </td>
                <td class="px-4 py-3">
                  <p class="text-sm text-gray-900">{{ formatCurrency(Math.abs(category.amount)) }}</p>
                </td>
                <td class="px-4 py-3">
                  <div class="flex items-center">
                    <div class="w-full bg-gray-200 rounded-full h-2.5">
                      <div class="h-2.5 rounded-full" :class="category.barColor" :style="{ width: category.percentage + '%' }"></div>
                    </div>
                    <span class="ml-2 text-sm text-gray-500">{{ category.percentage }}%</span>
                  </div>
                </td>
                <td class="px-4 py-3">
                  <div class="flex items-center" :class="category.change >= 0 ? 'text-red-600' : 'text-green-600'">
                    <svg v-if="category.change >= 0" xmlns="http://www.w3.org/2000/svg" class="h-4 w-4 mr-1" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 7h8m0 0v8m0-8l-8 8-4-4-6 6" />
                    </svg>
                    <svg v-else xmlns="http://www.w3.org/2000/svg" class="h-4 w-4 mr-1" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 17h8m0 0v-8m0 8l-8-8-4 4-6-6" />
                    </svg>
                    <span class="text-sm font-medium">{{ category.change >= 0 ? '+' : '' }}{{ category.change }}%</span>
                  </div>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    </div>
    
    <!-- Recent Transactions -->
    <div class="card">
      <div class="card-header flex items-center justify-between">
        <div class="flex items-center">
          <div class="flex-shrink-0 w-8 h-8 bg-purple-50 rounded-full flex items-center justify-center mr-3">
            <svg xmlns="http://www.w3.org/2000/svg" class="h-4 w-4 text-purple-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
            </svg>
          </div>
          <div>
            <h2 class="text-lg font-semibold text-gray-800">Recent Transactions</h2>
            <p class="text-xs text-gray-500">For the selected period</p>
          </div>
        </div>
        <button class="btn btn-primary flex items-center text-sm">
          <svg xmlns="http://www.w3.org/2000/svg" class="h-4 w-4 mr-1" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0l-4 4m4-4v12" />
          </svg>
          Export
        </button>
      </div>
      <div class="card-body overflow-x-auto">
        <table class="min-w-full divide-y divide-gray-200">
          <thead>
            <tr>
              <th class="px-4 py-3 bg-gray-50 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Date
              </th>
              <th class="px-4 py-3 bg-gray-50 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Description
              </th>
              <th class="px-4 py-3 bg-gray-50 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Category
              </th>
              <th class="px-4 py-3 bg-gray-50 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Amount
              </th>
            </tr>
          </thead>
          <tbody class="bg-white divide-y divide-gray-200">
            <tr v-for="(transaction, index) in recentTransactions" :key="index">
              <td class="px-4 py-3 whitespace-nowrap">
                <p class="text-sm text-gray-900">{{ formatDate(transaction.date) }}</p>
              </td>
              <td class="px-4 py-3">
                <p class="text-sm text-gray-900">{{ transaction.description }}</p>
              </td>
              <td class="px-4 py-3 whitespace-nowrap">
                <span 
                  class="px-2 py-1 text-xs font-medium rounded-full"
                  :class="[transaction.amount >= 0 ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800']"
                >
                  {{ transaction.amount >= 0 ? 'Income' : 'Expense' }}
                </span>
              </td>
              <td class="px-4 py-3 whitespace-nowrap">
                <p 
                  class="text-sm font-medium"
                  :class="[transaction.amount >= 0 ? 'text-green-600' : 'text-red-600']"
                >
                  {{ transaction.amount >= 0 ? '+' : '' }}{{ formatCurrency(transaction.amount) }}
                </p>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, computed } from 'vue'
import { formatCurrency } from '~/utils/currency'
import { useTransactions } from '~/composables/useTransactions'

const { transactions } = useTransactions()

// Time period options
const timePeriods = [
  { label: 'This Week', value: 'week' },
  { label: 'This Month', value: 'month' },
  { label: 'Last Month', value: 'lastMonth' },
  { label: 'This Quarter', value: 'quarter' },
  { label: 'This Year', value: 'year' },
  { label: 'Custom Range', value: 'custom' }
]

// Selected period and custom date range
const selectedPeriod = ref('month')
const customDateRange = ref({
  start: new Date().toISOString().substring(0, 10),
  end: new Date().toISOString().substring(0, 10)
})

// Summary data for the selected period
const summaryData = ref({
  income: 2650.75,
  incomePercentChange: 12.5,
  expenses: -1842.30,
  expensesPercentChange: 8.2,
  netBalance: 808.45,
  netBalancePercentChange: 24.7
})

// Top expense categories
const topExpenseCategories = ref([
  {
    name: 'Supplies',
    amount: -750.25,
    percentage: 40,
    change: 5.2,
    bgColor: 'bg-red-500',
    barColor: 'bg-red-500'
  },
  {
    name: 'Equipment',
    amount: -450.75,
    percentage: 24,
    change: 12.7,
    bgColor: 'bg-blue-500',
    barColor: 'bg-blue-500'
  },
  {
    name: 'Marketing',
    amount: -325.40,
    percentage: 18,
    change: -3.5,
    bgColor: 'bg-green-500',
    barColor: 'bg-green-500'
  },
  {
    name: 'Software',
    amount: -214.90,
    percentage: 12,
    change: 1.8,
    bgColor: 'bg-yellow-500',
    barColor: 'bg-yellow-500'
  },
  {
    name: 'Other',
    amount: -101.00,
    percentage: 6,
    change: -8.3,
    bgColor: 'bg-purple-500',
    barColor: 'bg-purple-500'
  }
])

// Sample recent transactions data
const recentTransactions = ref([
  {
    date: '2023-03-22',
    description: '3D Print Order - Custom Figurine',
    amount: 155.75
  },
  {
    date: '2023-03-21',
    description: 'PLA Filament Purchase',
    amount: -65.99
  },
  {
    date: '2023-03-19',
    description: '3D Model Sale - Architecture',
    amount: 220.00
  },
  {
    date: '2023-03-18',
    description: 'Printer Maintenance Parts',
    amount: -42.25
  },
  {
    date: '2023-03-17',
    description: 'Large Print Job - Engineering Parts',
    amount: 325.50
  },
  {
    date: '2023-03-15',
    description: 'Electricity Bill for Workshop',
    amount: -85.30
  },
  {
    date: '2023-03-12',
    description: 'New Nozzle Set',
    amount: -35.99
  },
  {
    date: '2023-03-10',
    description: 'Rapid Prototyping Service',
    amount: 189.75
  }
])

// Format date
const formatDate = (dateString) => {
  return new Date(dateString).toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric'
  })
}

// Refresh data based on selected period
const refreshData = () => {
  // This would normally fetch data for the selected period
  // For now, we'll just show a console message
  console.log(`Refreshing data for period: ${selectedPeriod.value}`)
  if (selectedPeriod.value === 'custom') {
    console.log(`Custom date range: ${customDateRange.value.start} to ${customDateRange.value.end}`)
  }
  
  // We would update summaryData and other metrics here
}
</script>

<style scoped>
/* Card styling */
.card {
  @apply bg-white/90 backdrop-blur-sm rounded-xl shadow-md border border-gray-100 overflow-hidden;
}

.card-header {
  @apply p-4 border-b border-gray-100;
}

.card-body {
  @apply p-4;
}

.input {
  @apply rounded-lg border-gray-300 shadow-sm focus:border-blue-300 focus:ring focus:ring-blue-200 focus:ring-opacity-50;
}

.btn {
  @apply px-4 py-2 rounded-lg font-medium text-sm transition-all duration-200 shadow-sm;
}

.btn-primary {
  @apply bg-gradient-to-r from-blue-600 to-blue-700 hover:from-blue-700 hover:to-blue-800 text-white;
}

.btn-secondary {
  @apply bg-white border border-gray-300 text-gray-700 hover:bg-gray-50;
}
</style>