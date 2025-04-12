import { ref, onMounted } from 'vue'

export const usePWA = () => {
  const isInstallable = ref(false)
  const isInstalled = ref(false)
  const deferredPrompt = ref(null)
  const updateAvailable = ref(false)
  
  const installApp = async () => {
    if (!deferredPrompt.value) {
      return false
    }
    
    // Show the install prompt
    deferredPrompt.value.prompt()
    
    // Wait for the user to respond to the prompt
    const choiceResult = await deferredPrompt.value.userChoice
    
    // Reset the deferred prompt variable
    deferredPrompt.value = null
    isInstallable.value = false
    
    // Check if the user accepted the prompt
    return choiceResult.outcome === 'accepted'
  }
  
  const checkAppInstalled = () => {
    // Check if the app is already installed
    if (window.matchMedia('(display-mode: standalone)').matches ||
        window.navigator.standalone === true) {
      isInstalled.value = true
    }
  }
  
  // Call when an update is detected
  const updateApp = () => {
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.getRegistrations().then(registrations => {
        for (const registration of registrations) {
          registration.update()
        }
      })
    }
    updateAvailable.value = false
  }
  
  onMounted(() => {
    // Listen for beforeinstallprompt event to detect if app is installable
    window.addEventListener('beforeinstallprompt', (e) => {
      // Prevent the mini-infobar from appearing on mobile
      e.preventDefault()
      
      // Store the event so it can be triggered later
      deferredPrompt.value = e
      isInstallable.value = true
    })
    
    // Listen for app installed event
    window.addEventListener('appinstalled', () => {
      isInstalled.value = true
      isInstallable.value = false
      deferredPrompt.value = null
    })
    
    // Check if the app is already installed
    checkAppInstalled()
    
    // Service worker update handling
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.addEventListener('controllerchange', () => {
        updateAvailable.value = true
      })
    }
  })
  
  return {
    isInstallable,
    isInstalled,
    installApp,
    updateAvailable,
    updateApp
  }
}