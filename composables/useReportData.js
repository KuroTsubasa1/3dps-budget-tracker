import { ref, watch, onMounted, onBeforeUnmount } from 'vue'
import { usePocketBase } from './usePocketBase'
import { useArticles } from './useArticles'
import { useCategories } from './useCategories'
import { useDeals } from './useDeals'
import { useCommissions } from './useCommissions'

const MOVEMENTS = 'stock_movements'
const DAY_MS = 86_400_000
// "Runs out in" needs the last 30 days of movements, whatever the period
const RECENT_DAYS = 30

const empty = () => ({ articles: [], categories: [], deals: [], commissions: [], movements: [], loadedAt: new Date() })
// A collection the server does not have yet (404) or still locks (403) has nothing to report
const orEmpty = promise => promise.catch(error => (error?.status === 403 || error?.status === 404 ? [] : Promise.reject(error)))
const offline = () => typeof navigator !== 'undefined' && !navigator.onLine

// Server records behind the Sales, Market day and Stock tabs: every article (archived ones too, for
// their names) with its category, the categories, deals and commissions, and the stock movements of
// the period plus the last 30 days. `range` is a ref of { start, end }; a new range loads again.
// Offline nothing loads and needsConnection is set; coming back online loads again.
export const useReportData = (range) => {
  const pb = usePocketBase()
  const { listAll } = useArticles()
  const { listCategories } = useCategories()
  const { listDeals } = useDeals()
  const { listCommissions } = useCommissions()

  const data = ref(empty())
  const loading = ref(true)
  const needsConnection = ref(false)
  const error = ref('')
  // Only the latest load may write its answer: one for an earlier period, or from before going offline, is dropped
  let run = 0

  // pb.filter writes a Date as PocketBase's 'YYYY-MM-DD HH:MM:SS.sssZ'
  const movementsFrom = (start, end) => orEmpty(pb.collection(MOVEMENTS).getFullList({
    filter: end
      ? pb.filter('created >= {:start} && created < {:end}', { start, end })
      : pb.filter('created >= {:start}', { start }),
    sort: 'created,id',
    expand: 'article'
  }))

  const load = async () => {
    const current = ++run
    error.value = ''
    if (offline()) {
      needsConnection.value = true
      loading.value = false
      return
    }
    loading.value = true
    const now = new Date()
    const { start, end } = range.value
    try {
      const [articles, categories, deals, commissions, inPeriod, recent] = await Promise.all([
        listAll(),
        listCategories(),
        orEmpty(listDeals()),
        orEmpty(listCommissions()),
        movementsFrom(start, end),
        movementsFrom(new Date(now.getTime() - RECENT_DAYS * DAY_MS))
      ])
      if (current !== run) return
      // The two windows overlap: each movement counts once
      const movements = [...new Map([...inPeriod, ...recent].map(movement => [movement.id, movement])).values()]
      data.value = { articles, categories, deals, commissions, movements, loadedAt: now }
      needsConnection.value = false
    } catch (err) {
      if (current !== run) return
      if (offline() || err?.status === 0) needsConnection.value = true
      else error.value = 'Could not load the report. Check your connection and try again.'
    } finally {
      if (current === run) loading.value = false
    }
  }

  const goneOffline = () => {
    run++
    needsConnection.value = true
    loading.value = false
  }

  watch(() => `${range.value.start.getTime()}-${range.value.end.getTime()}`, load)

  onMounted(() => {
    window.addEventListener('online', load)
    window.addEventListener('offline', goneOffline)
    load()
  })

  onBeforeUnmount(() => {
    window.removeEventListener('online', load)
    window.removeEventListener('offline', goneOffline)
  })

  return { data, loading, needsConnection, error, reload: load }
}
