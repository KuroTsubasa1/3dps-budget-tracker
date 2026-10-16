// POST /api/card/charge { source, amount, description, cart }: puts the amount on the Solo. Answers { id },
// the card payment's record id; the app's sheet refreshes that payment until it has a result.
import { APP_URL } from '~~/utils/branding.js'
import { cardSettings } from '../../utils/cardSettings.js'
import { requireCaller } from '../../utils/requireCaller.js'
import { useCard } from '../../utils/card.js'
import { publicHost, chargeInput, startCharge, createOwnerStore, NOT_CONFIGURED, cardErrorFor } from '../../utils/cardPayments.js'

export default defineEventHandler(async (event) => {
  const settings = cardSettings(process.env)
  if (!settings.configured) throw createError({ statusCode: 503, statusMessage: NOT_CONFIGURED, message: NOT_CONFIGURED })
  await requireCaller(event, settings, { ownerOnly: true })
  try {
    const input = chargeInput(await readBody(event).catch(() => null))
    const { sumup, isSandbox, poller } = useCard(settings)
    const { id } = await startCharge({
      input,
      sumup,
      // Created and updated with the owner's own token: the collection lets only the owner create
      store: createOwnerStore({ pocketbaseUrl: settings.pocketbaseUrl, authorization: getHeader(event, 'authorization') }),
      isSandbox,
      // The return URL's host: the app's public address (CARD_PUBLIC_URL or APP_URL), never the request's own
      host: publicHost({ env: process.env, appUrl: APP_URL, production: process.env.NODE_ENV === 'production' })
    })
    // With the notifier login the poll follows it too (the app may close before the result)
    poller?.track(id)
    return { id }
  } catch (error) {
    throw createError(cardErrorFor(error))
  }
})
