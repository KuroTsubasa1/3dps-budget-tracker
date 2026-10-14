import { ref } from 'vue'
import { usePocketBase } from './usePocketBase'
import { useInventory } from './useInventory'
import { newRecordId } from '~/utils/inventory'
import {
  NO_PRIZES,
  addPrizes,
  takePrize,
  returnPrize,
  prizeMovement,
  undoPick,
  readOpenPrizes,
  writeOpenPrizes,
  readOutbox,
  writeOutbox,
  forgetPrizes
} from '~/utils/gatcha'

// One state for the whole app, kept on this device:
// - open: the prizes still to pick ({ count, categories });
// - picks: the prizes picked since the last time all were picked, for "k of N", Picked and Undo;
// - outbox: the prize movements (and undos) that have not reached the server yet, in order.
const open = ref(NO_PRIZES)
const picks = ref([])
const outbox = ref([])
// Movement ids whose request is out right now
const sending = ref([])
let loaded = false
let syncRun = null
let syncAgain = false
let listening = false
// The stock the server answered for the last send ({ stocks }, a new object each time), for the catalog
const syncedStocks = ref(null)
// While prize changes wait, they are sent again every minute (a failed send on a connection that says it is online)
const RETRY_EVERY_MS = 60000
let retryTimer = null
let retry = () => {}

// localStorage only exists in the browser, so the state is read on first use there
const load = () => {
  if (loaded) return
  loaded = true
  open.value = readOpenPrizes(localStorage)
  outbox.value = readOutbox(localStorage)
}

const stopRetrying = () => {
  clearInterval(retryTimer)
  retryTimer = null
}

const save = () => {
  writeOpenPrizes(localStorage, open.value)
  writeOutbox(localStorage, outbox.value)
  if (!outbox.value.length) stopRetrying()
  else if (!retryTimer) retryTimer = setInterval(() => retry(), RETRY_EVERY_MS)
}

// What the outbox still changes in an article's stock on the server, to add to the server's figure
const pendingChange = articleId => outbox.value.reduce((sum, item) => (item.article === articleId ? sum + item.change : sum), 0)

// The fields PocketBase stores; `tried` only lives on this device
const bodyOf = ({ id, article, change, reason, note }) => ({ id, article, change, reason, note })

// Logging out forgets the open prizes and the picks. Waiting movements stay queued, like sales that have
// not synced, and go out after the next login; "Clear All Local Data" (keepOutbox: false) drops them too.
export function forgetGatchaPrizes ({ keepOutbox = true } = {}) {
  loaded = true
  open.value = NO_PRIZES
  picks.value = []
  outbox.value = keepOutbox ? readOutbox(localStorage) : []
  stopRetrying()
  forgetPrizes(localStorage, { keepOutbox })
}

export const useGatchaPrizes = () => {
  const pb = usePocketBase()
  const { applyMovements } = useInventory()

  // Sends the outbox in order, one movement at a time, and stops at the first failure so an undo never
  // overtakes its pick. A movement id the server already has counts as sent (createMovement), so a
  // resend after a lost reply records nothing twice.
  const runSync = async () => {
    do {
      syncAgain = false
      for (const queued of [...outbox.value]) {
        if (!navigator.onLine || !pb.authStore.isValid) return
        // Undone while waiting: it left the outbox and must not go out
        if (!outbox.value.some(item => item.id === queued.id)) continue
        outbox.value = outbox.value.map(item => (item.id === queued.id ? { ...item, tried: true } : item))
        save()
        sending.value = [...sending.value, queued.id]
        let stocks
        try {
          stocks = await applyMovements([bodyOf(queued)])
        } catch {
          return
        } finally {
          sending.value = sending.value.filter(id => id !== queued.id)
        }
        outbox.value = outbox.value.filter(item => item.id !== queued.id)
        save()
        syncedStocks.value = { stocks }
      }
    } while (syncAgain)
  }

  const syncPrizes = () => {
    load()
    if (syncRun) {
      syncAgain = true
      return syncRun
    }
    if (!outbox.value.length) return Promise.resolve()
    syncRun = runSync().finally(() => { syncRun = null })
    return syncRun
  }

  // From the catalog's onMounted: load the device's state, send what waits, and send again whenever
  // the connection comes back (once per app)
  const startPrizeSync = () => {
    load()
    retry = syncPrizes
    if (!listening) {
      listening = true
      window.addEventListener('online', () => syncPrizes())
      document.addEventListener('visibilitychange', () => {
        if (document.visibilityState === 'visible') syncPrizes()
      })
    }
    // Waiting from an earlier visit: keep trying
    save()
    syncPrizes()
  }

  const addOpenPrizes = (prizes) => {
    load()
    // A round that ended (none open) starts over with an empty Picked list
    if (!open.value.count) picks.value = []
    open.value = addPrizes(open.value, prizes)
    save()
  }

  // One prize for `article`: a sale of 1, queued on the device and sent right away when online
  const pick = (article) => {
    load()
    if (open.value.count < 1) return false
    const movement = prizeMovement(newRecordId(), article.id)
    outbox.value = [...outbox.value, movement]
    open.value = takePrize(open.value)
    picks.value = [...picks.value, { id: movement.id, article: article.id, name: article.name }]
    save()
    syncPrizes()
    return true
  }

  // A pick that never left the device is dropped. One that was sent, is being sent or was tried before
  // (its request may have reached the server) stays queued and gets a +1 correction behind it.
  const undo = (item) => {
    load()
    if (!picks.value.some(entry => entry.id === item.id)) return false
    const queued = outbox.value.find(movement => movement.id === item.id)
    const mayHaveLanded = sending.value.includes(item.id) || !!queued?.tried
    outbox.value = undoPick(outbox.value, item, { sending: mayHaveLanded, id: newRecordId() })
    picks.value = picks.value.filter(entry => entry.id !== item.id)
    open.value = returnPrize(open.value)
    save()
    syncPrizes()
    return true
  }

  const isWaiting = item => outbox.value.some(movement => movement.id === item.id)

  // The sheet closed: once every prize is picked, the round is over and Picked starts empty next time
  const endRound = () => {
    if (!open.value.count) picks.value = []
  }

  return { openPrizes: open, picks, outbox, addOpenPrizes, pick, undo, isWaiting, endRound, syncPrizes, startPrizeSync, syncedStocks, pendingChange }
}
