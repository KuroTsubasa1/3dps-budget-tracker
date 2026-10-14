// Push notifications on this device: what the browser supports, and the texts Settings shows
import { formatMoment } from './calendar/dates.js'

export const isIos = ({ userAgent = '', platform = '', maxTouchPoints = 0 }) =>
  /iPad|iPhone|iPod/.test(userAgent) || (platform === 'MacIntel' && maxTouchPoints > 1)

// 'ok', 'install' (iPhone or iPad Safari: Akinai must be on the Home Screen first) or 'unsupported'
export function pushSupport ({ userAgent, platform, maxTouchPoints, standalone, hasServiceWorker, hasNotification, hasPushManager }) {
  if (isIos({ userAgent, platform, maxTouchPoints }) && !standalone) return 'install'
  return hasServiceWorker && hasNotification && hasPushManager ? 'ok' : 'unsupported'
}

// Stored with the subscription so the owner can tell devices apart
export function deviceName (userAgent = '') {
  if (/iPhone/.test(userAgent)) return 'iPhone'
  if (/iPad/.test(userAgent)) return 'iPad'
  if (/Android/.test(userAgent)) return 'Android'
  if (/Macintosh/.test(userAgent)) return 'Mac'
  if (/Windows/.test(userAgent)) return 'Windows'
  return 'Browser'
}

// The VAPID public key (base64url) as pushManager.subscribe wants it
export function urlBase64ToUint8Array (value) {
  const base64 = `${value}${'='.repeat((4 - (value.length % 4)) % 4)}`.replace(/-/g, '+').replace(/_/g, '/')
  return Uint8Array.from(atob(base64), char => char.charCodeAt(0))
}

// The status line under Notifications; '' while it loads
export function statusText (status) {
  if (!status) return ''
  if (!status.configured) return "Notifications aren't configured on the server"
  if (status.lastError) return `Last check failed: ${status.lastError}`
  if (status.lastRun) return `Reminders last checked ${formatMoment(new Date(status.lastRun))}`
  return "Reminders haven't been checked yet"
}
