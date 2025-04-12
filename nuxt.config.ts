// https://nuxt.com/docs/api/configuration/nuxt-config
export default defineNuxtConfig({
  compatibilityDate: '2024-11-01',
  devtools: { enabled: true },
  modules: [
    '@nuxtjs/tailwindcss',
    '@vite-pwa/nuxt'
  ],
  tailwindcss: {
    config: {
      darkMode: 'class'
    }
  },
  runtimeConfig: {
    public: {
      apiBaseUrl: process.env.NUXT_PUBLIC_API_BASE_URL || 'https://pocket.lasseharm.space/api/',
      apiEndpoint: process.env.NUXT_PUBLIC_API_ENDPOINT || 'collections/budget_tracker_transactions/records',
      apiToken: process.env.NUXT_PUBLIC_API_TOKEN || ''
    }
  },
  pwa: {
    registerType: 'autoUpdate',
    manifest: {
      name: 'Budget Tracker',
      short_name: 'Budget',
      description: '3DPS Budget Tracking Application',
      theme_color: '#ffffff',
      background_color: '#ffffff',
      display: 'standalone',
      orientation: 'portrait',
      start_url: '/',
      icons: [
        {
          src: '/icons/icon-72x72.png',
          sizes: '72x72',
          type: 'image/png'
        },
        {
          src: '/icons/icon-192x192.png',
          sizes: '192x192',
          type: 'image/png'
        },
        {
          src: '/icons/icon-512x512.png',
          sizes: '512x512',
          type: 'image/png',
          purpose: 'any maskable'
        }
      ]
    },
    workbox: {
      navigateFallback: '/',
      globPatterns: ['**/*.{js,css,html,png,svg,ico,json}'],
      runtimeCaching: [
        {
          urlPattern: /^https:\/\/pocket\.lasseharm\.space\/api\//,
          handler: 'NetworkFirst',
          options: {
            cacheName: 'api-cache',
            expiration: {
              maxEntries: 100,
              maxAgeSeconds: 60 * 60 * 24 // 1 day
            },
            cacheableResponse: {
              statuses: [0, 200]
            }
          }
        }
      ]
    },
    registerWebManifestInRouteRules: true,
    writePlugin: true,
    devOptions: {
      enabled: true,
      type: 'module',
      navigateFallback: '/'
    }
  }
})
