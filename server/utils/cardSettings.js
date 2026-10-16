// Server-only settings for card payments on the SumUp Solo, read from the environment: akinai.env on the
// server (live keys), the local .env in `nuxt dev` (sandbox keys). None of them ever gets a NUXT_PUBLIC_
// prefix, and none reaches a log or a response; `missing` and `backgroundMissing` list names only.
import { notifierSettings } from './notifierSettings.js'

const SUMUP_KEYS = ['SUMUP_API_KEY', 'SUMUP_MERCHANT_CODE', 'SUMUP_AFFILIATE_KEY', 'SUMUP_AFFILIATE_APP_ID']
// The owner's routes check the owner against PocketBase and write the payment with the owner's own token
const OWNER_KEYS = ['POCKETBASE_URL', 'OWNER_ID']
// SumUp's return URL and the 15 s backup poll run without the owner, as the notifier account
const NOTIFIER_KEYS = ['NOTIFIER_EMAIL', 'NOTIFIER_PASSWORD']
export const DEFAULT_SUMUP_API_URL = 'https://api.sumup.com'
// The merchant code is spliced into SumUp's URL paths
const MERCHANT_CODE = /^[A-Za-z0-9]{1,32}$/

// configured: card payments work (the app's refresh finds each result while its sheet is open).
// background: the return URL and the backup poll work too (they need the notifier login).
export function cardSettings (env = process.env) {
  const notifier = notifierSettings(env)
  const value = key => (typeof env[key] === 'string' ? env[key].trim() : '')
  const apiUrl = (value('SUMUP_API_URL') || DEFAULT_SUMUP_API_URL).replace(/\/+$/, '')
  const missing = [
    ...SUMUP_KEYS.filter(key => !value(key) || (key === 'SUMUP_MERCHANT_CODE' && !MERCHANT_CODE.test(value(key)))),
    // The API key never goes over plain http
    ...(/^https:\/\/[^/]+$/.test(apiUrl) ? [] : ['SUMUP_API_URL']),
    ...OWNER_KEYS.filter(key => notifier.missing.includes(key))
  ]
  const backgroundMissing = NOTIFIER_KEYS.filter(key => !value(key))
  return {
    pocketbaseUrl: notifier.pocketbaseUrl,
    ownerId: notifier.ownerId,
    email: notifier.email,
    password: notifier.password,
    apiKey: value('SUMUP_API_KEY'),
    merchantCode: value('SUMUP_MERCHANT_CODE'),
    affiliateKey: value('SUMUP_AFFILIATE_KEY'),
    appId: value('SUMUP_AFFILIATE_APP_ID'),
    apiUrl,
    configured: missing.length === 0,
    background: missing.length === 0 && backgroundMissing.length === 0,
    missing,
    backgroundMissing
  }
}
