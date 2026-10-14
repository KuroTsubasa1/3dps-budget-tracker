import { ref, onMounted } from 'vue'

const QUEUE_STORAGE_KEY = 'budget-tracker-offline-queue'
const offlineQueue = ref([])
const isSyncing = ref(false)
const syncStatus = ref('idle') // 'idle', 'syncing', 'success', 'error'

// Identifies a queued item across copies (loadQueue re-parses the queue from storage)
const queueKey = item => `${item.id}:${item.queuedAt}`

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
      // Outcome per item: true when synced, otherwise the error message
      const outcomes = new Map()

      for (const item of [...offlineQueue.value]) {
        // A failed item is retried on every sync until it succeeds; lastError keeps the latest reason
        if (item.status === 'pending' || item.status === 'failed') {
          try {
            await apiHandler(item)
            outcomes.set(queueKey(item), true)
            processed++
          } catch (error) {
            console.error('Failed to sync item:', error)
            outcomes.set(queueKey(item), error.message)
          }
        }
      }

      // Merge into the live queue rather than replacing it: sales queued while this sync
      // was running are not in the snapshot above and must survive untouched
      offlineQueue.value = offlineQueue.value.flatMap((item) => {
        const outcome = outcomes.get(queueKey(item))
        if (outcome === true) return []
        return outcome === undefined ? [item] : [{ ...item, status: 'failed', lastError: outcome }]
      })
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

  // Drops every queued sale, synced or not ("Clear All Local Data")
  const clearQueue = () => {
    offlineQueue.value = []
    localStorage.removeItem(QUEUE_STORAGE_KEY)
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
    clearQueue,
    isOnline
  }
}