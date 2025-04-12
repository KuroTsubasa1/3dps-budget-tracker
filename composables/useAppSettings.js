import { ref, onMounted, watch } from 'vue'
import { useRuntimeConfig } from 'nuxt/app'

const SETTINGS_STORAGE_KEY = 'budget-tracker-settings'

// Default settings
const defaultSettings = {
  account: {
    displayName: '',
    email: '',
    profileImage: null
  },
  api: {
    baseUrl: '',
    endpoint: '',
    token: ''
  },
  display: {
    currencyFormat: 'EUR',
    dateFormat: 'DD/MM/YYYY',
    darkMode: false,
    showHeaderBalance: true
  },
  notifications: {
    pushEnabled: true,
    newTransactions: true,
    syncCompleted: true,
    balanceUpdates: false
  }
}

// Create reactive refs for settings
const accountSettings = ref({...defaultSettings.account})
const apiSettings = ref({...defaultSettings.api})
const displaySettings = ref({...defaultSettings.display})
const notificationSettings = ref({...defaultSettings.notifications})

// Status indicators
const isSaving = ref(false)
const lastSaved = ref(null)
const saveError = ref('')

export const useAppSettings = () => {
  const config = useRuntimeConfig()
  
  // Load settings from localStorage
  const loadSettings = () => {
    try {
      const stored = localStorage.getItem(SETTINGS_STORAGE_KEY)
      if (stored) {
        const parsed = JSON.parse(stored)
        
        // Merge stored settings with defaults to ensure all properties exist
        accountSettings.value = { ...defaultSettings.account, ...parsed.account }
        apiSettings.value = { ...defaultSettings.api, ...parsed.api }
        displaySettings.value = { ...defaultSettings.display, ...parsed.display }
        notificationSettings.value = { ...defaultSettings.notifications, ...parsed.notifications }
      } else {
        // If no stored settings, use environment values for API settings
        apiSettings.value = {
          baseUrl: config.public.apiBaseUrl,
          endpoint: config.public.apiEndpoint,
          token: config.public.apiToken
        }
      }
    } catch (error) {
      console.error('Failed to load settings:', error)
      saveError.value = 'Failed to load settings'
    }
  }
  
  // Save all settings to localStorage
  const saveSettings = () => {
    try {
      isSaving.value = true
      saveError.value = ''
      
      const settings = {
        account: accountSettings.value,
        api: apiSettings.value,
        display: displaySettings.value,
        notifications: notificationSettings.value
      }
      
      localStorage.setItem(SETTINGS_STORAGE_KEY, JSON.stringify(settings))
      lastSaved.value = new Date().toISOString()
      return true
    } catch (error) {
      console.error('Failed to save settings:', error)
      saveError.value = 'Failed to save settings'
      return false
    } finally {
      isSaving.value = false
    }
  }
  
  // Individual setting category save functions
  const saveAccountSettings = () => {
    return saveSettings()
  }
  
  const saveApiSettings = () => {
    // Update runtime config values
    config.public.apiBaseUrl = apiSettings.value.baseUrl
    config.public.apiEndpoint = apiSettings.value.endpoint
    config.public.apiToken = apiSettings.value.token
    
    return saveSettings()
  }
  
  const saveDisplaySettings = () => {
    // Apply dark mode if changed
    if (displaySettings.value.darkMode) {
      document.documentElement.classList.add('dark')
    } else {
      document.documentElement.classList.remove('dark')
    }
    
    return saveSettings()
  }
  
  const saveNotificationSettings = () => {
    // If push notifications enabled, request permission
    if (notificationSettings.value.pushEnabled && 'Notification' in window) {
      Notification.requestPermission()
    }
    
    return saveSettings()
  }
  
  // Export data
  const exportData = async (format) => {
    try {
      // Get all data for export
      const transactions = JSON.parse(localStorage.getItem('budget-tracker-transactions') || '[]')
      const settings = JSON.parse(localStorage.getItem(SETTINGS_STORAGE_KEY) || '{}')
      const offlineQueue = JSON.parse(localStorage.getItem('budget-tracker-offline-queue') || '[]')
      
      const exportData = {
        transactions,
        settings,
        offlineQueue,
        exportedAt: new Date().toISOString()
      }
      
      // Create appropriate format
      let dataStr
      let filename
      
      if (format === 'json') {
        dataStr = JSON.stringify(exportData, null, 2)
        filename = `budget-tracker-export-${new Date().toISOString().slice(0, 10)}.json`
        
        // Create download link
        const dataBlob = new Blob([dataStr], { type: 'application/json' })
        const url = URL.createObjectURL(dataBlob)
        
        // Create and trigger download
        const a = document.createElement('a')
        a.href = url
        a.download = filename
        document.body.appendChild(a)
        a.click()
        document.body.removeChild(a)
        URL.revokeObjectURL(url)
        
        return { success: true, format, filename }
      } else if (format === 'csv') {
        // For CSV, just export transactions
        const csvHeader = 'ID,Description,Amount,Date,Notes\n'
        const csvRows = transactions.map(t => 
          `${t.id},"${t.description.replace(/"/g, '""')}",${t.amount},"${t.date}","${(t.notes || '').replace(/"/g, '""')}"`
        ).join('\n')
        
        dataStr = csvHeader + csvRows
        filename = `budget-tracker-transactions-${new Date().toISOString().slice(0, 10)}.csv`
        
        // Create download link
        const dataBlob = new Blob([dataStr], { type: 'text/csv' })
        const url = URL.createObjectURL(dataBlob)
        
        // Create and trigger download
        const a = document.createElement('a')
        a.href = url
        a.download = filename
        document.body.appendChild(a)
        a.click()
        document.body.removeChild(a)
        URL.revokeObjectURL(url)
        
        return { success: true, format, filename }
      }
      
      return { success: false, error: 'Unsupported format' }
    } catch (error) {
      console.error('Failed to export data:', error)
      return { success: false, error: error.message }
    }
  }
  
  // Clear all local data
  const clearAllData = () => {
    try {
      // Clear all localStorage items
      localStorage.removeItem('budget-tracker-transactions')
      localStorage.removeItem('budget-tracker-offline-queue')
      localStorage.removeItem(SETTINGS_STORAGE_KEY)
      
      // Reset settings to defaults
      accountSettings.value = {...defaultSettings.account}
      apiSettings.value = {
        baseUrl: config.public.apiBaseUrl,
        endpoint: config.public.apiEndpoint,
        token: config.public.apiToken
      }
      displaySettings.value = {...defaultSettings.display}
      notificationSettings.value = {...defaultSettings.notifications}
      
      return true
    } catch (error) {
      console.error('Failed to clear data:', error)
      return false
    }
  }
  
  // Apply dark mode from settings
  const applyTheme = () => {
    if (displaySettings.darkMode) {
      document.documentElement.classList.add('dark')
    } else {
      document.documentElement.classList.remove('dark')
    }
  }
  
  // Initialize settings on mount
  onMounted(() => {
    loadSettings()
    applyTheme()
  })
  
  // Watch for dark mode changes
  watch(() => displaySettings.darkMode, (newVal) => {
    if (newVal) {
      document.documentElement.classList.add('dark')
    } else {
      document.documentElement.classList.remove('dark')
    }
  })
  
  return {
    // Settings data
    accountSettings,
    apiSettings,
    displaySettings,
    notificationSettings,
    
    // Status
    isSaving,
    lastSaved,
    saveError,
    
    // Functions
    loadSettings,
    saveSettings,
    saveAccountSettings,
    saveApiSettings,
    saveDisplaySettings,
    saveNotificationSettings,
    exportData,
    clearAllData
  }
}