// GET /api/push/status: is push set up on the server, and how did the reminder job do?
// Unconfigured, it answers without asking PocketBase anything.
import { notifierSettings } from '../../utils/notifierSettings.js'
import { requireCaller } from '../../utils/requireCaller.js'
import { useNotifier } from '../../utils/notifier.js'
import { reminderStatus } from '../../utils/reminderJob.js'

export default defineEventHandler(async (event) => {
  const settings = notifierSettings(process.env)
  if (!settings.push) return { configured: false, feed: settings.feed }
  await requireCaller(event, settings)
  // How many devices get reminders; null when PocketBase can't say right now
  const devices = await useNotifier(settings).listSubscriptions().then(list => list.length, () => null)
  return {
    configured: true,
    feed: settings.feed,
    publicKey: settings.publicKey,
    lastRun: reminderStatus.lastRun,
    lastError: reminderStatus.lastError,
    lastProblem: reminderStatus.lastProblem,
    devices
  }
})
