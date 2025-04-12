// https://nuxt.com/docs/api/configuration/nuxt-config
export default defineNuxtConfig({
  compatibilityDate: '2024-11-01',
  devtools: { enabled: true },
  modules: [
    '@nuxtjs/tailwindcss'
  ],
  runtimeConfig: {
    public: {
      apiBaseUrl: process.env.NUXT_PUBLIC_API_BASE_URL || 'https://pocket.lasseharm.space/api/collections/budget_tracker_transactions/records',
      apiToken: process.env.NUXT_PUBLIC_API_TOKEN || ''
    }
  }
})
