<template>
  <div>
    <div v-if="updateAvailable" class="fixed bottom-4 right-4 z-50">
      <div class="bg-amber-50 border border-amber-200 shadow-lg rounded-lg p-4 w-64">
        <h3 class="font-medium text-amber-800">Update Available</h3>
        <p class="text-amber-600 text-sm mb-3">A new version of the app is available.</p>
        <button @click="updateApp" class="bg-amber-500 hover:bg-amber-600 text-white text-sm py-1 px-3 rounded-lg transition-colors">
          Update Now
        </button>
      </div>
    </div>
    
    <div v-if="isInstallable && !isInstalled" class="fixed bottom-4 left-4 z-50">
      <div class="bg-blue-50 border border-blue-200 shadow-lg rounded-lg p-4 w-64">
        <h3 class="font-medium text-blue-800">Install App</h3>
        <p class="text-blue-600 text-sm mb-3">Install this app on your device for a better experience.</p>
        <div class="flex space-x-2">
          <button @click="installApp" class="bg-blue-500 hover:bg-blue-600 text-white text-sm py-1 px-3 rounded-lg transition-colors">
            Install
          </button>
          <button @click="dismissInstall" class="bg-gray-200 hover:bg-gray-300 text-gray-800 text-sm py-1 px-3 rounded-lg transition-colors">
            Not Now
          </button>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, onMounted } from 'vue'

// Manually handle PWA installation without the Vite PWA imports
const updateAvailable = ref(false)
const isOfflineReady = ref(false)

// Function to update the service worker
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

// Track PWA installation state
const isInstalled = ref(false)
const isInstallable = ref(false)
const deferredPrompt = ref(null)
const showInstallPrompt = ref(true)

// Called when the PWA is installed
const installApp = async () => {
  if (!deferredPrompt.value) return
  
  // Show the install prompt
  deferredPrompt.value.prompt()
  
  // Wait for the user to respond to the prompt
  const { outcome } = await deferredPrompt.value.userChoice
  
  // Reset the deferred prompt variable
  deferredPrompt.value = null
  isInstallable.value = false
  showInstallPrompt.value = false
  
  if (outcome === 'accepted') {
    isInstalled.value = true
  }
}

// Hide the install prompt without installing
const dismissInstall = () => {
  showInstallPrompt.value = false
}

// Check if the app is already installed
const checkAppInstalled = () => {
  if (typeof window !== 'undefined' && 
    (window.matchMedia('(display-mode: standalone)').matches || 
     window.navigator.standalone === true)) {
    isInstalled.value = true
  }
}

// Set up event listeners for PWA
onMounted(() => {
  // Check for service worker support
  if ('serviceWorker' in navigator) {
    // Listen for service worker updates
    navigator.serviceWorker.addEventListener('controllerchange', () => {
      updateAvailable.value = true
    })
  }

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
})
</script>