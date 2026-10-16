// POST /api/card/unpair: removes the paired Solo at SumUp
import { cardSettings } from '../../utils/cardSettings.js'
import { requireCaller } from '../../utils/requireCaller.js'
import { useCard } from '../../utils/card.js'
import { unpairTerminal, NOT_CONFIGURED, cardErrorFor } from '../../utils/cardPayments.js'

export default defineEventHandler(async (event) => {
  const settings = cardSettings(process.env)
  if (!settings.configured) throw createError({ statusCode: 503, statusMessage: NOT_CONFIGURED, message: NOT_CONFIGURED })
  await requireCaller(event, settings, { ownerOnly: true })
  try {
    return await unpairTerminal({ sumup: useCard(settings).sumup })
  } catch (error) {
    throw createError(cardErrorFor(error))
  }
})
