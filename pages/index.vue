<template>
  <div class="px-4 py-6 sm:px-0">
    <!-- Network Status Banner -->
    <div class="mb-4 flex justify-between items-center bg-white/90 backdrop-blur-sm rounded-xl shadow-md p-3 border border-gray-100">
      <div class="flex items-center">
        <div class="bg-gray-100 p-2 rounded-full mr-3">
          <span class="inline-block w-3 h-3 rounded-full" :class="syncStatus.isOnline ? 'bg-green-500' : 'bg-red-500'"></span>
        </div>
        <div>
          <span class="text-sm font-medium" :class="syncStatus.isOnline ? 'text-green-700' : 'text-red-700'">
            {{ syncStatus.isOnline ? 'Online' : 'Offline' }}
          </span>
          <span class="text-xs text-gray-500 block leading-tight">{{ syncStatus.isOnline ? 'Connected to server' : 'Working in offline mode' }}</span>
        </div>
      </div>
      <div v-if="pendingTransactions.length > 0" class="flex items-center">
        <div class="bg-amber-50 rounded-lg px-3 py-1 mr-2 border border-amber-100">
          <span class="text-xs text-amber-700">{{ pendingTransactions.length }} pending</span>
        </div>
        <button 
          v-if="syncStatus.isOnline && pendingTransactions.length > 0" 
          @click="syncTransactionsQueue" 
          class="text-xs bg-blue-50 text-blue-600 rounded-lg px-3 py-1.5 hover:bg-blue-100 transition-colors border border-blue-100 flex items-center"
          :disabled="queueSyncStatus === 'syncing'"
        >
          <svg v-if="queueSyncStatus === 'syncing'" class="animate-spin -ml-1 mr-2 h-4 w-4 text-blue-500" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
            <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle>
            <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
          </svg>
          <svg v-else xmlns="http://www.w3.org/2000/svg" class="h-3.5 w-3.5 mr-1" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
          </svg>
          <span>{{ queueSyncStatus === 'syncing' ? 'Syncing...' : 'Sync now' }}</span>
        </button>
      </div>
    </div>
    
    <!-- Budget Summary Card -->
    <div class="card mb-6 balance-card">
      <div class="card-header flex items-center">
        <div class="flex-shrink-0 w-10 h-10 bg-blue-50 rounded-full flex items-center justify-center mr-3">
          <svg xmlns="http://www.w3.org/2000/svg" class="h-5 w-5 text-blue-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
        </div>
        <div>
          <h2 class="text-lg font-semibold text-gray-800">Balance Summary</h2>
          <p class="text-xs text-gray-500">Track your overall and daily finances</p>
        </div>
      </div>
      <div class="card-body">
        <div class="grid grid-cols-1 md:grid-cols-2 gap-6">
          <!-- All-time Balance -->
          <div class="rounded-xl bg-gradient-to-br from-blue-50 to-blue-100/50 p-4 shadow-sm border border-blue-100">
            <div class="flex items-center justify-between mb-4">
              <h3 class="text-sm font-semibold text-blue-800">All-time Balance</h3>
              <div class="bg-blue-100 rounded-full p-1.5">
                <svg xmlns="http://www.w3.org/2000/svg" class="h-4 w-4 text-blue-700" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                </svg>
              </div>
            </div>
            <div class="space-y-6">
              <div>
                <div class="flex justify-between items-baseline mb-1">
                  <p class="text-sm text-blue-700">Total Balance</p>
                  <p class="text-xs text-blue-500">All time</p>
                </div>
                <p class="text-3xl font-bold" :class="[earnings >= 0 ? 'text-green-600' : 'text-red-600']">{{ formatCurrency(earnings) }}</p>
              </div>
              <div>
                <p class="text-sm text-blue-700 mb-1">Japan Balance (10%)</p>
                <p class="text-xl font-bold" :class="[earnings >= 0 ? 'text-green-600' : 'text-red-600']">{{ formatCurrency(earnings * 0.1) }}</p>
              </div>
            </div>
          </div>
          
          <!-- Today's Balance -->
          <div class="rounded-xl bg-gradient-to-br from-amber-50 to-amber-100/50 p-4 shadow-sm border border-amber-100">
            <div class="flex items-center justify-between mb-4">
              <h3 class="text-sm font-semibold text-amber-800">Today's Balance</h3>
              <div class="bg-amber-100 rounded-full p-1.5">
                <svg xmlns="http://www.w3.org/2000/svg" class="h-4 w-4 text-amber-700" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
              </div>
            </div>
            <div class="space-y-6">
              <div>
                <div class="flex justify-between items-baseline mb-1">
                  <p class="text-sm text-amber-700">Today's Total</p>
                  <p class="text-xs text-amber-500">{{ new Date().toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) }}</p>
                </div>
                <p class="text-3xl font-bold" :class="[todayEarnings >= 0 ? 'text-green-600' : 'text-red-600']">{{ formatCurrency(todayEarnings) }}</p>
              </div>
              <div>
                <p class="text-sm text-amber-700 mb-1">Today's Japan (10%)</p>
                <p class="text-xl font-bold" :class="[todayEarnings >= 0 ? 'text-green-600' : 'text-red-600']">{{ formatCurrency(todayEarnings * 0.1) }}</p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>

    <!-- Add Transaction Form -->
    <div class="card mb-6">
      <div class="card-header flex items-center">
        <div class="flex-shrink-0 w-10 h-10 bg-green-50 rounded-full flex items-center justify-center mr-3">
          <svg xmlns="http://www.w3.org/2000/svg" class="h-5 w-5 text-green-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 6v6m0 0v6m0-6h6m-6 0H6" />
          </svg>
        </div>
        <div>
          <h2 class="text-lg font-semibold text-gray-800">Add Transaction</h2>
          <p class="text-xs text-gray-500">Record your income and expenses</p>
        </div>
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
            <div class="flex gap-4 mb-6">
              <label class="flex-1">
                <input type="radio" name="transactionType" value="income" v-model="transactionType" class="hidden">
                <div class="p-3 rounded-xl text-center cursor-pointer transition-all duration-300 ease-in-out shadow-sm hover:shadow-md border" 
                    :class="[transactionType === 'income' 
                      ? 'bg-gradient-to-br from-green-50 to-green-100 border-green-200 ring-2 ring-green-500 transform -translate-y-1' 
                      : 'bg-white/90 border-gray-100 hover:bg-green-50/50']">
                  <div class="inline-flex items-center justify-center w-10 h-10 rounded-full bg-green-100 mb-1">
                    <svg xmlns="http://www.w3.org/2000/svg" class="h-5 w-5 text-green-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 6v6m0 0v6m0-6h6m-6 0H6" />
                    </svg>
                  </div>
                  <p class="text-sm font-medium" :class="[transactionType === 'income' ? 'text-green-700' : 'text-green-500']">Income</p>
                  <p class="text-xs text-gray-400">Add funds</p>
                </div>
              </label>
              <label class="flex-1">
                <input type="radio" name="transactionType" value="expense" v-model="transactionType" class="hidden">
                <div class="p-3 rounded-xl text-center cursor-pointer transition-all duration-300 ease-in-out shadow-sm hover:shadow-md border" 
                    :class="[transactionType === 'expense' 
                      ? 'bg-gradient-to-br from-red-50 to-red-100 border-red-200 ring-2 ring-red-500 transform -translate-y-1' 
                      : 'bg-white/90 border-gray-100 hover:bg-red-50/50']">
                  <div class="inline-flex items-center justify-center w-10 h-10 rounded-full bg-red-100 mb-1">
                    <svg xmlns="http://www.w3.org/2000/svg" class="h-5 w-5 text-red-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M18 12H6" />
                    </svg>
                  </div>
                  <p class="text-sm font-medium" :class="[transactionType === 'expense' ? 'text-red-700' : 'text-red-500']">Expense</p>
                  <p class="text-xs text-gray-400">Record spending</p>
                </div>
              </label>
            </div>
            <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label class="block text-sm font-medium text-gray-700 mb-2 flex items-center">
                  <svg xmlns="http://www.w3.org/2000/svg" class="h-4 w-4 mr-1 text-gray-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z" />
                  </svg>
                  Description
                </label>
                <div class="relative">
                  <input 
                    type="text" 
                    :class="[`input w-full text-base pl-10`, error && !transactionDescription ? 'border-red-300 focus:ring-red-500 focus:border-red-500' : '']" 
                    placeholder="What is this transaction for?" 
                    v-model="transactionDescription">
                  <div class="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400">
                    <svg xmlns="http://www.w3.org/2000/svg" class="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                    </svg>
                  </div>
                </div>
              </div>
              
              <div>
                <label class="block text-sm font-medium text-gray-700 mb-2 flex items-center">
                  <svg xmlns="http://www.w3.org/2000/svg" class="h-4 w-4 mr-1 text-gray-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                  Amount
                </label>
                <div class="relative">
                  <span class="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-500 flex items-center justify-center w-6 h-6 rounded-full bg-gray-100">€</span>
                  <input 
                    type="number" 
                    class="input w-full text-base pl-12" 
                    placeholder="0.00" 
                    step="0.01" 
                    min="0" 
                    v-model="transactionAmount"
                    :class="[transactionType === 'income' ? 'focus:ring-green-500' : 'focus:ring-red-500']">
                </div>
              </div>
            </div>
            
            <div>
              <label class="block text-sm font-medium text-gray-700 mb-2 flex items-center">
                <svg xmlns="http://www.w3.org/2000/svg" class="h-4 w-4 mr-1 text-gray-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M7 8h10M7 12h4m1 8l-4-4H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-3l-4 4z" />
                </svg>
                Notes (optional)
              </label>
              <textarea 
                class="input w-full text-base" 
                placeholder="Additional details about this transaction..." 
                v-model="transactionNotes" 
                rows="2"></textarea>
            </div>
            
            <div>
              <div class="mt-6">
                <button 
                  type="submit" 
                  class="w-full px-6 py-4 text-base font-medium text-white bg-gradient-to-r from-blue-600 to-blue-700 hover:from-blue-700 hover:to-blue-800 rounded-xl shadow-md hover:shadow-lg transition-all duration-300 ease-in-out transform hover:-translate-y-0.5 flex items-center justify-center"
                  :disabled="isLoading">
                  <span v-if="isLoading" class="inline-block mr-2">
                    <svg class="animate-spin h-5 w-5 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                      <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle>
                      <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                    </svg>
                  </span>
                  {{ isLoading ? 'Saving...' : 'Add to Balance' }}
                </button>
              </div>
              <!-- Numpad for touch input -->
              <div class="mt-6 border border-gray-100 rounded-2xl bg-white/70 p-4 shadow-inner">
                <p class="text-xs text-gray-500 mb-3 flex items-center">
                  <svg xmlns="http://www.w3.org/2000/svg" class="h-3 w-3 mr-1" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 11c0 3.517-1.009 6.799-2.753 9.571m-3.44-2.04l.054-.09A13.916 13.916 0 008 11a4 4 0 118 0c0 1.017-.07 2.019-.203 3m-2.118 6.844A21.88 21.88 0 0015.171 17m3.839 1.132c.645-2.266.99-4.659.99-7.132A8 8 0 008 4.07M3 15.364c.64-1.319 1-2.8 1-4.364 0-1.457.39-2.823 1.07-4" />
                  </svg>
                  Keypad
                </p>
                <div class="grid grid-cols-3 gap-3">
                  <button 
                    type="button" 
                    v-for="n in 9" 
                    :key="n" 
                    @click="appendNumber(n)" 
                    class="p-3 text-xl font-semibold bg-white rounded-xl hover:bg-gray-50 active:bg-gray-100 transition-all duration-150 shadow-sm hover:shadow border border-gray-100 flex items-center justify-center">
                    {{ n }}
                  </button>
                  <button 
                    type="button" 
                    @click="appendDecimal" 
                    class="p-3 text-xl font-semibold bg-white rounded-xl hover:bg-gray-50 active:bg-gray-100 transition-all duration-150 shadow-sm hover:shadow border border-gray-100 flex items-center justify-center">
                    .
                  </button>
                  <button 
                    type="button" 
                    @click="appendNumber(0)" 
                    class="p-3 text-xl font-semibold bg-white rounded-xl hover:bg-gray-50 active:bg-gray-100 transition-all duration-150 shadow-sm hover:shadow border border-gray-100 flex items-center justify-center">
                    0
                  </button>
                  <button 
                    type="button" 
                    @click="backspace" 
                    class="p-3 bg-gray-100 rounded-xl hover:bg-gray-200 active:bg-gray-300 transition-all duration-150 shadow-sm hover:shadow border border-gray-200 flex items-center justify-center">
                    <svg xmlns="http://www.w3.org/2000/svg" class="h-5 w-5 text-gray-700" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 14l2-2m0 0l2-2m-2 2l-2-2m2 2l2 2M3 12l6.414 6.414a2 2 0 001.414.586H19a2 2 0 002-2V7a2 2 0 00-2-2h-8.172a2 2 0 00-1.414.586L3 12z" />
                    </svg>
                  </button>
                </div>
              </div>
            </div>
            <input type="date" class="hidden" v-model="transactionDate">
          </div>
        </form>
      </div>
    </div>

    <!-- Recent Transactions List -->
    <div class="card">
      <div class="card-header flex items-center">
        <div class="flex-shrink-0 w-10 h-10 bg-purple-50 rounded-full flex items-center justify-center mr-3">
          <svg xmlns="http://www.w3.org/2000/svg" class="h-5 w-5 text-purple-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
          </svg>
        </div>
        <div class="flex-grow">
          <h2 class="text-lg font-semibold text-gray-800">Recent Transactions</h2>
          <p class="text-xs text-gray-500">Your most recent financial activity</p>
        </div>
        <button class="btn btn-primary flex items-center">
          <span>View All</span>
          <svg xmlns="http://www.w3.org/2000/svg" class="h-4 w-4 ml-1" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5l7 7-7 7" />
          </svg>
        </button>
      </div>
      <div class="card-body">
        <div v-if="sortedTransactions.length === 0" class="py-12 text-center">
          <div class="inline-flex items-center justify-center w-20 h-20 bg-gray-100 rounded-full mb-4">
            <svg xmlns="http://www.w3.org/2000/svg" class="h-10 w-10 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" />
            </svg>
          </div>
          <p class="text-gray-500 mb-1">No transactions yet</p>
          <p class="text-sm text-gray-400">Add your first transaction using the form above</p>
        </div>
        
        <div v-else class="space-y-4">
          <!-- Transaction Item -->
          <div 
            v-for="transaction in sortedTransactions" 
            :key="transaction.id" 
            class="flex items-center justify-between p-4 rounded-xl transition-all duration-200 hover:shadow-md border border-transparent hover:border-gray-100"
            :class="[transaction.amount < 0 ? 'hover:bg-red-50/30' : 'hover:bg-green-50/30']"
          >
            <div class="flex items-center space-x-4">
              <div class="flex-shrink-0">
                <div 
                  :class="[
                    `w-12 h-12 rounded-xl flex items-center justify-center shadow-sm`, 
                    transaction.amount < 0 
                      ? 'bg-gradient-to-br from-red-50 to-red-100 border border-red-200' 
                      : 'bg-gradient-to-br from-green-50 to-green-100 border border-green-200'
                  ]"
                >
                  <svg v-if="transaction.amount < 0" xmlns="http://www.w3.org/2000/svg" class="h-6 w-6 text-red-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M18 12H6" />
                  </svg>
                  <svg v-else xmlns="http://www.w3.org/2000/svg" class="h-6 w-6 text-green-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 6v6m0 0v6m0-6h6m-6 0H6" />
                  </svg>
                </div>
              </div>
              <div>
                <p class="text-sm font-medium text-gray-900 mb-0.5">{{ transaction.description }}</p>
                <div class="flex items-center">
                  <svg xmlns="http://www.w3.org/2000/svg" class="h-3 w-3 text-gray-400 mr-1" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                  </svg>
                  <p class="text-xs text-gray-500">{{ formatDate(transaction.date) }}</p>
                </div>
                <p v-if="transaction.notes" class="text-xs text-gray-400 mt-1 line-clamp-1">{{ transaction.notes }}</p>
              </div>
            </div>
            <div class="text-right">
              <p 
                :class="[
                  `text-base font-bold rounded-lg px-3 py-1.5`, 
                  transaction.amount < 0 
                    ? 'text-red-700 bg-red-50' 
                    : 'text-green-700 bg-green-50'
                ]"
              >
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