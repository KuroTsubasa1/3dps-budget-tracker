// POST /api/card/pair { code }: pairs the Solo that shows `code` under Connections → API → Connect
import { cardSettings } from '../../utils/cardSettings.js'
import { requireCaller } from '../../utils/requireCaller.js'
import { useCard } from '../../utils/card.js'
import { pairTerminal, NOT_CONFIGURED, cardErrorFor } from '../../utils/cardPayments.js'

export default defineEventHandler(async (event) => {
  const settings = cardSettings(process.env)
  if (!settings.configured) throw createError({ statusCode: 503, statusMessage: NOT_CONFIGURED, message: NOT_CONFIGURED })
  await requireCaller(event, settings, { ownerOnly: true })
  const { code } = (await readBody(event).catch(() => null)) ?? {}
  try {
    return await pairTerminal({ sumup: useCard(settings).sumup, code })
  } catch (error) {
    throw createError(cardErrorFor(error))
  }
})
