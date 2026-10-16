// POST /api/card/cancel { id }: Cancel on terminal. Answers { status } once SumUp has taken the stop; a
// payment SumUp has not settled stays { status: 'pending' } for the refresh and the poll.
import { cardSettings } from '../../utils/cardSettings.js'
import { requireCaller } from '../../utils/requireCaller.js'
import { useCard } from '../../utils/card.js'
import { cancelCharge, createOwnerStore, NOT_CONFIGURED, cardErrorFor } from '../../utils/cardPayments.js'

export default defineEventHandler(async (event) => {
  const settings = cardSettings(process.env)
  if (!settings.configured) throw createError({ statusCode: 503, statusMessage: NOT_CONFIGURED, message: NOT_CONFIGURED })
  await requireCaller(event, settings, { ownerOnly: true })
  const { id } = (await readBody(event).catch(() => null)) ?? {}
  const store = createOwnerStore({ pocketbaseUrl: settings.pocketbaseUrl, authorization: getHeader(event, 'authorization') })
  try {
    return await cancelCharge({ store, sumup: useCard(settings).sumup, id })
  } catch (error) {
    throw createError(cardErrorFor(error))
  }
})
