import { ref, computed, onMounted } from 'vue'

const STORAGE_KEY = 'budget-tracker-transactions'
const API_ENDPOINT = 'https://pocket.lasseharm.space/api/collections/budget_tracker_transactions/records'
const API_TOKEN = 'dcsadcsdqwre23i234523obeigvdo3'
const transactions = ref([])
const isLoading = ref(false)
const apiError = ref('')

export const useTransactions = () => {

  const earnings = computed(() => 
    transactions.value.reduce((sum, transaction) => sum + transaction.amount, 0)
  )

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
      const response = await fetch(API_ENDPOINT, {
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
      
      return await response.json()
    } catch (error) {
      console.error('Failed to send transaction to API:', error)
      apiError.value = 'Failed to save transaction to server'
      throw error
    } finally {
      isLoading.value = false
    }
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
      await sendToPocketbase(newTransaction)
    } catch (error) {
      // Already logged in sendToPocketbase
      // Continue anyway since we've saved locally
    }
  }

  onMounted(() => {
    loadTransactions()
  })

  return {
    transactions,
    earnings,
    addTransaction,
    isLoading,
    apiError
  }
}