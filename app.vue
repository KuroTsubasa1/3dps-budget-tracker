<template>
  <div class="min-h-screen bg-gradient-to-br from-gray-50 to-gray-100">
    <!-- Navigation Bar -->
    <nav class="bg-white/90 backdrop-blur-sm shadow-lg sticky top-0 z-50 transition-all duration-300">
      <div class="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div class="flex justify-between h-16">
          <div class="flex items-center">
            <div class="flex-shrink-0 flex items-center">
              <h1 class="text-xl md:text-2xl font-bold bg-gradient-to-r from-blue-600 to-blue-800 bg-clip-text text-transparent">Budget Tracker</h1>
            </div>
            <div class="hidden md:ml-8 md:flex md:space-x-8">
              <NuxtLink to="/" :class="[`nav-link inline-flex items-center px-1 pt-1 border-b-2 text-sm font-medium`, $route.path === '/' ? 'border-blue-500 text-gray-900' : 'border-transparent text-gray-500 hover:border-gray-300 hover:text-gray-700']">
                Dashboard
              </NuxtLink>
              <NuxtLink to="/catalog" :class="[`nav-link inline-flex items-center px-1 pt-1 border-b-2 text-sm font-medium`, $route.path === '/catalog' ? 'border-blue-500 text-gray-900' : 'border-transparent text-gray-500 hover:border-gray-300 hover:text-gray-700']">
                Catalog
              </NuxtLink>
              <NuxtLink to="/business-card" :class="[`nav-link inline-flex items-center px-1 pt-1 border-b-2 text-sm font-medium`, $route.path === '/business-card' ? 'border-blue-500 text-gray-900' : 'border-transparent text-gray-500 hover:border-gray-300 hover:text-gray-700']">
                Business Card
              </NuxtLink>
            </div>
          </div>
          
          <div class="flex items-center">
            <div class="nav-balance transition-all duration-300 hidden md:block" :class="{ 'opacity-0': isBalanceHidden, 'opacity-100': !isBalanceHidden }">
              <p class="text-sm font-medium" :class="[earnings >= 0 ? 'text-green-600' : 'text-red-600']">{{ formatCurrency(earnings) }}</p>
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
        <div class="px-2 pt-2 pb-3 space-y-1 border-t border-gray-200">
          <NuxtLink 
            to="/" 
            class="block px-3 py-2 rounded-md text-base font-medium transition-colors"
            :class="[$route.path === '/' ? 'bg-blue-50 text-blue-700' : 'text-gray-600 hover:bg-gray-50 hover:text-gray-900']"
            @click="closeMobileMenu"
          >
            Dashboard
          </NuxtLink>
          <NuxtLink 
            to="/catalog" 
            class="block px-3 py-2 rounded-md text-base font-medium transition-colors"
            :class="[$route.path === '/catalog' ? 'bg-blue-50 text-blue-700' : 'text-gray-600 hover:bg-gray-50 hover:text-gray-900']"
            @click="closeMobileMenu"
          >
            Catalog
          </NuxtLink>
          <NuxtLink 
            to="/business-card" 
            class="block px-3 py-2 rounded-md text-base font-medium transition-colors"
            :class="[$route.path === '/business-card' ? 'bg-blue-50 text-blue-700' : 'text-gray-600 hover:bg-gray-50 hover:text-gray-900']"
            @click="closeMobileMenu"
          >
            Business Card
          </NuxtLink>
        </div>
        
        <!-- Mobile balance display -->
        <div class="px-5 py-3 border-t border-gray-200 bg-gray-50">
          <div class="flex items-center">
            <div class="flex-shrink-0 w-8 h-8 bg-blue-50 rounded-full flex items-center justify-center mr-2">
              <svg xmlns="http://www.w3.org/2000/svg" class="h-4 w-4 text-blue-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
            </div>
            <div>
              <p class="text-xs text-gray-500">Current Balance</p>
              <p class="text-sm font-medium" :class="[earnings >= 0 ? 'text-green-600' : 'text-red-600']">{{ formatCurrency(earnings) }}</p>
            </div>
          </div>
        </div>
      </div>
    </nav>

    <!-- Main Content -->
    <main class="max-w-7xl mx-auto py-6 sm:px-6 lg:px-8">
      <NuxtPage />
    </main>
    
    <!-- PWA Install Prompt -->
    <PWAInstall />
  </div>
</template>

<script setup>
import { ref, onMounted, watch } from 'vue'
import { formatCurrency } from '~/utils/currency'
import { useTransactions } from '~/composables/useTransactions'

const { earnings } = useTransactions()
const isBalanceHidden = ref(false)
const isMobileMenuOpen = ref(false)

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

onMounted(() => {
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
