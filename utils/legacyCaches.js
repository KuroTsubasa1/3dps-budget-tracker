// Older builds of the service worker cached PocketBase responses (customer names, takings) in Cache Storage
export const LEGACY_API_CACHE = 'api-cache'

export const clearLegacyApiCache = async () => {
  if (typeof window === 'undefined' || !('caches' in window)) return
  try {
    await window.caches.delete(LEGACY_API_CACHE)
  } catch {
    // Cache Storage can be unavailable (private mode, blocked storage): nothing to delete then
  }
}
