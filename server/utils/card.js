// One SumUp client, the sandbox check and, with the notifier login, the notifier's PocketBase client and the
// backup poll, per server process: shared by the card routes and the plugin that starts the poll
import { createSumUpClient } from './sumup.js'
import { useNotifier } from './notifier.js'
import { createCardPoller, createSandboxCheck } from './cardPayments.js'

let shared = null
export const useCard = (settings) => {
  if (!shared) {
    const sumup = createSumUpClient({
      apiKey: settings.apiKey,
      merchantCode: settings.merchantCode,
      apiUrl: settings.apiUrl,
      affiliate: { appId: settings.appId, key: settings.affiliateKey }
    })
    // Without the notifier login (the laptop's nuxt dev) there is no store of its own and no poll:
    // the open sheet's refresh finds each result with the owner's token
    const store = settings.background ? useNotifier(settings) : null
    shared = { sumup, isSandbox: createSandboxCheck(sumup), store, poller: store ? createCardPoller({ store, sumup }) : null }
  }
  return shared
}
