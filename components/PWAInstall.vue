<template>
  <div v-if="updateAvailable || (isInstallable && !isInstalled && showInstallPrompt)" class="pointer-events-auto flex w-full max-w-sm flex-col gap-2">
    <div v-if="updateAvailable" class="rounded-xl border border-line bg-card p-4 shadow-lg">
      <h3 class="text-sm font-semibold text-ink">Update Available</h3>
      <p class="mb-3 text-sm text-ink-muted">A new version of the app is available.</p>
      <button type="button" class="btn btn-primary" @click="updateApp">Update Now</button>
    </div>

    <div v-if="isInstallable && !isInstalled && showInstallPrompt" class="rounded-xl border border-line bg-card p-4 shadow-lg">
      <h3 class="text-sm font-semibold text-ink">Install App</h3>
      <p class="mb-3 text-sm text-ink-muted">Install this app on your device for a better experience.</p>
      <div class="flex gap-2">
        <button type="button" class="btn btn-primary" @click="installApp">Install</button>
        <button type="button" class="btn btn-ghost" @click="dismissInstall">Not Now</button>
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
    // The first install also fires controllerchange; only a replaced worker is an update
    const hadController = !!navigator.serviceWorker.controller
    navigator.serviceWorker.addEventListener('controllerchange', () => {
      if (hadController) updateAvailable.value = true
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