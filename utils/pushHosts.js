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

// The host of a push endpoint, for the server log and the status line. The rest of the address identifies
// the device and is never shown or logged.
export function pushHost (endpoint) {
  try {
    return new URL(endpoint).hostname.toLowerCase().replace(/\.+$/, '') || 'unknown host'
  } catch {
    return 'unknown host'
  }
}

const SERVICE_NAMES = [['.push.apple.com', 'Apple'], ['.push.services.mozilla.com', 'Mozilla'], ['.notify.windows.com', 'Microsoft']]

// "Apple answered 410 …": the company behind a push host, for the Settings status line
export function pushServiceName (host) {
  if (host === PUSH_HOST) return 'Google'
  return SERVICE_NAMES.find(([suffix]) => host.endsWith(suffix))?.[1] ?? 'A push service'
}
