<template>
  <div class="min-h-screen">
    <AppSideNav />
    <div class="md:pl-20 lg:pl-60">
      <AppTopBar />
      <main class="mx-auto max-w-6xl px-4 pb-nav pt-4 md:px-6 md:pb-10 md:pt-6">
        <NuxtPage />
      </main>
    </div>
    <AppBottomNav />
    <ToastHost>
      <PWAInstall />
    </ToastHost>
  </div>
</template>

<script setup>
import { computed, onMounted, watch } from 'vue'
import { useAppSettings } from '~/composables/useAppSettings'

const { displaySettings } = useAppSettings()
const isDark = computed(() => !!displaySettings.value.darkMode)

useHead({
  meta: [{ name: 'theme-color', content: computed(() => (isDark.value ? '#111827' : '#ffffff')) }]
})

onMounted(() => {
  // useAppSettings loads stored settings in its own onMounted, registered before this one
  watch(isDark, dark => document.documentElement.classList.toggle('dark', dark), { immediate: true })
  document.documentElement.dataset.hydrated = ''
})
</script>
