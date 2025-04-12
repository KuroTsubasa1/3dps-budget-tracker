import { ref, computed, onMounted, watch } from 'vue'
import { useRuntimeConfig } from 'nuxt/app'
import { useOfflineQueue } from './useOfflineQueue'

const STORAGE_KEY = 'budget-tracker-transactions'
const transactions = ref([])
const isLoading = ref(false)
const apiError = ref('')
const syncStatus = ref({ 
  lastSync: null, 
  pendingSync: 0,
  isOnline: true
})

export const useTransactions = () => {
  const config = useRuntimeConfig()
  const API_BASE_URL = config.public.apiBaseUrl
  const API_ENDPOINT = config.public.apiEndpoint
  const API_TOKEN = config.public.apiToken
  
  const { 
    offlineQueue, 
    addToQueue, 
    processQueue, 
    isSyncing, 
    syncStatus: queueSyncStatus,
    isOnline 
  } = useOfflineQueue()

  // Update sync status when queue changes
  watch(offlineQueue, (newQueue) => {
    syncStatus.value.pendingSync = newQueue.filter(item => item.status === 'pending').length
  }, { immediate: true, deep: true })

  // Update online status
  watch(isOnline, (online) => {
    syncStatus.value.isOnline = online
    if (online && syncStatus.value.pendingSync > 0) {
      syncTransactionsQueue()
    }
  }, { immediate: true })

  // Calculate all-time earnings/balance
  const earnings = computed(() => 
    transactions.value.reduce((sum, transaction) => sum + transaction.amount, 0)
  )
  
  // Calculate today's earnings/balance
  const todayEarnings = computed(() => {
    const today = new Date().toISOString().split('T')[0] // Format: YYYY-MM-DD
    
    return transactions.value
      .filter(transaction => transaction.date === today)
      .reduce((sum, transaction) => sum + transaction.amount, 0)
  })

  const loadTransactions = () => {
    const stored = localStorage.getItem(STORAGE_KEY)
    if (stored) {
      transactions.value = JSON.parse(stored)
    }
  }

  const saveTransactions = () => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(transactions.value))
  }

  const sendToPocketbase = async (transactionData) => {
    isLoading.value = true
    apiError.value = ''
    
    try {
      // Check if online first
      if (!isOnline()) {
        throw new Error('You are offline. Transaction saved locally and will sync when online.')
      }
      
      const fullUrl = `${API_BASE_URL}${API_ENDPOINT}`
      const response = await fetch(fullUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-token': API_TOKEN
        },
        body: JSON.stringify({
          description: transactionData.description,
          amount: transactionData.amount,
          notes: transactionData.notes || '',
          token: API_TOKEN
        })
      })
      
      if (!response.ok) {
        throw new Error(`API error: ${response.status}`)
      }
      
      syncStatus.value.lastSync = new Date().toISOString()
      return await response.json()
    } catch (error) {
      console.error('Failed to send transaction to API:', error)
      
      // Different message for offline vs other errors
      if (!isOnline()) {
        apiError.value = 'You are offline. Transaction saved locally and will sync when online.'
      } else {
        apiError.value = 'Failed to save transaction to server'
      }
      
      throw error
    } finally {
      isLoading.value = false
    }
  }

  const syncTransactionsQueue = async () => {
    if (isSyncing.value || !isOnline() || offlineQueue.value.length === 0) {
      return
    }
    
    return await processQueue(async (item) => {
      const fullUrl = `${API_BASE_URL}${API_ENDPOINT}`
      const response = await fetch(fullUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-token': API_TOKEN
        },
        body: JSON.stringify({
          description: item.description,
          amount: item.amount,
          notes: item.notes || '',
          token: API_TOKEN
        })
      })
      
      if (!response.ok) {
        throw new Error(`API error: ${response.status}`)
      }
      
      return await response.json()
    })
  }

  const addTransaction = async (transaction) => {
    const newTransaction = {
      id: Date.now(),
      ...transaction,
      amount: Number(transaction.amount)
    }
    
    // Add to local state first
    transactions.value = [...transactions.value, newTransaction]
    saveTransactions()
    
    // Then try to send to PocketBase
    try {
      if (isOnline()) {
        await sendToPocketbase(newTransaction)
      } else {
        // If offline, add to queue
        addToQueue(newTransaction)
        apiError.value = 'You are offline. Transaction saved locally and will sync when online.'
      }
    } catch (error) {
      // If online but error occurred, add to queue
      if (isOnline()) {
        addToQueue(newTransaction)
      }
      // Error already handled in sendToPocketbase
    }
  }

  // Set up auto-sync
  const setupAutoSync = () => {
    // Try to sync on mount
    if (isOnline() && offlineQueue.value.length > 0) {
      syncTransactionsQueue()
    }
    
    // Set up interval to check for pending transactions while online
    const checkInterval = setInterval(() => {
      if (isOnline() && offlineQueue.value.length > 0 && !isSyncing.value) {
        syncTransactionsQueue()
      }
    }, 60000) // Check every minute
    
    // Clean up interval on unmount
    return () => {
      clearInterval(checkInterval)
    }
  }

  onMounted(() => {
    loadTransactions()
    setupAutoSync()
  })

  const clearApiError = () => {
    apiError.value = ''
  }

  return {
    transactions,
    earnings,
    todayEarnings,
    addTransaction,
    isLoading,
    apiError,
    clearApiError,
    syncStatus,
    syncTransactionsQueue,
    queueSyncStatus,
    pendingTransactions: computed(() => offlineQueue.value.filter(t => t.status === 'pending'))
  }
}