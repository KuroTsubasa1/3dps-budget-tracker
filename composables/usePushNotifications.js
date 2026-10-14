import { ref } from 'vue'
import { usePocketBase } from './usePocketBase'
import { isPushEndpointAllowed } from '~/utils/pushHosts'
import { pushSupport, deviceName, urlBase64ToUint8Array } from '~/utils/push'

const SUBSCRIPTIONS = 'push_subscriptions'
const UNSUPPORTED_SERVICE = "This browser's push service isn't supported. Use Safari on iPhone, or Chrome, Firefox or Edge."

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

  const listRecords = endpoint => pb.collection(SUBSCRIPTIONS).getFullList({ filter: pb.filter('endpoint = {:endpoint}', { endpoint }) })

  const deleteRecords = async (endpoint) => {
    const records = await listRecords(endpoint)
    for (const record of records) await pb.collection(SUBSCRIPTIONS).delete(record.id)
  }

  // Stores this device's subscription on the server. The endpoint is unique: a record that is already
  // there counts as stored. Any other failure throws.
  const createRecord = async (endpoint, keys) => {
    try {
      await pb.collection(SUBSCRIPTIONS).create({ endpoint, keys, device: deviceName(navigator.userAgent) })
    } catch (error) {
      if (!(error?.status === 400 && error.response?.data?.endpoint)) throw error
    }
  }

  // A browser subscription the server has no record of may be one it dropped on purpose (the push service
  // answered 410) or one whose save was lost; either way its endpoint is not stored again. It is given up
  // and the device subscribes afresh with the server's current key (permission is already granted, so
  // there is no prompt). The new subscription is stored, or dropped again when that is not possible: the
  // browser never keeps a subscription the server doesn't know. Returns false for a push service that is
  // not allowed; a failed create throws.
  const subscribeAfresh = async (subscription) => {
    await subscription.unsubscribe()
    const worker = await registration()
    if (!worker || !status.value?.publicKey) throw new Error('This device cannot subscribe again right now')
    const fresh = await worker.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: urlBase64ToUint8Array(status.value.publicKey) })
    const { endpoint, keys } = fresh.toJSON()
    if (!isPushEndpointAllowed(endpoint)) {
      await fresh.unsubscribe().catch(() => {})
      return false
    }
    try {
      await createRecord(endpoint, keys)
    } catch (error) {
      await fresh.unsubscribe().catch(() => {})
      throw error
    }
    return true
  }

  // The browser can hold a subscription the server does not know: it would look "on" and get nothing.
  // Such a device gets a fresh subscription (subscribeAfresh); returns 'recreated' then, false when this
  // device cannot be registered, and 'unknown' when the server could not be asked (nothing changes then).
  // A failed create throws.
  const ensureRegistered = async (subscription) => {
    const { endpoint } = subscription.toJSON()
    if (!isPushEndpointAllowed(endpoint)) return false
    let records
    try {
      records = await listRecords(endpoint)
    } catch {
      return 'unknown'
    }
    if (records.length) return true
    return (await subscribeAfresh(subscription)) ? 'recreated' : false
  }

  // Works out this device's state; never throws. With `checkServer` (Settings, online, as the owner) an
  // "on" device must also be on the server. Returns 'recreated' when its record was put back,
  // 'unregistered' when that failed (the state is then 'off') and 'unknown' when the server could not be asked
  // (the state stays the browser's).
  const refreshState = async ({ checkServer = false } = {}) => {
    const supported = support()
    if (supported !== 'ok') {
      state.value = supported
      return ''
    }
    if (Notification.permission === 'denied') {
      state.value = 'denied'
      return ''
    }
    let subscription = null
    try {
      subscription = await currentSubscription()
    } catch {
      state.value = 'off'
      return ''
    }
    const on = !!subscription && usesCurrentKey(subscription) && Notification.permission === 'granted'
    if (!on || !checkServer || !navigator.onLine || !pb.authStore.isValid) {
      state.value = on ? 'on' : 'off'
      return ''
    }
    try {
      const registered = await ensureRegistered(subscription)
      if (registered === 'unknown') {
        state.value = 'on'
        return 'unknown'
      }
      state.value = registered ? 'on' : 'off'
      if (!registered) return 'unregistered'
      return registered === 'recreated' ? 'recreated' : ''
    } catch {
      state.value = 'off'
      return 'unregistered'
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
    // One the server has no record of is not stored again under its old endpoint: subscribe afresh
    if (subscription && isPushEndpointAllowed(subscription.toJSON().endpoint)) {
      const records = await listRecords(subscription.toJSON().endpoint)
      if (records.length) {
        state.value = 'on'
        return
      }
      if (!(await subscribeAfresh(subscription))) throw new Error(UNSUPPORTED_SERVICE)
      state.value = 'on'
      return
    }
    const created = !subscription
    if (created) {
      subscription = await worker.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: urlBase64ToUint8Array(status.value.publicKey) })
    }
    const { endpoint, keys } = subscription.toJSON()
    // The server only calls the real push services, so a subscription elsewhere could never receive anything
    if (!isPushEndpointAllowed(endpoint)) {
      if (created) await subscription.unsubscribe().catch(() => {})
      throw new Error(UNSUPPORTED_SERVICE)
    }
    try {
      await createRecord(endpoint, keys)
    } catch (error) {
      // Not stored, so not on: don't leave a browser subscription the server doesn't know
      if (created) await subscription.unsubscribe().catch(() => {})
      throw error
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
