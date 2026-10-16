// POST /api/card/refresh { id }: the open payment sheet asks every 2 s. The payment is read and, when SumUp
// has a result, written with the owner's own token (same lookup, mapping and 10-minute rule as the poll),
// so results arrive without the return URL and the poll. Answers { payment } without its callback token.
import { cardSettings } from '../../utils/cardSettings.js'
import { requireCaller } from '../../utils/requireCaller.js'
import { useCard } from '../../utils/card.js'
import { refreshPayment, createOwnerStore, NOT_CONFIGURED, cardErrorFor } from '../../utils/cardPayments.js'

export default defineEventHandler(async (event) => {
  const settings = cardSettings(process.env)
  if (!settings.configured) throw createError({ statusCode: 503, statusMessage: NOT_CONFIGURED, message: NOT_CONFIGURED })
  await requireCaller(event, settings, { ownerOnly: true })
  const { id } = (await readBody(event).catch(() => null)) ?? {}
  const store = createOwnerStore({ pocketbaseUrl: settings.pocketbaseUrl, authorization: getHeader(event, 'authorization') })
  try {
    return await refreshPayment({ store, sumup: useCard(settings).sumup, id })
  } catch (error) {
    throw createError(cardErrorFor(error))
  }
})
