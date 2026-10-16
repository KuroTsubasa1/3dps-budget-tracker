// Thin h3 wrapper (h3 helpers are auto-imported in Nitro): 401 unless the request carries the owner's
// (OWNER_ID) or the notifier's token. A missing or malformed header is refused before anything is contacted;
// the notifier's own account (a PocketBase login) is looked up only when the owner did not match.
// `ownerOnly` (the card routes) lets only the owner in.
import { isWellFormedAuthorization, sameText, verifyCaller } from './access.js'
import { useNotifier } from './notifier.js'

export async function requireCaller (event, settings, { notifier, fetch, ownerOnly = false } = {}) {
  const authorization = getHeader(event, 'authorization')
  const refuse = () => createError({ statusCode: 401, statusMessage: 'Log in again' })
  if (!settings.ownerId || !isWellFormedAuthorization(authorization)) throw refuse()
  const id = await verifyCaller({ authorization, pocketbaseUrl: settings.pocketbaseUrl, fetch })
  if (!id) throw refuse()
  if (sameText(id, settings.ownerId)) return
  if (ownerOnly) throw refuse()
  const notifierId = await (notifier ?? useNotifier(settings)).accountId().catch(() => '')
  if (!notifierId || !sameText(id, notifierId)) throw refuse()
}
