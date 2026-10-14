// Thin h3 wrapper (h3 helpers are auto-imported in Nitro): 401 unless the request carries the owner's
// (OWNER_ID) or the notifier's token
import { verifyCaller } from './access.js'
import { useNotifier } from './notifier.js'

export async function requireCaller (event, settings) {
  const notifierId = await useNotifier(settings).accountId().catch(() => '')
  const allowed = await verifyCaller({
    authorization: getHeader(event, 'authorization'),
    pocketbaseUrl: settings.pocketbaseUrl,
    allowedIds: [settings.ownerId, notifierId]
  })
  if (!allowed) throw createError({ statusCode: 401, statusMessage: 'Log in again' })
}
