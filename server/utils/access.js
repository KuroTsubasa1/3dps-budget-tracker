// Who may call the owner's routes, and the feed's secret link
import { createHash, timingSafeEqual } from 'node:crypto'

// A PocketBase token is a JWT: three base64url parts. Anything else is refused without asking PocketBase.
const TOKEN = /^[\w-]+\.[\w-]+\.[\w-]+$/
const MAX_TOKEN_LENGTH = 4096
const digest = value => createHash('sha256').update(String(value)).digest()
const sameText = (a, b) => timingSafeEqual(digest(a), digest(b))

// PocketBase 0.22 answers a list with an unknown or expired token as a guest (200, no items), so a list call
// proves nothing. auth-refresh answers 200 only for a valid token and names its account; that account must be
// one of `allowedIds` (OWNER_ID from the env, and the notifier's own id). The token goes to PocketBase only.
export async function verifyCaller ({ authorization, pocketbaseUrl, allowedIds, fetch = globalThis.fetch }) {
  if (typeof authorization !== 'string' || authorization.length > MAX_TOKEN_LENGTH || !TOKEN.test(authorization)) return false
  const allowed = (allowedIds ?? []).filter(Boolean)
  if (!allowed.length) return false
  try {
    const response = await fetch(`${pocketbaseUrl}/api/collections/users/auth-refresh`, {
      method: 'POST',
      headers: { Authorization: authorization }
    })
    if (!response.ok) return false
    const record = (await response.json())?.record
    if (record?.collectionName !== 'users' || typeof record.id !== 'string') return false
    return allowed.some(id => sameText(id, record.id))
  } catch {
    return false
  }
}

// `file` is the last path segment, '<secret>.ics'. Compared in constant time; no secret, no feed
export const feedFileMatches = (file, secret) => !!secret && sameText(file, `${secret}.ics`)
