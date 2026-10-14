// Which push services Akinai talks to. Shared by the browser (before it stores a subscription) and the server
// (before it calls one); no imports, so it is safe on both sides.
// A push endpoint is an address the owner's browser handed us and the server will call. Only the real push
// services are allowed (the ones browsers use), over https on the default port and without credentials, so
// the server cannot be turned on its own network, whatever a host name resolves to.
const PUSH_HOST = 'fcm.googleapis.com'
const PUSH_HOST_SUFFIXES = ['.push.apple.com', '.push.services.mozilla.com', '.notify.windows.com']

export function isPushEndpointAllowed (endpoint) {
  let url
  try {
    url = new URL(endpoint)
  } catch {
    return false
  }
  if (url.protocol !== 'https:' || url.username || url.password || url.port) return false
  const host = url.hostname.toLowerCase().replace(/\.+$/, '')
  return host === PUSH_HOST || PUSH_HOST_SUFFIXES.some(suffix => host.endsWith(suffix))
}
