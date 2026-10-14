// The reminder job's PocketBase client: the akinai-notifier account with an SDK instance of its own.
// PocketBase 0.22 treats an expired token as a guest, and a guest's list just comes back empty, so the
// client logs in again before every call once the token is near its end, and once more on a 401 or 403.
import PocketBase, { BaseAuthStore, isTokenExpired } from 'pocketbase'
import { withSentMarks } from '../../utils/calendar/reminders.js'

const ARTICLES = 'budget_tracket_catalog'
// Log in again when the token has less than an hour left
const RENEW_BEFORE_S = 3600

export function createNotifier ({ PocketBaseClass = PocketBase, url, email, password }) {
  const pb = new PocketBaseClass(url, new BaseAuthStore())
  pb.autoCancellation(false)
  let login = null

  const logIn = () => {
    // Concurrent calls share one login
    login ??= pb.collection('users').authWithPassword(email, password).finally(() => { login = null })
    return login
  }

  const call = async (work) => {
    if (!pb.authStore.token || isTokenExpired(pb.authStore.token, RENEW_BEFORE_S)) await logIn()
    try {
      return await work()
    } catch (error) {
      if (error?.status !== 401 && error?.status !== 403) throw error
      await logIn()
      return work()
    }
  }

  return {
    listConventions: () => call(() => pb.collection('conventions').getFullList({ sort: 'starts_on' })),
    listActiveArticles: () => call(() => pb.collection(ARTICLES).getFullList({ filter: 'active = true', sort: 'name' })),
    listSubscriptions: () => call(() => pb.collection('push_subscriptions').getFullList({ sort: 'created' })),
    findSubscription: endpoint => call(async () => {
      const [found = null] = await pb.collection('push_subscriptions').getFullList({ filter: pb.filter('endpoint = {:endpoint}', { endpoint }) })
      return found
    }),
    deleteSubscription: id => call(() => pb.collection('push_subscriptions').delete(id)),
    // The notifier's own record id in "users", so its token is accepted by the owner's routes too
    accountId: () => call(async () => pb.authStore.model?.id ?? ''),
    // Read the convention again and mark only the reminders that are still the same, so an edit the owner
    // saved since the job loaded it is never overwritten
    markReminders: (id, marks) => call(async () => {
      const fresh = await pb.collection('conventions').getOne(id)
      const reminders = Array.isArray(fresh.reminders) ? fresh.reminders : []
      return pb.collection('conventions').update(id, { reminders: withSentMarks(reminders, marks) })
    })
  }
}

// One client per server process, shared by the job, the feed and the routes
let shared = null
export const useNotifier = settings => {
  shared ??= createNotifier({ url: settings.pocketbaseUrl, email: settings.email, password: settings.password })
  return shared
}
