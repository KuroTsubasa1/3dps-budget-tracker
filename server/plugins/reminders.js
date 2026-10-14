// Starts the reminder job inside the built Nuxt server, every 5 minutes, once the env is complete.
// `nuxt dev` never runs it, even with the env in a local .env: a dev server must not send real reminders.
import webpush from 'web-push'
import { notifierSettings } from '../utils/notifierSettings.js'
import { useNotifier } from '../utils/notifier.js'
import { createReminderRunner, createPushSender, REMINDER_INTERVAL_MS } from '../utils/reminderJob.js'

export default defineNitroPlugin(() => {
  if (import.meta.prerender) return
  if (import.meta.dev) {
    console.info('[reminders] off in nuxt dev')
    return
  }
  const settings = notifierSettings(process.env)
  if (!settings.push) {
    console.info(`[reminders] off, missing: ${settings.missing.join(', ')}`)
    return
  }
  const runner = createReminderRunner({ store: useNotifier(settings), send: createPushSender({ webpush, ...settings }) })
  // A first run shortly after start, then every 5 minutes
  setTimeout(() => runner.run(), 30_000)
  setInterval(() => runner.run(), REMINDER_INTERVAL_MS)
})
