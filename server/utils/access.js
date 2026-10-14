// Who may call the owner's routes, and the feed's secret link
import { createHash, timingSafeEqual } from 'node:crypto'
import { isIP } from 'node:net'

// A PocketBase token is a JWT: three base64url parts. Anything else is refused without asking PocketBase.
const TOKEN = /^[\w-]+\.[\w-]+\.[\w-]+$/
const MAX_TOKEN_LENGTH = 4096
const digest = value => createHash('sha256').update(String(value)).digest()
export const sameText = (a, b) => timingSafeEqual(digest(a), digest(b))

export const isWellFormedAuthorization = authorization =>
  typeof authorization === 'string' && authorization.length <= MAX_TOKEN_LENGTH && TOKEN.test(authorization)

// PocketBase 0.22 answers a list with an unknown or expired token as a guest (200, no items), so a list call
// proves nothing. auth-refresh answers 200 only for a valid token and names its account. Returns that
// account's id, or null. The caller decides whether the account may enter. The token goes to PocketBase only.
export async function verifyCaller ({ authorization, pocketbaseUrl, fetch = globalThis.fetch }) {
  if (!isWellFormedAuthorization(authorization) || !pocketbaseUrl) return null
  try {
    const response = await fetch(`${pocketbaseUrl}/api/collections/users/auth-refresh`, {
      method: 'POST',
      headers: { Authorization: authorization },
      signal: AbortSignal.timeout(10_000)
    })
    if (!response.ok) return null
    const record = (await response.json())?.record
    if (record?.collectionName !== 'users' || typeof record.id !== 'string') return null
    return record.id
  } catch {
    return null
  }
}

// `file` is the last path segment, '<secret>.ics'. Compared in constant time; no secret, no feed
export const feedFileMatches = (file, secret) => !!secret && sameText(file, `${secret}.ics`)

const privateIPv4 = ([a, b]) =>
  a === 0 || a === 10 || a === 127 || a >= 224 ||
  (a === 100 && b >= 64 && b <= 127) ||
  (a === 169 && b === 254) ||
  (a === 172 && b >= 16 && b <= 31) ||
  (a === 192 && b === 168)

// A push endpoint is an address the owner's browser handed us and the server will call: only https to a
// public host (so it cannot be turned on localhost, the private network or a cloud metadata address).
// Real push services use host names; IPv6 literals are refused outright.
export function isPushEndpointAllowed (endpoint) {
  let url
  try {
    url = new URL(endpoint)
  } catch {
    return false
  }
  if (url.protocol !== 'https:') return false
  const host = url.hostname.toLowerCase().replace(/\.$/, '')
  if (!host || isIP(host.replace(/^\[|\]$/g, '')) === 6) return false
  if (isIP(host) === 4) return !privateIPv4(host.split('.').map(Number))
  return host !== 'localhost' && !/\.(localhost|local|internal)$/.test(host)
}
