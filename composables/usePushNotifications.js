import { ref } from 'vue'
import { usePocketBase } from './usePocketBase'
import { pushSupport, deviceName, urlBase64ToUint8Array } from '~/utils/push'

const SUBSCRIPTIONS = 'push_subscriptions'

// Push on this device: support, permission, subscribing and the server's routes (status, test, calendar link).
// The server routes need the owner's PocketBase token.
export const usePushNotifications = () => {
  const pb = usePocketBase()
  // 'loading' | 'unsupported' | 'install' | 'denied' | 'off' | 'on'
  const state = ref('loading')
  // { configured, feed, publicKey?, lastRun?, lastError? } from the server, null until loaded
  const status = ref(null)

  const auth = () => ({ Authorization: pb.authStore.token })
  const support = () => pushSupport({
    userAgent: navigator.userAgent,
    platform: navigator.platform,
    maxTouchPoints: navigator.maxTouchPoints,
    standalone: window.matchMedia('(display-mode: standalone)').matches || navigator.standalone === true,
    hasServiceWorker: 'serviceWorker' in navigator,
    hasNotification: 'Notification' in window,
    hasPushManager: 'PushManager' in window
  })
  // getRegistration, not ready: ready never settles while the worker is still installing
  const registration = () => navigator.serviceWorker.getRegistration()
  const currentSubscription = async () => (await registration())?.pushManager.getSubscription() ?? null

  // Works out this device's state; never throws
  const refreshState = async () => {
    const supported = support()
    if (supported !== 'ok') {
      state.value = supported
      return
    }
    if (Notification.permission === 'denied') {
      state.value = 'denied'
      return
    }
    try {
      state.value = (await currentSubscription()) && Notification.permission === 'granted' ? 'on' : 'off'
    } catch {
      state.value = 'off'
    }
  }

  const loadStatus = async () => {
    status.value = await $fetch('/api/push/status', { headers: auth() })
    return status.value
  }

  // Permission, then the browser subscription, then the push_subscriptions record
  const turnOn = async () => {
    const permission = await Notification.requestPermission()
    if (permission !== 'granted') {
      state.value = permission === 'denied' ? 'denied' : 'off'
      return
    }
    const worker = await registration()
    if (!worker) throw new Error('Akinai is still being set up on this device. Reload the page and try again.')
    const subscription = await worker.pushManager.getSubscription() ??
      await worker.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: urlBase64ToUint8Array(status.value.publicKey) })
    const { endpoint, keys } = subscription.toJSON()
    try {
      await pb.collection(SUBSCRIPTIONS).create({ endpoint, keys, device: deviceName(navigator.userAgent) })
    } catch (error) {
      // The endpoint is unique: this device is already on the server
      if (!(error?.status === 400 && error.response?.data?.endpoint)) throw error
    }
    state.value = 'on'
  }

  // The record goes first (it needs the connection), then the browser subscription
  const turnOff = async () => {
    const subscription = await currentSubscription()
    if (subscription) {
      const records = await pb.collection(SUBSCRIPTIONS).getFullList({ filter: pb.filter('endpoint = {:endpoint}', { endpoint: subscription.endpoint }) })
      for (const record of records) await pb.collection(SUBSCRIPTIONS).delete(record.id)
      await subscription.unsubscribe()
    }
    state.value = 'off'
  }

  const sendTest = async () => {
    const subscription = await currentSubscription()
    if (!subscription) throw new Error('This device has to turn notifications on again')
    await $fetch('/api/push/test', { method: 'POST', headers: auth(), body: { endpoint: subscription.endpoint } })
  }

  // The full https link of the private calendar feed
  const calendarLink = async () => {
    const { path } = await $fetch('/api/calendar/link', { headers: auth() })
    return new URL(path, window.location.origin).href
  }

  return { state, status, refreshState, loadStatus, turnOn, turnOff, sendTest, calendarLink }
}
