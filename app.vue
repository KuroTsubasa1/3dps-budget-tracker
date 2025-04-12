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
            <div class="nav-balance transition-all duration-300" :class="{ 'opacity-0': isBalanceHidden, 'opacity-100': !isBalanceHidden }">
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
import { ref, onMounted } from 'vue'
import { formatCurrency } from '~/utils/currency'
import { useTransactions } from '~/composables/useTransactions'

const { earnings } = useTransactions()
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
</script>
