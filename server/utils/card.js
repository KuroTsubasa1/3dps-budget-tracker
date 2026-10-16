// One SumUp client, the sandbox check and, with the notifier login, the notifier's PocketBase client and the
// backup poll, per server process: shared by the card routes and the plugin that starts the poll
import { createSumUpClient } from './sumup.js'
import { useNotifier } from './notifier.js'
import { createCardPoller, createSandboxCheck, SUMUP_UNREACHABLE } from './cardPayments.js'

export const PAYMENT_CHANGED = 'The payment changed meanwhile. Try again.'

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

// The error a route lets out: the card rules' own errors (they carry a statusCode and a safe message) pass
// through; anything else (a PocketBase answer after a race on the record, a SumUp or network failure) becomes
// a fixed message, so no PocketBase or SumUp text, URL or token reaches the browser.
export const cardError = (error) => {
  if (error?.statusCode) return createError({ statusCode: error.statusCode, statusMessage: error.statusMessage, message: error.statusMessage })
  const raced = [400, 403, 404].includes(error?.status)
  return createError({ statusCode: raced ? 409 : 502, statusMessage: raced ? PAYMENT_CHANGED : SUMUP_UNREACHABLE, message: raced ? PAYMENT_CHANGED : SUMUP_UNREACHABLE })
}
