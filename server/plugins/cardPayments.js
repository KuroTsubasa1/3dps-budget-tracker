// Starts the card payments' backup poll: every 15 s it asks SumUp about the payments still pending (and
// does nothing while none is), so a payment whose app closed before the result is settled anyway. It needs
// the notifier login; without it (the laptop's nuxt dev) only the open sheet's refresh finds results.
import { cardSettings } from '../utils/cardSettings.js'
import { useCard } from '../utils/card.js'
import { CARD_POLL_MS } from '../utils/cardPayments.js'

export default defineNitroPlugin(() => {
  if (import.meta.prerender) return
  const settings = cardSettings(process.env)
  if (!settings.configured) {
    console.info(`[card] off, missing: ${settings.missing.join(', ')}`)
    return
  }
  if (!settings.background) {
    console.info(`[card] return URL and backup poll off, missing: ${settings.backgroundMissing.join(', ')}`)
    return
  }
  const { poller } = useCard(settings)
  // Payments left pending by a restart are picked up first
  poller.loadPending().then(() => poller.run())
  setInterval(() => poller.run(), CARD_POLL_MS)
})
