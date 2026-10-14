import { clearLegacyApiCache } from '~/utils/legacyCaches'

// The service worker no longer caches API responses; remove what older versions left on the device
export default defineNuxtPlugin(() => {
  clearLegacyApiCache()
})
