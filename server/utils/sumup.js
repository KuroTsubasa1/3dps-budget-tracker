// The only module that talks to SumUp: the Readers API (pairing, status, checkout, terminate) and the
// Transactions API, with plain fetch. Shapes follow developer.sumup.com as read on 2026-10-16; the README's
// sandbox checklist names what the owner confirms with the sandbox merchant and the Virtual Solo.
// Errors carry SumUp's HTTP status and a short kind, never the key, the request or SumUp's own text.
export const SUMUP_TIMEOUT_MS = 15_000

export class SumUpError extends Error {
  // kind: 'offline' (the reader is offline), 'timeout' and 'unreachable' (no answer), 'unauthorized',
  // 'not_found', 'conflict', 'invalid' (400/422) or 'failed' (anything else)
  constructor (kind, status = 0) {
    super(`SumUp ${kind}${status ? ` (${status})` : ''}`)
    this.name = 'SumUpError'
    this.kind = kind
    this.status = status
  }
}

// Only an account SumUp itself marks as a sandbox (Merchant.sandbox) is one
export const isSandboxMerchant = merchant => merchant?.sandbox === true

// The terminal did not get the request, or cannot take it now
export const isUnreachable = error => ['offline', 'timeout', 'unreachable'].includes(error?.kind)

// Errors are application/problem+json ({ type, title, status, detail }); a reader that is offline answers
// 422 with a type ending in /reader-offline
const errorKind = (status, body) => {
  if (status === 422 && (/reader-offline$/.test(String(body?.type ?? '')) || /reader offline/i.test(String(body?.title ?? '')))) return 'offline'
  if (status === 401 || status === 403) return 'unauthorized'
  if (status === 404) return 'not_found'
  if (status === 409) return 'conflict'
  if (status === 400 || status === 422) return 'invalid'
  return 'failed'
}

export function createSumUpClient ({ apiKey, merchantCode, apiUrl = 'https://api.sumup.com', affiliate, fetch = globalThis.fetch, timeoutMs = SUMUP_TIMEOUT_MS }) {
  const request = async (method, path, body) => {
    let response
    try {
      response = await fetch(`${apiUrl}${path}`, {
        method,
        headers: { Authorization: `Bearer ${apiKey}`, Accept: 'application/json', ...(body ? { 'Content-Type': 'application/json' } : {}) },
        body: body ? JSON.stringify(body) : undefined,
        signal: AbortSignal.timeout(timeoutMs)
      })
    } catch (error) {
      throw new SumUpError(error?.name === 'TimeoutError' || error?.name === 'AbortError' ? 'timeout' : 'unreachable')
    }
    const text = await response.text().catch(() => '')
    let json = null
    try {
      json = text ? JSON.parse(text) : null
    } catch {}
    if (!response.ok) throw new SumUpError(errorKind(response.status, json), response.status)
    return json
  }

  const merchant = `/v0.1/merchants/${encodeURIComponent(merchantCode)}`
  const reader = id => `${merchant}/readers/${encodeURIComponent(id)}`

  return {
    // GET /v1/merchants/{code} → Merchant { merchant_code, sandbox: boolean, … }; the sandbox check refuses unless sandbox is true
    getMerchant: () => request('GET', `/v1/merchants/${encodeURIComponent(merchantCode)}`),
    // GET …/readers → { items: Reader[] }; Reader { id, name, status: unknown|processing|paired|expired, device: { identifier, model } }
    listReaders: async () => (await request('GET', `${merchant}/readers`))?.items ?? [],
    // POST …/readers { pairing_code, name } → Reader; 404 when no reader waits for that code
    createReader: ({ pairingCode, name }) => request('POST', `${merchant}/readers`, { pairing_code: pairingCode, name }),
    deleteReader: id => request('DELETE', reader(id)),
    // GET …/readers/{id}/status → { data: { status: ONLINE|OFFLINE, state, battery_level, … } }
    readerStatus: async id => (await request('GET', `${reader(id)}/status`))?.data ?? null,
    // POST …/readers/{id}/checkout → { data: { client_transaction_id } }. return_url must be https; the
    // affiliate's foreign_transaction_id is our card payment's record id
    checkout: async (readerId, { cents, description, returnUrl, foreignId }) => (await request('POST', `${reader(readerId)}/checkout`, {
      total_amount: { value: cents, currency: 'EUR', minor_unit: 2 },
      description,
      ...(returnUrl ? { return_url: returnUrl } : {}),
      affiliate: { app_id: affiliate.appId, key: affiliate.key, foreign_transaction_id: foreignId }
    }))?.data ?? {},
    // POST …/readers/{id}/terminate: no body, no confirmation; works only while the reader waits for the card or PIN
    terminate: readerId => request('POST', `${reader(readerId)}/terminate`),
    // GET /v2.1/merchants/{code}/transactions?client_transaction_id=… (or foreign_transaction_id=…) →
    // { id, transaction_code, status: SUCCESSFUL|CANCELLED|FAILED|PENDING|REFUNDED, … }; null while SumUp has none
    findTransaction: async ({ clientTransactionId = '', foreignTransactionId = '' }) => {
      const query = clientTransactionId
        ? `client_transaction_id=${encodeURIComponent(clientTransactionId)}`
        : `foreign_transaction_id=${encodeURIComponent(foreignTransactionId)}`
      try {
        return await request('GET', `/v2.1/merchants/${encodeURIComponent(merchantCode)}/transactions?${query}`)
      } catch (error) {
        if (error.kind === 'not_found') return null
        throw error
      }
    }
  }
}
