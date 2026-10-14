<template>
  <div class="min-h-screen">
    <NuxtPwaManifest />
    <AppSideNav v-if="!chromeless" />
    <div :class="{ 'md:pl-20 lg:pl-60': !chromeless }">
      <AppTopBar v-if="!chromeless" />
      <main class="mx-auto max-w-6xl px-4 pt-4 md:px-6 md:pt-6" :class="chromeless ? 'pb-10' : 'pb-nav md:pb-10'">
        <NuxtPage />
      </main>
    </div>
    <AppBottomNav v-if="!chromeless" />
    <ToastHost>
      <PWAInstall />
    </ToastHost>
  </div>
</template>

<script setup>
import { computed, onMounted, watch } from 'vue'
import { useAppSettings } from '~/composables/useAppSettings'
import { useAuth } from '~/composables/useAuth'
import { useTransactions } from '~/composables/useTransactions'
import { useToast } from '~/composables/useToast'

const route = useRoute()
const chromeless = computed(() => !!route.meta.chromeless)

const { displaySettings } = useAppSettings()
const { restoreSession } = useAuth()
const { apiError, clearApiError } = useTransactions()
const { toast } = useToast()
const isDark = computed(() => !!displaySettings.value.darkMode)

useHead({
  meta: [{ name: 'theme-color', content: computed(() => (isDark.value ? '#111827' : '#2563eb')) }]
})

// The one place sync problems are shown, so catalog sales report them too (the form may be closed)
watch(apiError, (message) => {
  if (!message) return
  toast(message.includes('saved locally') ? message : `${message} - Transaction saved locally.`, { tone: 'warning', duration: 6000 })
  clearApiError()
}, { immediate: true })

onMounted(() => {
  // useAppSettings loads stored settings in its own onMounted, registered before this one
  watch(isDark, dark => document.documentElement.classList.toggle('dark', dark), { immediate: true })
  restoreSession()
  document.documentElement.dataset.hydrated = ''
})
</script>
