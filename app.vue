<template>
  <div :class="[
    'min-h-screen transition-colors duration-300',
    displaySettings.darkMode ? 'dark bg-gradient-to-br from-gray-900 to-gray-800' : 'bg-gradient-to-br from-gray-50 to-gray-100'
  ]">
    <!-- Navigation Bar -->
    <nav :class="[
      'backdrop-blur-sm shadow-lg sticky top-0 z-50 transition-all duration-300',
      displaySettings.darkMode ? 'bg-gray-900/90' : 'bg-white/90'
    ]">
      <div class="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div class="flex justify-between h-16">
          <div class="flex items-center">
            <div class="flex-shrink-0 flex items-center">
              <h1 class="text-xl md:text-2xl font-bold bg-gradient-to-r from-blue-600 to-blue-800 bg-clip-text text-transparent">Budget Tracker</h1>
              <span v-if="accountSettings.displayName" class="ml-2 text-xs text-gray-500 dark:text-gray-400">
                {{ accountSettings.displayName }}
              </span>
            </div>
            <div class="hidden md:ml-8 md:flex md:space-x-8">
              <NuxtLink to="/" :class="[
                `nav-link inline-flex items-center px-1 pt-1 border-b-2 text-sm font-medium`, 
                $route.path === '/' 
                  ? 'border-blue-500 text-gray-900 dark:text-white' 
                  : 'border-transparent text-gray-500 hover:border-gray-300 hover:text-gray-700 dark:text-gray-300 dark:hover:text-gray-100'
              ]">
                <svg xmlns="http://www.w3.org/2000/svg" class="h-4 w-4 mr-1" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6" />
                </svg>
                Dashboard
              </NuxtLink>
              <NuxtLink to="/catalog" :class="[
                `nav-link inline-flex items-center px-1 pt-1 border-b-2 text-sm font-medium`, 
                $route.path === '/catalog' 
                  ? 'border-blue-500 text-gray-900 dark:text-white' 
                  : 'border-transparent text-gray-500 hover:border-gray-300 hover:text-gray-700 dark:text-gray-300 dark:hover:text-gray-100'
              ]">
                <svg xmlns="http://www.w3.org/2000/svg" class="h-4 w-4 mr-1" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M16 11V7a4 4 0 00-8 0v4M5 9h14l1 12H4L5 9z" />
                </svg>
                Catalog
              </NuxtLink>
              <NuxtLink to="/business-card" :class="[
                `nav-link inline-flex items-center px-1 pt-1 border-b-2 text-sm font-medium`, 
                $route.path === '/business-card' 
                  ? 'border-blue-500 text-gray-900 dark:text-white' 
                  : 'border-transparent text-gray-500 hover:border-gray-300 hover:text-gray-700 dark:text-gray-300 dark:hover:text-gray-100'
              ]">
                <svg xmlns="http://www.w3.org/2000/svg" class="h-4 w-4 mr-1" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M10 6H5a2 2 0 00-2 2v9a2 2 0 002 2h14a2 2 0 002-2V8a2 2 0 00-2-2h-5m-4 0V5a2 2 0 114 0v1m-4 0a2 2 0 104 0m-5 8a2 2 0 100-4 2 2 0 000 4zm0 0c1.306 0 2.417.835 2.83 2M9 14a3.001 3.001 0 00-2.83 2M15 11h3m-3 4h2" />
                </svg>
                Business Card
              </NuxtLink>
              <NuxtLink to="/reports" :class="[
                `nav-link inline-flex items-center px-1 pt-1 border-b-2 text-sm font-medium`, 
                $route.path === '/reports' 
                  ? 'border-blue-500 text-gray-900 dark:text-white' 
                  : 'border-transparent text-gray-500 hover:border-gray-300 hover:text-gray-700 dark:text-gray-300 dark:hover:text-gray-100'
              ]">
                <svg xmlns="http://www.w3.org/2000/svg" class="h-4 w-4 mr-1" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
                </svg>
                Reports
              </NuxtLink>
              <NuxtLink to="/settings" :class="[
                `nav-link inline-flex items-center px-1 pt-1 border-b-2 text-sm font-medium`, 
                $route.path === '/settings' 
                  ? 'border-blue-500 text-gray-900 dark:text-white' 
                  : 'border-transparent text-gray-500 hover:border-gray-300 hover:text-gray-700 dark:text-gray-300 dark:hover:text-gray-100'
              ]">
                <svg xmlns="http://www.w3.org/2000/svg" class="h-4 w-4 mr-1" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                </svg>
                Settings
              </NuxtLink>
            </div>
          </div>
          
          <div class="flex items-center">
            <div v-if="displaySettings.showHeaderBalance" class="nav-balance transition-all duration-300 hidden md:block" :class="{ 'opacity-0': isBalanceHidden, 'opacity-100': !isBalanceHidden }">
              <p class="text-sm font-medium" :class="[earnings >= 0 ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400']">
                {{ formatCurrency(earnings, displaySettings.currencyFormat) }}
              </p>
            </div>
            
            <!-- Mobile menu button -->
            <button 
              @click="toggleMobileMenu" 
              type="button"
              class="md:hidden inline-flex items-center justify-center p-2 rounded-md text-gray-500 hover:text-blue-600 hover:bg-gray-100 focus:outline-none focus:ring-2 focus:ring-inset focus:ring-blue-500"
              aria-controls="mobile-menu"
              :aria-expanded="isMobileMenuOpen"
            >
              <span class="sr-only">{{ isMobileMenuOpen ? 'Close menu' : 'Open menu' }}</span>
              <!-- Icon when menu is closed -->
              <svg 
                :class="{'hidden': isMobileMenuOpen, 'block': !isMobileMenuOpen }"
                class="h-6 w-6" 
                xmlns="http://www.w3.org/2000/svg" 
                fill="none" 
                viewBox="0 0 24 24" 
                stroke="currentColor" 
                aria-hidden="true"
              >
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 6h16M4 12h16M4 18h16" />
              </svg>
              <!-- Icon when menu is open -->
              <svg 
                :class="{'block': isMobileMenuOpen, 'hidden': !isMobileMenuOpen }"
                class="h-6 w-6" 
                xmlns="http://www.w3.org/2000/svg" 
                fill="none" 
                viewBox="0 0 24 24" 
                stroke="currentColor" 
                aria-hidden="true"
              >
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
        </div>
      </div>
      
      <!-- Mobile menu, show/hide based on menu state -->
      <div 
        id="mobile-menu"
        class="md:hidden"
        :class="{ 'block': isMobileMenuOpen, 'hidden': !isMobileMenuOpen }"
      >
        <div :class="[
          'px-2 pt-2 pb-3 space-y-1 border-t',
          displaySettings.darkMode ? 'border-gray-700' : 'border-gray-200'
        ]">
          <NuxtLink 
            to="/" 
            class="block px-3 py-2 rounded-md text-base font-medium transition-colors flex items-center"
            :class="[
              $route.path === '/' 
                ? displaySettings.darkMode ? 'bg-blue-900/40 text-blue-400' : 'bg-blue-50 text-blue-700' 
                : displaySettings.darkMode ? 'text-gray-300 hover:bg-gray-800 hover:text-gray-100' : 'text-gray-600 hover:bg-gray-50 hover:text-gray-900'
            ]"
            @click="closeMobileMenu"
          >
            <svg xmlns="http://www.w3.org/2000/svg" class="h-5 w-5 mr-2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6" />
            </svg>
            Dashboard
          </NuxtLink>
          <NuxtLink 
            to="/catalog" 
            class="block px-3 py-2 rounded-md text-base font-medium transition-colors flex items-center"
            :class="[
              $route.path === '/catalog' 
                ? displaySettings.darkMode ? 'bg-blue-900/40 text-blue-400' : 'bg-blue-50 text-blue-700' 
                : displaySettings.darkMode ? 'text-gray-300 hover:bg-gray-800 hover:text-gray-100' : 'text-gray-600 hover:bg-gray-50 hover:text-gray-900'
            ]"
            @click="closeMobileMenu"
          >
            <svg xmlns="http://www.w3.org/2000/svg" class="h-5 w-5 mr-2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M16 11V7a4 4 0 00-8 0v4M5 9h14l1 12H4L5 9z" />
            </svg>
            Catalog
          </NuxtLink>
          <NuxtLink 
            to="/business-card" 
            class="block px-3 py-2 rounded-md text-base font-medium transition-colors flex items-center"
            :class="[
              $route.path === '/business-card' 
                ? displaySettings.darkMode ? 'bg-blue-900/40 text-blue-400' : 'bg-blue-50 text-blue-700' 
                : displaySettings.darkMode ? 'text-gray-300 hover:bg-gray-800 hover:text-gray-100' : 'text-gray-600 hover:bg-gray-50 hover:text-gray-900'
            ]"
            @click="closeMobileMenu"
          >
            <svg xmlns="http://www.w3.org/2000/svg" class="h-5 w-5 mr-2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M10 6H5a2 2 0 00-2 2v9a2 2 0 002 2h14a2 2 0 002-2V8a2 2 0 00-2-2h-5m-4 0V5a2 2 0 114 0v1m-4 0a2 2 0 104 0m-5 8a2 2 0 100-4 2 2 0 000 4zm0 0c1.306 0 2.417.835 2.83 2M9 14a3.001 3.001 0 00-2.83 2M15 11h3m-3 4h2" />
            </svg>
            Business Card
          </NuxtLink>
          <NuxtLink 
            to="/reports" 
            class="block px-3 py-2 rounded-md text-base font-medium transition-colors flex items-center"
            :class="[
              $route.path === '/reports' 
                ? displaySettings.darkMode ? 'bg-blue-900/40 text-blue-400' : 'bg-blue-50 text-blue-700' 
                : displaySettings.darkMode ? 'text-gray-300 hover:bg-gray-800 hover:text-gray-100' : 'text-gray-600 hover:bg-gray-50 hover:text-gray-900'
            ]"
            @click="closeMobileMenu"
          >
            <svg xmlns="http://www.w3.org/2000/svg" class="h-5 w-5 mr-2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
            </svg>
            Reports
          </NuxtLink>
          <NuxtLink 
            to="/settings" 
            class="block px-3 py-2 rounded-md text-base font-medium transition-colors flex items-center"
            :class="[
              $route.path === '/settings' 
                ? displaySettings.darkMode ? 'bg-blue-900/40 text-blue-400' : 'bg-blue-50 text-blue-700' 
                : displaySettings.darkMode ? 'text-gray-300 hover:bg-gray-800 hover:text-gray-100' : 'text-gray-600 hover:bg-gray-50 hover:text-gray-900'
            ]"
            @click="closeMobileMenu"
          >
            <svg xmlns="http://www.w3.org/2000/svg" class="h-5 w-5 mr-2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
            </svg>
            Settings
          </NuxtLink>
        </div>
        
        <!-- Mobile balance display -->
        <div v-if="displaySettings.showHeaderBalance" :class="[
          'px-5 py-3 border-t',
          displaySettings.darkMode ? 'border-gray-700 bg-gray-800' : 'border-gray-200 bg-gray-50'
        ]">
          <div class="flex items-center">
            <div :class="[
              'flex-shrink-0 w-8 h-8 rounded-full flex items-center justify-center mr-2',
              displaySettings.darkMode ? 'bg-blue-900' : 'bg-blue-50'
            ]">
              <svg xmlns="http://www.w3.org/2000/svg" :class="[
                'h-4 w-4',
                displaySettings.darkMode ? 'text-blue-400' : 'text-blue-600'
              ]" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
            </div>
            <div>
              <p :class="[
                'text-xs',
                displaySettings.darkMode ? 'text-gray-400' : 'text-gray-500'
              ]">Current Balance</p>
              <p class="text-sm font-medium" :class="[
                earnings >= 0 
                  ? displaySettings.darkMode ? 'text-green-400' : 'text-green-600' 
                  : displaySettings.darkMode ? 'text-red-400' : 'text-red-600'
              ]">{{ formatCurrency(earnings, displaySettings.currencyFormat) }}</p>
            </div>
          </div>
        </div>
      </div>
    </nav>

    <!-- Main Content -->
    <main :class="[
      'max-w-7xl mx-auto py-6 sm:px-6 lg:px-8',
      displaySettings.darkMode ? 'text-white' : ''
    ]">
      <NuxtPage />
    </main>
    
    <!-- PWA Install Prompt -->
    <PWAInstall />
  </div>
</template>

<script setup>
import { ref, onMounted, watch } from 'vue'
import { formatCurrency as defaultFormatCurrency } from '~/utils/currency'
import { useTransactions } from '~/composables/useTransactions'
import { useAppSettings } from '~/composables/useAppSettings'

const { earnings } = useTransactions()
const { 
  accountSettings,
  apiSettings,
  displaySettings,
  notificationSettings,
  saveDisplaySettings
} = useAppSettings()

// Apply dark mode to the document
const applyDarkMode = () => {
  if (displaySettings.darkMode) {
    document.documentElement.classList.add('dark')
  } else {
    document.documentElement.classList.remove('dark')
  }
}

const isBalanceHidden = ref(false)
const isMobileMenuOpen = ref(false)

// Format currency with settings
const formatCurrency = (amount, format) => {
  const currencyFormat = format || displaySettings.currencyFormat || 'EUR'
  return defaultFormatCurrency(amount, currencyFormat)
}

// Toggle mobile menu
const toggleMobileMenu = () => {
  isMobileMenuOpen.value = !isMobileMenuOpen.value
  
  // If menu is opened, add event listener to detect clicks outside the menu
  if (isMobileMenuOpen.value) {
    setTimeout(() => {
      window.addEventListener('click', handleOutsideClick)
    }, 100)
  }
}

// Close mobile menu
const closeMobileMenu = () => {
  isMobileMenuOpen.value = false
  window.removeEventListener('click', handleOutsideClick)
}

// Handle clicks outside the menu to close it
const handleOutsideClick = (event) => {
  const mobileMenu = document.getElementById('mobile-menu')
  const mobileMenuButton = document.querySelector('button[aria-controls="mobile-menu"]')
  
  if (mobileMenu && mobileMenuButton && 
      !mobileMenu.contains(event.target) && 
      !mobileMenuButton.contains(event.target)) {
    closeMobileMenu()
  }
}

// Close menu when resizing to desktop view
const handleResize = () => {
  if (window.innerWidth >= 768 && isMobileMenuOpen.value) {
    closeMobileMenu()
  }
}

// Clean up event listeners
const cleanupEventListeners = () => {
  window.removeEventListener('click', handleOutsideClick)
  window.removeEventListener('resize', handleResize)
}

// Close menu when changing pages
watch(() => window.location.pathname, () => {
  if (isMobileMenuOpen.value) {
    closeMobileMenu()
  }
})

// Watch for dark mode setting changes
watch(() => displaySettings.darkMode, (newVal) => {
  applyDarkMode()
}, { immediate: true })

onMounted(() => {
  // Apply dark mode based on current settings
  applyDarkMode()
  
  // Balance visibility observer
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
  
  // Add resize event listener
  window.addEventListener('resize', handleResize)
  
  // Clean up on unmount
  return () => {
    cleanupEventListeners()
    if (balanceCard) {
      observer.unobserve(balanceCard)
    }
  }
})
</script>
