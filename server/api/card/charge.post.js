// POST /api/card/charge { source, amount, description, cart }: puts the amount on the Solo. Answers { id },
// the card payment's record id; the app's sheet refreshes that payment until it has a result.
import { cardSettings } from '../../utils/cardSettings.js'
import { requireCaller } from '../../utils/requireCaller.js'
import { useCard, cardError } from '../../utils/card.js'
import { chargeInput, startCharge, createOwnerStore, NOT_CONFIGURED } from '../../utils/cardPayments.js'

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
      // The return URL's host: the address the app was opened on (nginx passes it through)
      host: getRequestHost(event, { xForwardedHost: true })
    })
    // With the notifier login the poll follows it too (the app may close before the result)
    poller?.track(id)
    return { id }
  } catch (error) {
    throw cardError(error)
  }
})
