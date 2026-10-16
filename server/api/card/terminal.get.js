// GET /api/card/terminal: { configured, paired, reader: { id, name, status } | null }. Unconfigured, it
// answers without asking anyone (like /api/push/status); otherwise only the owner may ask.
import { cardSettings } from '../../utils/cardSettings.js'
import { requireCaller } from '../../utils/requireCaller.js'
import { useCard } from '../../utils/card.js'
import { terminalStatus, cardErrorFor } from '../../utils/cardPayments.js'

export default defineEventHandler(async (event) => {
  const settings = cardSettings(process.env)
  if (!settings.configured) return { configured: false, paired: false, reader: null }
  await requireCaller(event, settings, { ownerOnly: true })
  try {
    return { configured: true, ...(await terminalStatus(useCard(settings))) }
  } catch (error) {
    throw createError(cardErrorFor(error))
  }
})
