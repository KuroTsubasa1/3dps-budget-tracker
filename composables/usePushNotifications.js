import { ref } from 'vue'
import { usePocketBase } from './usePocketBase'
import { isPushEndpointAllowed } from '~/utils/pushHosts'
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

  // Whether the subscription was made with the server's current VAPID key (a rotated key needs a new one).
  // Browsers that don't report the key count as matching.
  const usesCurrentKey = (subscription) => {
    const key = subscription.options?.applicationServerKey
    const publicKey = status.value?.publicKey
    if (!key || !publicKey) return true
    const expected = urlBase64ToUint8Array(publicKey)
    const actual = new Uint8Array(key)
    return actual.length === expected.length && actual.every((byte, index) => byte === expected[index])
  }

  const deleteRecords = async (endpoint) => {
    const records = await pb.collection(SUBSCRIPTIONS).getFullList({ filter: pb.filter('endpoint = {:endpoint}', { endpoint }) })
    for (const record of records) await pb.collection(SUBSCRIPTIONS).delete(record.id)
  }

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
      const subscription = await currentSubscription()
      state.value = subscription && usesCurrentKey(subscription) && Notification.permission === 'granted' ? 'on' : 'off'
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
    let subscription = await worker.pushManager.getSubscription()
    // Made with an older server key: its pushes would be refused, so start over (the old record goes too, best effort)
    if (subscription && !usesCurrentKey(subscription)) {
      await deleteRecords(subscription.endpoint).catch(() => {})
      await subscription.unsubscribe()
      subscription = null
    }
    const created = !subscription
    if (created) {
      subscription = await worker.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: urlBase64ToUint8Array(status.value.publicKey) })
    }
    const { endpoint, keys } = subscription.toJSON()
    // The server only calls the real push services, so a subscription elsewhere could never receive anything
    if (!isPushEndpointAllowed(endpoint)) {
      if (created) await subscription.unsubscribe().catch(() => {})
      throw new Error("This browser's push service isn't supported. Use Safari on iPhone, or Chrome, Firefox or Edge.")
    }
    try {
      await pb.collection(SUBSCRIPTIONS).create({ endpoint, keys, device: deviceName(navigator.userAgent) })
    } catch (error) {
      // The endpoint is unique: this device is already on the server
      if (!(error?.status === 400 && error.response?.data?.endpoint)) {
        // Not stored, so not on: don't leave a browser subscription the server doesn't know
        if (created) await subscription.unsubscribe().catch(() => {})
        throw error
      }
    }
    state.value = 'on'
  }

  // The record goes first (it needs the connection), then the browser subscription
  const turnOff = async () => {
    const subscription = await currentSubscription()
    if (subscription) {
      await deleteRecords(subscription.endpoint)
      await subscription.unsubscribe()
    }
    state.value = 'off'
  }

  const sendTest = async () => {
    const subscription = await currentSubscription()
    if (!subscription) throw new Error('This device has to turn notifications on again')
    try {
      await $fetch('/api/push/test', { method: 'POST', headers: auth(), body: { endpoint: subscription.endpoint } })
    } catch (error) {
      // The push service no longer knows this subscription: drop it so the device can turn notifications on afresh
      if (error?.statusCode === 404 || error?.statusCode === 410) {
        await deleteRecords(subscription.endpoint).catch(() => {})
        await subscription.unsubscribe().catch(() => {})
        state.value = 'off'
      }
      throw error
    }
  }

  // Logging out turns notifications off on this device. Best effort and bounded: it never blocks or breaks the logout.
  const releaseDevice = async () => {
    const work = async () => {
      if (!navigator.onLine || support() !== 'ok') return
      const subscription = await currentSubscription()
      if (!subscription) return
      // While the token is still valid
      await deleteRecords(subscription.endpoint).catch(() => {})
      await subscription.unsubscribe()
    }
    await Promise.race([work().catch(() => {}), new Promise(resolve => setTimeout(resolve, 3000))])
  }

  // The full https link of the private calendar feed
  const calendarLink = async () => {
    const { path } = await $fetch('/api/calendar/link', { headers: auth() })
    return new URL(path, window.location.origin).href
  }

  return { state, status, refreshState, loadStatus, turnOn, turnOff, sendTest, calendarLink, releaseDevice }
}
