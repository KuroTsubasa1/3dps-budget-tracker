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
import { ref } from 'vue'
import { usePWA } from '~/composables/usePWA'

const { isInstallable, isInstalled, installApp: triggerInstall, updateAvailable, updateApp } = usePWA()
const showInstallPrompt = ref(true)

const installApp = async () => {
  await triggerInstall()
  showInstallPrompt.value = false
}

const dismissInstall = () => {
  showInstallPrompt.value = false
}
</script>