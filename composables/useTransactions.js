import { ref, computed, onMounted, watch } from 'vue'
import { useRuntimeConfig } from 'nuxt/app'
import { useOfflineQueue } from './useOfflineQueue'
import { usePocketBase } from './usePocketBase'
import { useInventory } from './useInventory'
import { newRecordId } from '~/utils/inventory'
import { localDate, mergeTransactions, pendingQueueIds, recheckOrphans, unconfirmedCount, withRecordIds } from '~/utils/transactions'
import { clearLegacyApiCache } from '~/utils/legacyCaches'

const STORAGE_KEY = 'budget-tracker-transactions'
const SALE_DATE = /^\d{4}-\d{2}-\d{2}$/
const ORPHANS_KEY = 'budget-tracker-orphans'
const transactions = ref([])
// Local entries the server does not know and no queue item will create; the owner reviews them in Settings
const orphans = ref([])
// Keys of orphans whose upload is under way, so a double tap cannot post one twice
const uploadingOrphans = ref([])
// Record ids whose POST is in flight right now: neither on the server yet nor in the queue
const sending = new Set()
// The refresh under way, so callers (logout) can wait for it; a second call asks it to run again
let refreshRun = null
let refreshAgain = false
// Record ids from the last successful server list; null until one succeeded in this session
let lastServerIds = null
// Bumped whenever the local list or queue changes, so a refresh that started earlier is redone
let localVersion = 0
const isLoading = ref(false)
// Bumped on logout so a refresh that started before it never writes its answer back
let sessionGeneration = 0
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
    clearCompletedItems, 
    clearQueue,
    replaceQueue,
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
    const today = localDate() // Format: YYYY-MM-DD
    
    return transactions.value
      .filter(transaction => transaction.date === today)
      .reduce((sum, transaction) => sum + transaction.amount, 0)
  })

  const loadTransactions = () => {
    const stored = localStorage.getItem(STORAGE_KEY)
    if (stored) {
      transactions.value = JSON.parse(stored)
    }
    const storedOrphans = localStorage.getItem(ORPHANS_KEY)
    if (storedOrphans) {
      orphans.value = JSON.parse(storedOrphans)
    }
  }

  const saveOrphans = () => {
    localStorage.setItem(ORPHANS_KEY, JSON.stringify(orphans.value))
  }

  const orphanKey = entry => entry.recordId || entry.id

  // Replaces the local list with what the server holds, plus sales still waiting in the queue.
  // Offline or a failed request leaves the cached list untouched.
  const refreshTransactions = () => {
    if (refreshRun) {
      refreshAgain = true
      return refreshRun
    }
    if (!isOnline() || !pb.authStore.isValid) return Promise.resolve()
    refreshRun = runRefresh().finally(() => { refreshRun = null })
    return refreshRun
  }

  const runRefresh = async () => {
    do {
      refreshAgain = false
      const version = localVersion
      const session = sessionGeneration
      let server
      try {
        server = await pb.collection('budget_tracker_transactions').getFullList({ sort: 'created' })
      } catch {
        return
      }
      // Logged out while the request was out: never write the answer back to this device
      if (session !== sessionGeneration || !pb.authStore.isValid) return
      // A sale was added or synced while the request was out: its answer may predate it
      if (version !== localVersion) {
        refreshAgain = true
        continue
      }
      lastServerIds = new Set(server.map(record => record.id))
      const merged = mergeTransactions({ server, local: transactions.value, pending: pendingIds() })
      transactions.value = merged.transactions
      saveTransactions()
      // A stored orphan goes once its own record id is on the server; old-app ones stay for review
      const kept = recheckOrphans({ server, orphans: orphans.value })
      const known = new Set(orphans.value.map(orphanKey))
      const added = merged.orphans.filter(entry => !known.has(orphanKey(entry)))
      if (added.length || kept.length !== orphans.value.length) {
        orphans.value = [...kept, ...added]
        saveOrphans()
      }
    } while (refreshAgain)
  }

  // Queued sales by record id, and by local id for items from before record ids, plus sends in flight
  const pendingIds = () => [...pendingQueueIds(offlineQueue.value), ...sending]

  // Queue items from before record ids get one before they are sent, so a retry after a lost reply
  // is recognised instead of creating a second record. Their local entries take the same id, so the
  // server record replaces them once synced.
  const ensureQueueRecordIds = () => {
    const next = withRecordIds(offlineQueue.value, newRecordId)
    if (!next) return
    const assigned = new Map(next.filter((item, index) => item !== offlineQueue.value[index]).map(item => [item.id, item.recordId]))
    replaceQueue(next)
    transactions.value = transactions.value.map(entry =>
      !entry.recordId && assigned.has(entry.id) ? { ...entry, recordId: assigned.get(entry.id) } : entry
    )
    saveTransactions()
    localVersion++
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
        // date is the sale's local day, so a sale synced or uploaded later keeps it. The server only
        // accepts YYYY-MM-DD there; anything else (very old entries) falls back to the created day.
        body: JSON.stringify({
          id: data.recordId,
          description: data.description,
          amount: data.amount,
          notes: data.notes || '',
          date: SALE_DATE.test(data.date || '') ? data.date : undefined
        })
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
    if (isSyncing.value || !isOnline()) return
    if (offlineQueue.value.length === 0) {
      await refreshTransactions()
      return
    }
    
    ensureQueueRecordIds()
    const result = await processQueue(item => postTransaction(item))
    localVersion++
    await refreshTransactions()
    return result
  }

  const addTransaction = async (transaction) => {
    const newTransaction = {
      id: Date.now(),
      ...transaction,
      // Sent as the PocketBase record id and kept in the queue, so a retry can tell it already exists
      recordId: newRecordId(),
      amount: Number(transaction.amount),
      date: transaction.date || localDate()
    }
    
    // Add to local state first
    // Stock movements travel with the queued transaction but are not part of the local history
    const { stockMovements, ...historyEntry } = newTransaction
    transactions.value = [...transactions.value, historyEntry]
    saveTransactions()
    sending.add(newTransaction.recordId)
    localVersion++
    
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
      // Any failure queues the sale, also when the connection dropped mid-send (offline by now).
      // The record id makes the retry safe if the server stored it after all.
      if (!offlineQueue.value.some(item => item.recordId === newTransaction.recordId)) {
        addToQueue(newTransaction)
      }
      // Error already handled in sendToPocketbase
    } finally {
      sending.delete(newTransaction.recordId)
      localVersion++
    }
    // The server's copy replaces the local one, so a sale shows up once everywhere
    refreshTransactions()
  }

  // Re-adds an orphan through the normal path (fresh record id, queued if offline). It leaves the
  // orphan list before the request starts, so a second tap finds nothing left to upload.
  // addTransaction keeps it in the local list straight away and queues it if the send fails.
  const uploadOrphan = async (entry) => {
    const key = orphanKey(entry)
    if (uploadingOrphans.value.includes(key) || !orphans.value.some(item => orphanKey(item) === key)) return
    uploadingOrphans.value = [...uploadingOrphans.value, key]
    discardOrphan(entry)
    try {
      await addTransaction({ description: entry.description, amount: entry.amount, notes: entry.notes || '', date: entry.date })
    } finally {
      uploadingOrphans.value = uploadingOrphans.value.filter(item => item !== key)
    }
  }

  const isUploadingOrphan = entry => uploadingOrphans.value.includes(orphanKey(entry))

  const discardOrphan = (entry) => {
    orphans.value = orphans.value.filter(item => orphanKey(item) !== orphanKey(entry))
    saveOrphans()
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
        // Syncing the queue ends with a refresh; with an empty queue it refreshes on its own
        syncTransactionsQueue()
      })
      document.addEventListener('visibilitychange', () => {
        if (document.visibilityState === 'visible') refreshTransactions()
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
      refreshTransactions()
    }
  })

  const clearApiError = () => {
    apiError.value = ''
  }

  // Logging out must not leave customer names and takings readable on the device. Sales that
  // have not reached the server yet stay queued (they hold no server data) and sync after the next login.
  // "Clear All Local Data" passes keepQueue: false and drops those as well.
  const forgetLocalData = ({ keepQueue = true } = {}) => {
    sessionGeneration++
    lastServerIds = null
    transactions.value = []
    orphans.value = []
    localStorage.removeItem(STORAGE_KEY)
    localStorage.removeItem(ORPHANS_KEY)
    if (keepQueue) {
      clearCompletedItems()
    } else {
      clearQueue()
    }
    clearLegacyApiCache()
  }

  // Entries that exist on this device only: orphans, sales still waiting to sync, and listed entries
  // the server has not confirmed. Refreshes first (a failure just leaves the last known state).
  const countLocalOnly = async () => {
    // A stalled connection must not keep the owner from logging out: after 5 s count from what is known
    const timeout = new Promise(resolve => setTimeout(resolve, 5000))
    try {
      await Promise.race([refreshTransactions(), timeout])
    } catch {
      // Offline or unreachable: count against what is known
    }
    return orphans.value.length +
      offlineQueue.value.filter(item => item.status !== 'synced').length +
      unconfirmedCount({ transactions: transactions.value, serverIds: lastServerIds, pending: pendingIds() })
  }

  return {
    transactions,
    orphans,
    refreshTransactions,
    forgetLocalData,
    uploadOrphan,
    isUploadingOrphan,
    discardOrphan,
    countLocalOnly,
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