// POST /api/card/callback/<payment id>/<token>: SumUp's return URL. No owner check: the per-payment token is
// the key, compared in constant time; a wrong one is a 404. The body is never read (SumUp does not sign it):
// the result is asked of SumUp's transactions API, after the 200 has gone out. Without the notifier login
// (the laptop's nuxt dev) it is off: 404, and the open sheet's refresh finds the result instead.
import { cardSettings } from '../../../../utils/cardSettings.js'
import { useCard } from '../../../../utils/card.js'
import { callbackMatches } from '../../../../utils/cardPayments.js'

export default defineEventHandler(async (event) => {
  const settings = cardSettings(process.env)
  if (!settings.background) throw createError({ statusCode: 404, statusMessage: 'Not found' })
  const id = getRouterParam(event, 'id') ?? ''
  const token = getRouterParam(event, 'token') ?? ''
  const { store, poller } = useCard(settings)
  if (!(await callbackMatches({ store, id, token }))) throw createError({ statusCode: 404, statusMessage: 'Not found' })
  poller.track(id)
  // Not awaited: SumUp gets its answer at once; a failed check is the poll's to repeat
  poller.run().catch(() => {})
  return { ok: true }
})
