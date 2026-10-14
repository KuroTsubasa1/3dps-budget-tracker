// https://nuxt.com/docs/api/configuration/nuxt-config
export default defineNuxtConfig({
  compatibilityDate: '2024-11-01',
  devtools: { enabled: true },
  app: {
    head: {
      viewport: 'width=device-width, initial-scale=1, viewport-fit=cover',
      link: [
        { rel: 'icon', type: 'image/png', sizes: '32x32', href: '/icons/icon-32x32.png' },
        { rel: 'apple-touch-icon', href: '/icons/apple-touch-icon.png' }
      ],
      meta: [{ name: 'theme-color', content: '#2563eb' }]
    }
  },
  modules: [
    '@nuxtjs/tailwindcss',
    '@vite-pwa/nuxt'
  ],
  build: {
    // qrcode-vue3 ships a UMD "main" under "type": "module", which breaks SSR imports
    transpile: ['qrcode-vue3']
  },
  tailwindcss: {
    // Without this the module injects its bundled default and assets/css/main.css never loads
    cssPath: '~/assets/css/main.css',
    config: {
      darkMode: 'class'
    }
  },
  runtimeConfig: {
    public: {
      apiBaseUrl: process.env.NUXT_PUBLIC_API_BASE_URL || 'https://pocket.lasseharm.space/api/',
      apiEndpoint: process.env.NUXT_PUBLIC_API_ENDPOINT || 'collections/budget_tracker_transactions/records',
      pocketbaseUrl: process.env.NUXT_PUBLIC_POCKETBASE_URL || 'https://pocket.lasseharm.space'
    }
  },
  pwa: {
    registerType: 'autoUpdate',
    manifest: {
      name: 'Budget Tracker',
      short_name: 'Budget',
      description: '3DPS Budget Tracking Application',
      theme_color: '#2563eb',
      background_color: '#ffffff',
      display: 'standalone',
      orientation: 'portrait',
      start_url: '/',
      icons: [
        {
          src: '/icons/icon-192x192.png',
          sizes: '192x192',
          type: 'image/png'
        },
        {
          src: '/icons/icon-512x512.png',
          sizes: '512x512',
          type: 'image/png'
        },
        {
          src: '/icons/maskable-512x512.png',
          sizes: '512x512',
          type: 'image/png',
          purpose: 'maskable'
        }
      ]
    },
    workbox: {
      navigateFallback: '/',
      globPatterns: ['**/*.{js,css,html,png,svg,ico,json}']
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
