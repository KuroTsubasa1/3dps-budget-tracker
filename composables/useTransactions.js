import { ref, computed, onMounted, watch } from 'vue'
import { useRuntimeConfig } from 'nuxt/app'
import { useOfflineQueue } from './useOfflineQueue'
import { usePocketBase } from './usePocketBase'
import { useInventory } from './useInventory'
import { newRecordId } from '~/utils/inventory'

const STORAGE_KEY = 'budget-tracker-transactions'
const transactions = ref([])
const isLoading = ref(false)
const apiError = ref('')
let autoSyncStarted = false
let networkListening = false
const syncStatus = ref({ 
  lastSync: null, 
  pendingSync: 0,
  isOnline: true
})

export const useTransactions = () => {
  const config = useRuntimeConfig()
  const API_BASE_URL = config.public.apiBaseUrl
  const API_ENDPOINT = config.public.apiEndpoint
  const pb = usePocketBase()
  const { applyMovements } = useInventory()
  
  const { 
    offlineQueue, 
    addToQueue, 
    processQueue, 
    isSyncing, 
    syncStatus: queueSyncStatus,
    isOnline 
  } = useOfflineQueue()

  // Update sync status when queue changes
  // Failed items are retried, so they still count as pending
  watch(offlineQueue, (newQueue) => {
    syncStatus.value.pendingSync = newQueue.filter(item => item.status !== 'synced').length
  }, { immediate: true, deep: true })

  // isOnline is a plain function, not a ref: the window online/offline events registered in
  // setupAutoSync keep this flag current and sync the queue when the connection returns
  syncStatus.value.isOnline = isOnline()

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

  // The owner's session token replaces the shared x-token; PocketBase rules check @request.auth.
  // txSynced survives in the offline queue so a retry never posts the same transaction twice;
  // stock movements are idempotent by id, so they are simply replayed. The client record id
  // covers a lost reply: PocketBase rejects the repeated id with a 400 naming data.id.
  const postTransaction = async (data) => {
    // PocketBase 0.22 answers an expired token as a guest (400/404), so check the session first
    if (!pb.authStore.isValid) {
      const error = new Error('Session expired')
      error.status = 401
      throw error
    }
    let record = null
    if (!data.txSynced) {
      const response = await fetch(`${API_BASE_URL}${API_ENDPOINT}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: pb.authStore.token },
        body: JSON.stringify({ id: data.recordId, description: data.description, amount: data.amount, notes: data.notes || '' })
      })
      const body = await response.json().catch(() => null)
      const alreadyCreated = response.status === 400 && !!data.recordId && !!body?.data?.id
      if (!response.ok && !alreadyCreated) {
        const error = new Error(`API error: ${response.status}`)
        error.status = response.status
        throw error
      }
      data.txSynced = true
      record = response.ok ? body : null
    }
    if (data.stockMovements?.length) await applyMovements(data.stockMovements)
    return record
  }

  const sendToPocketbase = async (transactionData) => {
    isLoading.value = true
    apiError.value = ''
    
    try {
      // Check if online first
      if (!isOnline()) {
        throw new Error('You are offline. Transaction saved locally and will sync when online.')
      }
      
      const record = await postTransaction(transactionData)
      syncStatus.value.lastSync = new Date().toISOString()
      return record
    } catch (error) {
      console.error('Failed to send transaction to API:', error)
      
      // Different message for offline vs other errors
      if (!isOnline()) {
        apiError.value = 'You are offline. Transaction saved locally and will sync when online.'
      } else if (error.status === 401 || error.status === 403 || !pb.authStore.isValid) {
        apiError.value = 'Your session has expired. Log in again to sync - Transaction saved locally.'
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
    
    return await processQueue(item => postTransaction(item))
  }

  const addTransaction = async (transaction) => {
    const newTransaction = {
      id: Date.now(),
      ...transaction,
      // Sent as the PocketBase record id and kept in the queue, so a retry can tell it already exists
      recordId: newRecordId(),
      amount: Number(transaction.amount)
    }
    
    // Add to local state first
    // Stock movements travel with the queued transaction but are not part of the local history
    const { stockMovements, ...historyEntry } = newTransaction
    transactions.value = [...transactions.value, historyEntry]
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
    
    // Once per app: sync as soon as the connection comes back
    if (!networkListening) {
      networkListening = true
      window.addEventListener('online', () => {
        syncStatus.value.isOnline = true
        syncTransactionsQueue()
      })
      window.addEventListener('offline', () => {
        syncStatus.value.isOnline = false
      })
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
    // Auto-sync is app-wide: later components using this composable must not restart it
    if (!autoSyncStarted) {
      autoSyncStarted = true
      setupAutoSync()
    }
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
    pendingTransactions: computed(() => offlineQueue.value.filter(t => t.status !== 'synced'))
  }
}