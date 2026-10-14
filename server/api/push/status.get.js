// GET /api/push/status: is push set up on the server, and how did the reminder job do?
// Unconfigured, it answers without asking PocketBase anything.
import { notifierSettings } from '../../utils/notifierSettings.js'
import { requireCaller } from '../../utils/requireCaller.js'
import { reminderStatus } from '../../utils/reminderJob.js'

export default defineEventHandler(async (event) => {
  const settings = notifierSettings(process.env)
  if (!settings.push) return { configured: false, feed: settings.feed }
  await requireCaller(event, settings)
  return { configured: true, feed: settings.feed, publicKey: settings.publicKey, lastRun: reminderStatus.lastRun, lastError: reminderStatus.lastError }
})
