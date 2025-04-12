<template>
  <div class="px-4 py-6 sm:px-0">
    <!-- Settings Header -->
    <div class="mb-6">
      <div class="flex items-center mb-2">
        <div class="flex-shrink-0 w-10 h-10 bg-purple-50 rounded-full flex items-center justify-center mr-3">
          <svg xmlns="http://www.w3.org/2000/svg" class="h-5 w-5 text-purple-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
          </svg>
        </div>
        <div>
          <h1 class="text-xl font-bold text-gray-800">Settings</h1>
          <p class="text-sm text-gray-500">Configure your application preferences</p>
        </div>
      </div>
    </div>

    <div class="grid grid-cols-1 md:grid-cols-3 gap-6">
      <!-- Left Column: Settings Categories -->
      <div class="md:col-span-1">
        <div class="card">
          <div class="card-body p-0">
            <ul class="divide-y divide-gray-200">
              <li 
                v-for="(category, index) in settingsCategories" 
                :key="index"
                @click="activeCategory = category.id"
                class="cursor-pointer transition-colors"
                :class="activeCategory === category.id ? 'bg-purple-50' : 'hover:bg-gray-50'"
              >
                <div class="flex items-center px-4 py-3">
                  <div :class="`flex-shrink-0 w-8 h-8 rounded-full flex items-center justify-center mr-3 ${activeCategory === category.id ? category.activeBackground : category.background}`">
                    <component :is="category.icon" :class="`h-4 w-4 ${activeCategory === category.id ? category.activeColor : category.color}`" />
                  </div>
                  <div>
                    <p class="text-sm font-medium" :class="activeCategory === category.id ? 'text-purple-700' : 'text-gray-700'">{{ category.name }}</p>
                    <p class="text-xs text-gray-500">{{ category.description }}</p>
                  </div>
                  <div class="ml-auto">
                    <svg xmlns="http://www.w3.org/2000/svg" class="h-4 w-4 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5l7 7-7 7" />
                    </svg>
                  </div>
                </div>
              </li>
            </ul>
          </div>
        </div>
      </div>

      <!-- Right Column: Settings Content -->
      <div class="md:col-span-2">
        <!-- Account Settings -->
        <div v-if="activeCategory === 'account'" class="card">
          <div class="card-header flex items-center">
            <div class="flex-shrink-0 w-8 h-8 bg-blue-50 rounded-full flex items-center justify-center mr-3">
              <svg xmlns="http://www.w3.org/2000/svg" class="h-4 w-4 text-blue-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
              </svg>
            </div>
            <div>
              <h2 class="text-lg font-semibold text-gray-800">Account Settings</h2>
              <p class="text-xs text-gray-500">Manage your personal information</p>
            </div>
          </div>
          <div class="card-body">
            <form class="space-y-6" @submit.prevent="handleSaveAccountSettings">
              <div>
                <label class="block text-sm font-medium text-gray-700 mb-1">
                  Display Name
                </label>
                <input 
                  type="text" 
                  class="input w-full"
                  v-model="accountSettings.displayName"
                  placeholder="Enter your display name"
                />
              </div>
              
              <div>
                <label class="block text-sm font-medium text-gray-700 mb-1">
                  Email Address
                </label>
                <input 
                  type="email" 
                  class="input w-full"
                  v-model="accountSettings.email"
                  placeholder="Enter your email address"
                />
              </div>
              
              <div>
                <div class="flex items-center justify-between">
                  <label class="block text-sm font-medium text-gray-700">Profile Picture</label>
                  <button type="button" class="text-xs text-purple-600 hover:text-purple-700">Change</button>
                </div>
                <div class="mt-2 flex items-center">
                  <div class="w-16 h-16 rounded-full bg-gray-200 flex items-center justify-center overflow-hidden">
                    <svg xmlns="http://www.w3.org/2000/svg" class="h-10 w-10 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                    </svg>
                  </div>
                </div>
              </div>
              
              <div class="pt-4">
                <button 
                  type="submit" 
                  class="btn btn-primary w-full flex items-center justify-center"
                >
                  <svg xmlns="http://www.w3.org/2000/svg" class="h-4 w-4 mr-1" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7" />
                  </svg>
                  Save Account Settings
                </button>
              </div>
            </form>
          </div>
        </div>

        <!-- API Settings -->
        <div v-if="activeCategory === 'api'" class="card">
          <div class="card-header flex items-center">
            <div class="flex-shrink-0 w-8 h-8 bg-green-50 rounded-full flex items-center justify-center mr-3">
              <svg xmlns="http://www.w3.org/2000/svg" class="h-4 w-4 text-green-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M10 20l4-16m4 4l4 4-4 4M6 16l-4-4 4-4" />
              </svg>
            </div>
            <div>
              <h2 class="text-lg font-semibold text-gray-800">API Configuration</h2>
              <p class="text-xs text-gray-500">Set up Pocketbase API integration</p>
            </div>
          </div>
          <div class="card-body">
            <form class="space-y-6" @submit.prevent="handleSaveApiSettings">
              <div>
                <label class="block text-sm font-medium text-gray-700 mb-1">
                  API Base URL
                </label>
                <input 
                  type="text" 
                  class="input w-full"
                  v-model="apiSettings.baseUrl"
                  placeholder="https://example.com/api/"
                />
                <p class="mt-1 text-xs text-gray-500">The base URL for your Pocketbase API</p>
              </div>
              
              <div>
                <label class="block text-sm font-medium text-gray-700 mb-1">
                  API Endpoint
                </label>
                <input 
                  type="text" 
                  class="input w-full"
                  v-model="apiSettings.endpoint"
                  placeholder="collections/budget_tracker_transactions/records"
                />
                <p class="mt-1 text-xs text-gray-500">The specific endpoint for transactions</p>
              </div>
              
              <div>
                <label class="block text-sm font-medium text-gray-700 mb-1">
                  API Token
                </label>
                <div class="relative">
                  <input 
                    :type="showToken ? 'text' : 'password'" 
                    class="input w-full pr-10"
                    v-model="apiSettings.token"
                    placeholder="Enter your API token"
                  />
                  <button 
                    type="button" 
                    @click="showToken = !showToken"
                    class="absolute inset-y-0 right-0 pr-3 flex items-center text-gray-400 hover:text-gray-600"
                  >
                    <svg v-if="showToken" xmlns="http://www.w3.org/2000/svg" class="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.88 9.88l-3.29-3.29m7.532 7.532l3.29 3.29M3 3l3.59 3.59m0 0A9.953 9.953 0 0112 5c4.478 0 8.268 2.943 9.543 7a10.025 10.025 0 01-4.132 5.411m0 0L21 21" />
                    </svg>
                    <svg v-else xmlns="http://www.w3.org/2000/svg" class="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                      <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                    </svg>
                  </button>
                </div>
                <p class="mt-1 text-xs text-gray-500">Your authentication token for API access</p>
              </div>
              
              <div class="pt-4">
                <button 
                  type="submit" 
                  class="btn btn-primary w-full flex items-center justify-center"
                >
                  <svg xmlns="http://www.w3.org/2000/svg" class="h-4 w-4 mr-1" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7" />
                  </svg>
                  Save API Configuration
                </button>
              </div>
            </form>
          </div>
        </div>

        <!-- Display Settings -->
        <div v-if="activeCategory === 'display'" class="card">
          <div class="card-header flex items-center">
            <div class="flex-shrink-0 w-8 h-8 bg-amber-50 rounded-full flex items-center justify-center mr-3">
              <svg xmlns="http://www.w3.org/2000/svg" class="h-4 w-4 text-amber-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M7 21a4 4 0 01-4-4V5a2 2 0 012-2h4a2 2 0 012 2v12a4 4 0 01-4 4zm0 0h12a2 2 0 002-2v-4a2 2 0 00-2-2h-2.343M11 7.343l1.657-1.657a2 2 0 012.828 0l2.829 2.829a2 2 0 010 2.828l-8.486 8.485M7 17h.01" />
              </svg>
            </div>
            <div>
              <h2 class="text-lg font-semibold text-gray-800">Display Settings</h2>
              <p class="text-xs text-gray-500">Customize the application appearance</p>
            </div>
          </div>
          <div class="card-body">
            <form class="space-y-6" @submit.prevent="handleSaveDisplaySettings">
              <div>
                <label class="block text-sm font-medium text-gray-700 mb-3">Currency Format</label>
                <div class="flex flex-wrap gap-4">
                  <label class="flex items-center">
                    <input type="radio" v-model="displaySettings.currencyFormat" value="EUR" class="form-radio text-blue-600" />
                    <span class="ml-2 text-sm text-gray-700">EUR (€)</span>
                  </label>
                  <label class="flex items-center">
                    <input type="radio" v-model="displaySettings.currencyFormat" value="USD" class="form-radio text-blue-600" />
                    <span class="ml-2 text-sm text-gray-700">USD ($)</span>
                  </label>
                  <label class="flex items-center">
                    <input type="radio" v-model="displaySettings.currencyFormat" value="GBP" class="form-radio text-blue-600" />
                    <span class="ml-2 text-sm text-gray-700">GBP (£)</span>
                  </label>
                </div>
              </div>
              
              <div class="border-t border-gray-200 pt-4">
                <label class="block text-sm font-medium text-gray-700 mb-3">Date Format</label>
                <div class="flex flex-wrap gap-4">
                  <label class="flex items-center">
                    <input type="radio" v-model="displaySettings.dateFormat" value="MM/DD/YYYY" class="form-radio text-blue-600" />
                    <span class="ml-2 text-sm text-gray-700">MM/DD/YYYY</span>
                  </label>
                  <label class="flex items-center">
                    <input type="radio" v-model="displaySettings.dateFormat" value="DD/MM/YYYY" class="form-radio text-blue-600" />
                    <span class="ml-2 text-sm text-gray-700">DD/MM/YYYY</span>
                  </label>
                  <label class="flex items-center">
                    <input type="radio" v-model="displaySettings.dateFormat" value="YYYY-MM-DD" class="form-radio text-blue-600" />
                    <span class="ml-2 text-sm text-gray-700">YYYY-MM-DD</span>
                  </label>
                </div>
              </div>
              
              <div class="border-t border-gray-200 pt-4">
                <label class="flex items-center justify-between mb-3">
                  <span class="text-sm font-medium text-gray-700">Dark Mode</span>
                  <button 
                    type="button"
                    @click="displaySettings.darkMode = !displaySettings.darkMode"
                    :class="[
                      'relative inline-flex h-6 w-11 items-center rounded-full transition-colors focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2',
                      displaySettings.darkMode ? 'bg-blue-600' : 'bg-gray-200'
                    ]"
                  >
                    <span
                      :class="[
                        'inline-block h-4 w-4 transform rounded-full bg-white transition-transform',
                        displaySettings.darkMode ? 'translate-x-6' : 'translate-x-1'
                      ]"
                    ></span>
                  </button>
                </label>
              </div>
              
              <div class="border-t border-gray-200 pt-4">
                <label class="flex items-center justify-between mb-3">
                  <span class="text-sm font-medium text-gray-700">Show Balance in Header</span>
                  <button 
                    type="button"
                    @click="displaySettings.showHeaderBalance = !displaySettings.showHeaderBalance"
                    :class="[
                      'relative inline-flex h-6 w-11 items-center rounded-full transition-colors focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2',
                      displaySettings.showHeaderBalance ? 'bg-blue-600' : 'bg-gray-200'
                    ]"
                  >
                    <span
                      :class="[
                        'inline-block h-4 w-4 transform rounded-full bg-white transition-transform',
                        displaySettings.showHeaderBalance ? 'translate-x-6' : 'translate-x-1'
                      ]"
                    ></span>
                  </button>
                </label>
              </div>
              
              <div class="pt-4">
                <button 
                  type="submit" 
                  class="btn btn-primary w-full flex items-center justify-center"
                >
                  <svg xmlns="http://www.w3.org/2000/svg" class="h-4 w-4 mr-1" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7" />
                  </svg>
                  Save Display Settings
                </button>
              </div>
            </form>
          </div>
        </div>

        <!-- Notification Settings -->
        <div v-if="activeCategory === 'notifications'" class="card">
          <div class="card-header flex items-center">
            <div class="flex-shrink-0 w-8 h-8 bg-red-50 rounded-full flex items-center justify-center mr-3">
              <svg xmlns="http://www.w3.org/2000/svg" class="h-4 w-4 text-red-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" />
              </svg>
            </div>
            <div>
              <h2 class="text-lg font-semibold text-gray-800">Notification Settings</h2>
              <p class="text-xs text-gray-500">Configure when and how you receive alerts</p>
            </div>
          </div>
          <div class="card-body">
            <form class="space-y-6" @submit.prevent="handleSaveNotificationSettings">
              <div>
                <label class="flex items-center justify-between mb-3">
                  <span class="text-sm font-medium text-gray-700">Push Notifications</span>
                  <button 
                    type="button"
                    @click="notificationSettings.pushEnabled = !notificationSettings.pushEnabled"
                    :class="[
                      'relative inline-flex h-6 w-11 items-center rounded-full transition-colors focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2',
                      notificationSettings.pushEnabled ? 'bg-blue-600' : 'bg-gray-200'
                    ]"
                  >
                    <span
                      :class="[
                        'inline-block h-4 w-4 transform rounded-full bg-white transition-transform',
                        notificationSettings.pushEnabled ? 'translate-x-6' : 'translate-x-1'
                      ]"
                    ></span>
                  </button>
                </label>
                <p class="text-xs text-gray-500 mb-3">Receive notifications even when the app is closed</p>
              </div>
              
              <div class="border-t border-gray-200 pt-4">
                <label class="block text-sm font-medium text-gray-700 mb-3">Notify me about:</label>
                
                <div class="space-y-3">
                  <label class="flex items-center">
                    <input 
                      type="checkbox" 
                      v-model="notificationSettings.newTransactions" 
                      class="form-checkbox h-4 w-4 text-blue-600 rounded"
                      :disabled="!notificationSettings.pushEnabled"
                    />
                    <span class="ml-2 text-sm text-gray-700">New transactions</span>
                  </label>
                  
                  <label class="flex items-center">
                    <input 
                      type="checkbox" 
                      v-model="notificationSettings.syncCompleted" 
                      class="form-checkbox h-4 w-4 text-blue-600 rounded"
                      :disabled="!notificationSettings.pushEnabled"
                    />
                    <span class="ml-2 text-sm text-gray-700">Sync completion</span>
                  </label>
                  
                  <label class="flex items-center">
                    <input 
                      type="checkbox" 
                      v-model="notificationSettings.balanceUpdates" 
                      class="form-checkbox h-4 w-4 text-blue-600 rounded"
                      :disabled="!notificationSettings.pushEnabled"
                    />
                    <span class="ml-2 text-sm text-gray-700">Balance updates</span>
                  </label>
                </div>
              </div>
              
              <div class="pt-4">
                <button 
                  type="submit" 
                  class="btn btn-primary w-full flex items-center justify-center"
                  :disabled="!notificationSettings.pushEnabled"
                >
                  <svg xmlns="http://www.w3.org/2000/svg" class="h-4 w-4 mr-1" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7" />
                  </svg>
                  Save Notification Settings
                </button>
              </div>
            </form>
          </div>
        </div>

        <!-- Data Management -->
        <div v-if="activeCategory === 'data'" class="card">
          <div class="card-header flex items-center">
            <div class="flex-shrink-0 w-8 h-8 bg-indigo-50 rounded-full flex items-center justify-center mr-3">
              <svg xmlns="http://www.w3.org/2000/svg" class="h-4 w-4 text-indigo-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 7v10c0 2.21 3.582 4 8 4s8-1.79 8-4V7M4 7c0 2.21 3.582 4 8 4s8-1.79 8-4M4 7c0-2.21 3.582-4 8-4s8 1.79 8 4m0 5c0 2.21-3.582 4-8 4s-8-1.79-8-4" />
              </svg>
            </div>
            <div>
              <h2 class="text-lg font-semibold text-gray-800">Data Management</h2>
              <p class="text-xs text-gray-500">Export and backup your financial data</p>
            </div>
          </div>
          <div class="card-body">
            <div class="space-y-6">
              <div>
                <h3 class="text-sm font-medium text-gray-700 mb-2">Export Data</h3>
                <p class="text-xs text-gray-500 mb-4">Download a copy of all your transactions and settings</p>
                
                <div class="flex gap-3">
                  <button 
                    @click="handleExportData('json')"
                    class="btn btn-secondary flex items-center justify-center flex-1"
                  >
                    <svg xmlns="http://www.w3.org/2000/svg" class="h-4 w-4 mr-1" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                    </svg>
                    Export as JSON
                  </button>
                  
                  <button 
                    @click="handleExportData('csv')"
                    class="btn btn-secondary flex items-center justify-center flex-1"
                  >
                    <svg xmlns="http://www.w3.org/2000/svg" class="h-4 w-4 mr-1" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                    </svg>
                    Export as CSV
                  </button>
                </div>
              </div>
              
              <div class="border-t border-gray-200 pt-4">
                <h3 class="text-sm font-medium text-gray-700 mb-2">Data Synchronization</h3>
                <p class="text-xs text-gray-500 mb-4">Manage how your data syncs across devices</p>
                
                <div class="bg-gray-50 p-4 rounded-lg border border-gray-200">
                  <div class="flex items-center justify-between mb-3">
                    <div>
                      <p class="text-sm font-medium text-gray-700">Last sync:</p>
                      <p class="text-xs text-gray-500">{{ lastSyncTime || 'Never' }}</p>
                    </div>
                    
                    <button 
                      @click="syncData"
                      class="btn btn-primary text-sm flex items-center"
                      :disabled="isSyncing"
                    >
                      <svg v-if="isSyncing" class="animate-spin -ml-1 mr-2 h-4 w-4 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                        <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle>
                        <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                      </svg>
                      <svg v-else xmlns="http://www.w3.org/2000/svg" class="h-4 w-4 mr-1" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                      </svg>
                      {{ isSyncing ? 'Syncing...' : 'Sync Now' }}
                    </button>
                  </div>
                  
                  <div>
                    <div class="h-2 bg-gray-200 rounded-full overflow-hidden">
                      <div 
                        class="h-full bg-blue-600 rounded-full" 
                        :style="`width: ${syncProgress}%`"
                      ></div>
                    </div>
                    <p class="mt-1 text-xs text-gray-500 text-right">{{ syncProgress }}% complete</p>
                  </div>
                </div>
              </div>
              
              <div class="border-t border-gray-200 pt-4">
                <h3 class="text-sm font-medium text-red-600 mb-2">Danger Zone</h3>
                <p class="text-xs text-gray-500 mb-4">Permanent actions that can't be undone</p>
                
                <div class="space-y-3">
                  <button 
                    @click="showClearDataConfirm = true"
                    class="btn btn-danger w-full flex items-center justify-center"
                  >
                    <svg xmlns="http://www.w3.org/2000/svg" class="h-4 w-4 mr-1" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                    </svg>
                    Clear All Local Data
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>

    <!-- Confirmation Modal for Clear Data -->
    <div v-if="showClearDataConfirm" class="fixed inset-0 z-50 overflow-y-auto" aria-labelledby="modal-title" role="dialog" aria-modal="true">
      <div class="flex items-end justify-center min-h-screen pt-4 px-4 pb-20 text-center sm:block sm:p-0">
        <div class="fixed inset-0 bg-gray-500 bg-opacity-75 transition-opacity" aria-hidden="true" @click="showClearDataConfirm = false"></div>

        <span class="hidden sm:inline-block sm:align-middle sm:h-screen" aria-hidden="true">&#8203;</span>

        <div class="inline-block align-bottom bg-white rounded-lg text-left overflow-hidden shadow-xl transform transition-all sm:my-8 sm:align-middle sm:max-w-lg sm:w-full">
          <div class="bg-white px-4 pt-5 pb-4 sm:p-6 sm:pb-4">
            <div class="sm:flex sm:items-start">
              <div class="mx-auto flex-shrink-0 flex items-center justify-center h-12 w-12 rounded-full bg-red-100 sm:mx-0 sm:h-10 sm:w-10">
                <svg class="h-6 w-6 text-red-600" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                </svg>
              </div>
              <div class="mt-3 text-center sm:mt-0 sm:ml-4 sm:text-left">
                <h3 class="text-lg leading-6 font-medium text-gray-900" id="modal-title">Clear All Data</h3>
                <div class="mt-2">
                  <p class="text-sm text-gray-500">
                    Are you sure you want to clear all local data? This action cannot be undone. All of your transactions, settings and offline data will be permanently removed.
                  </p>
                </div>
              </div>
            </div>
          </div>
          <div class="bg-gray-50 px-4 py-3 sm:px-6 sm:flex sm:flex-row-reverse">
            <button 
              @click="handleClearAllData" 
              type="button" 
              class="w-full inline-flex justify-center rounded-md border border-transparent shadow-sm px-4 py-2 bg-red-600 text-base font-medium text-white hover:bg-red-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-red-500 sm:ml-3 sm:w-auto sm:text-sm"
            >
              Delete All Data
            </button>
            <button 
              @click="showClearDataConfirm = false" 
              type="button" 
              class="mt-3 w-full inline-flex justify-center rounded-md border border-gray-300 shadow-sm px-4 py-2 bg-white text-base font-medium text-gray-700 hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 sm:mt-0 sm:ml-3 sm:w-auto sm:text-sm"
            >
              Cancel
            </button>
          </div>
        </div>
      </div>
    </div>

    <!-- Success Notification -->
    <div 
      v-if="showNotification" 
      class="fixed bottom-4 right-4 bg-green-100 border-l-4 border-green-500 text-green-700 p-4 rounded shadow-md transition-all duration-300 transform"
      :class="[showNotification ? 'translate-y-0 opacity-100' : 'translate-y-10 opacity-0']"
    >
      <div class="flex items-center">
        <div class="flex-shrink-0">
          <svg class="h-5 w-5 text-green-500" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor">
            <path fill-rule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clip-rule="evenodd" />
          </svg>
        </div>
        <div class="ml-3">
          <p class="text-sm">{{ notificationMessage }}</p>
        </div>
        <div class="ml-auto pl-3">
          <div class="-mx-1.5 -my-1.5">
            <button 
              @click="showNotification = false" 
              class="inline-flex rounded-md p-1.5 text-green-500 hover:bg-green-200 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-green-500"
            >
              <span class="sr-only">Dismiss</span>
              <svg class="h-4 w-4" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor">
                <path fill-rule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clip-rule="evenodd" />
              </svg>
            </button>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, onMounted } from 'vue'
import { useTransactions } from '~/composables/useTransactions'
import { useAppSettings } from '~/composables/useAppSettings'
import { useOfflineQueue } from '~/composables/useOfflineQueue'

const { syncStatus, syncTransactionsQueue } = useTransactions()
const { offlineQueue, isSyncing: queueIsSyncing } = useOfflineQueue()

// Get app settings
const { 
  accountSettings, 
  apiSettings, 
  displaySettings, 
  notificationSettings,
  isSaving,
  saveAccountSettings,
  saveApiSettings,
  saveDisplaySettings,
  saveNotificationSettings,
  exportData,
  clearAllData
} = useAppSettings()

// Define settings categories
const settingsCategories = [
  {
    id: 'account',
    name: 'Account Settings',
    description: 'Manage your personal details',
    icon: 'svg-icon-user',
    background: 'bg-blue-50',
    activeBackground: 'bg-blue-100',
    color: 'text-blue-600',
    activeColor: 'text-blue-700'
  },
  {
    id: 'api',
    name: 'API Configuration',
    description: 'Set up Pocketbase integration',
    icon: 'svg-icon-api',
    background: 'bg-green-50',
    activeBackground: 'bg-green-100',
    color: 'text-green-600',
    activeColor: 'text-green-700'
  },
  {
    id: 'display',
    name: 'Display Settings',
    description: 'Customize appearance',
    icon: 'svg-icon-display',
    background: 'bg-amber-50',
    activeBackground: 'bg-amber-100',
    color: 'text-amber-600',
    activeColor: 'text-amber-700'
  },
  {
    id: 'notifications',
    name: 'Notifications',
    description: 'Configure alerts and reminders',
    icon: 'svg-icon-notification',
    background: 'bg-red-50',
    activeBackground: 'bg-red-100',
    color: 'text-red-600',
    activeColor: 'text-red-700'
  },
  {
    id: 'data',
    name: 'Data Management',
    description: 'Export, backup or clear data',
    icon: 'svg-icon-data',
    background: 'bg-indigo-50',
    activeBackground: 'bg-indigo-100',
    color: 'text-indigo-600',
    activeColor: 'text-indigo-700'
  }
]

// SVG icon components
const components = {
  'svg-icon-user': {
    template: `<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
    </svg>`
  },
  'svg-icon-api': {
    template: `<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M10 20l4-16m4 4l4 4-4 4M6 16l-4-4 4-4" />
    </svg>`
  },
  'svg-icon-display': {
    template: `<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M7 21a4 4 0 01-4-4V5a2 2 0 012-2h4a2 2 0 012 2v12a4 4 0 01-4 4zm0 0h12a2 2 0 002-2v-4a2 2 0 00-2-2h-2.343M11 7.343l1.657-1.657a2 2 0 012.828 0l2.829 2.829a2 2 0 010 2.828l-8.486 8.485M7 17h.01" />
    </svg>`
  },
  'svg-icon-notification': {
    template: `<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" />
    </svg>`
  },
  'svg-icon-data': {
    template: `<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 7v10c0 2.21 3.582 4 8 4s8-1.79 8-4V7M4 7c0 2.21 3.582 4 8 4s8-1.79 8-4M4 7c0-2.21 3.582-4 8-4s8 1.79 8 4m0 5c0 2.21-3.582 4-8 4s-8-1.79-8-4" />
    </svg>`
  }
}

// Track active settings category
const activeCategory = ref('account')

// Data management state
const showClearDataConfirm = ref(false)
const lastSyncTime = ref(syncStatus.value?.lastSync ? new Date(syncStatus.value.lastSync).toLocaleString() : null)
const syncProgress = ref(0)
const showToken = ref(false)

// Notification handling
const showNotification = ref(false)
const notificationMessage = ref('')

// Helper function to show success notification
const showSuccessNotification = (message) => {
  notificationMessage.value = message
  showNotification.value = true
  
  // Auto-hide after 3 seconds
  setTimeout(() => {
    showNotification.value = false
  }, 3000)
}

// Sync data
const syncData = async () => {
  if (queueIsSyncing.value || !syncStatus.value.isOnline || !offlineQueue.value.length) {
    return
  }
  
  syncProgress.value = 0
  const totalItems = offlineQueue.value.length
  
  // Start the sync process
  const result = await syncTransactionsQueue()
  
  if (result) {
    syncProgress.value = 100
    lastSyncTime.value = new Date().toLocaleString()
    showSuccessNotification(`Successfully synced ${result.processed} transactions.`)
  }
}

// Handle form submissions with success notifications
const handleSaveAccountSettings = async () => {
  const result = await saveAccountSettings()
  if (result) {
    showSuccessNotification('Account settings saved successfully')
  }
}

const handleSaveApiSettings = async () => {
  const result = await saveApiSettings()
  if (result) {
    showSuccessNotification('API settings saved successfully')
  }
}

const handleSaveDisplaySettings = async () => {
  const result = await saveDisplaySettings()
  if (result) {
    showSuccessNotification('Display settings saved successfully')
  }
}

const handleSaveNotificationSettings = async () => {
  const result = await saveNotificationSettings()
  if (result) {
    showSuccessNotification('Notification settings saved successfully')
  }
}

// Handle data export
const handleExportData = async (format) => {
  const result = await exportData(format)
  if (result.success) {
    showSuccessNotification(`Data exported as ${format.toUpperCase()} successfully`)
  } else {
    showSuccessNotification(`Failed to export data: ${result.error}`)
  }
}

// Handle clearing all data
const handleClearAllData = async () => {
  const result = await clearAllData()
  showClearDataConfirm.value = false
  
  if (result) {
    showSuccessNotification('All data cleared successfully')
  } else {
    showSuccessNotification('Failed to clear data')
  }
}
</script>

<style scoped>
/* Transitions for modals and notifications */
.fade-enter-active, .fade-leave-active {
  transition: opacity 0.3s ease;
}
.fade-enter-from, .fade-leave-to {
  opacity: 0;
}

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

.btn-danger {
  @apply bg-red-600 text-white hover:bg-red-700;
}
</style>