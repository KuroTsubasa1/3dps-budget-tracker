// Server-only settings for push reminders and the calendar feed, read from the environment
// (/opt/budget-tracker/shared/akinai.env on the server). Secrets never get a NUXT_PUBLIC_ prefix;
// only the VAPID public key is public by design.
// OWNER_ID is the owner's record id in "users" (printed by --apply-rules): the owner's routes accept only it
const PUSH_KEYS = ['POCKETBASE_URL', 'OWNER_ID', 'NOTIFIER_EMAIL', 'NOTIFIER_PASSWORD', 'NUXT_PUBLIC_VAPID_PUBLIC_KEY', 'VAPID_PRIVATE_KEY', 'VAPID_SUBJECT']
const FEED_KEYS = ['POCKETBASE_URL', 'OWNER_ID', 'NOTIFIER_EMAIL', 'NOTIFIER_PASSWORD', 'CALENDAR_SECRET']
const RECORD_ID = /^[a-z0-9]{15}$/
// The secret is part of the feed's URL: long and URL-safe
const FEED_SECRET = /^[A-Za-z0-9_-]{32,}$/
// There is no default PocketBase: a server without POCKETBASE_URL must not guess the production one

export function notifierSettings (env = process.env) {
  const has = key => typeof env[key] === 'string' && env[key].trim() !== '' && (key !== 'OWNER_ID' || RECORD_ID.test(env[key])) && (key !== 'CALENDAR_SECRET' || FEED_SECRET.test(env[key]))
  return {
    pocketbaseUrl: has('POCKETBASE_URL') ? env.POCKETBASE_URL.trim().replace(/\/$/, '') : '',
    ownerId: has('OWNER_ID') ? env.OWNER_ID : '',
    email: env.NOTIFIER_EMAIL || '',
    password: env.NOTIFIER_PASSWORD || '',
    publicKey: env.NUXT_PUBLIC_VAPID_PUBLIC_KEY || '',
    privateKey: env.VAPID_PRIVATE_KEY || '',
    subject: env.VAPID_SUBJECT || '',
    calendarSecret: has('CALENDAR_SECRET') ? env.CALENDAR_SECRET : '',
    // Push needs the notifier login and the VAPID keys; the feed needs the login and its secret
    push: PUSH_KEYS.every(has),
    feed: FEED_KEYS.every(has),
    // Names only, never values: safe to log
    missing: [...new Set([...PUSH_KEYS, ...FEED_KEYS])].filter(key => !has(key))
  }
}
