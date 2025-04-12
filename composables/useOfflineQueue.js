import { ref, onMounted } from 'vue'

const QUEUE_STORAGE_KEY = 'budget-tracker-offline-queue'
const offlineQueue = ref([])
const isSyncing = ref(false)
const syncStatus = ref('idle') // 'idle', 'syncing', 'success', 'error'

export const useOfflineQueue = () => {
  
  // Load saved queue from local storage
  const loadQueue = () => {
    const stored = localStorage.getItem(QUEUE_STORAGE_KEY)
    if (stored) {
      offlineQueue.value = JSON.parse(stored)
    }
  }

  // Save queue to local storage
  const saveQueue = () => {
    localStorage.setItem(QUEUE_STORAGE_KEY, JSON.stringify(offlineQueue.value))
  }

  // Add transaction to queue
  const addToQueue = (transaction) => {
    offlineQueue.value.push({
      ...transaction,
      queuedAt: new Date().toISOString(),
      status: 'pending' // 'pending', 'synced', 'failed'
    })
    saveQueue()
    return offlineQueue.value.length
  }

  // Check network status
  const isOnline = () => {
    return navigator && navigator.onLine
  }

  // Process the queue if online
  const processQueue = async (apiHandler) => {
    if (!isOnline() || offlineQueue.value.length === 0 || isSyncing.value) {
      return { processed: 0, remaining: offlineQueue.value.length }
    }

    try {
      isSyncing.value = true
      syncStatus.value = 'syncing'
      
      let processed = 0
      const newQueue = [...offlineQueue.value]
      
      for (let i = 0; i < newQueue.length; i++) {
        const item = newQueue[i]
        
        if (item.status === 'pending') {
          try {
            await apiHandler(item)
            newQueue[i] = { ...item, status: 'synced', syncedAt: new Date().toISOString() }
            processed++
          } catch (error) {
            console.error('Failed to sync item:', error)
            newQueue[i] = { ...item, status: 'failed', lastError: error.message }
          }
        }
      }
      
      offlineQueue.value = newQueue.filter(item => item.status !== 'synced')
      saveQueue()
      
      syncStatus.value = 'success'
      return { processed, remaining: offlineQueue.value.length }
    } catch (error) {
      console.error('Error processing queue:', error)
      syncStatus.value = 'error'
      return { processed: 0, remaining: offlineQueue.value.length, error: error.message }
    } finally {
      isSyncing.value = false
    }
  }

  // Clear completed items from queue
  const clearCompletedItems = () => {
    offlineQueue.value = offlineQueue.value.filter(item => item.status !== 'synced')
    saveQueue()
  }

  // Set up network status event listeners
  onMounted(() => {
    loadQueue()
    
    // Set up network event listeners
    if (typeof window !== 'undefined') {
      window.addEventListener('online', () => {
        console.log('App is online. Queue will process automatically.')
      })
      
      window.addEventListener('offline', () => {
        console.log('App is offline. Transactions will be queued.')
      })
    }
  })

  return {
    offlineQueue,
    isSyncing,
    syncStatus,
    addToQueue,
    processQueue,
    clearCompletedItems,
    isOnline
  }
}