import { ref, computed, onMounted } from 'vue'

const STORAGE_KEY = 'budget-tracker-transactions'
const transactions = ref([])

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

  const addTransaction = (transaction) => {
    transactions.value = [...transactions.value, {
      id: Date.now(),
      ...transaction,
      amount: Number(transaction.amount)
    }]
    saveTransactions()
  }

  onMounted(() => {
    loadTransactions()
  })

  return {
    transactions,
    earnings,
    addTransaction
  }
}