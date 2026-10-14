// POST /api/push/test { endpoint }: sends a test notification to this device
import webpush from 'web-push'
import { notifierSettings } from '../../utils/notifierSettings.js'
import { isPushEndpointAllowed } from '../../utils/access.js'
import { requireCaller } from '../../utils/requireCaller.js'
import { useNotifier } from '../../utils/notifier.js'
import { createPushSender, TEST_MESSAGE } from '../../utils/reminderJob.js'

export default defineEventHandler(async (event) => {
  const settings = notifierSettings(process.env)
  if (!settings.push) throw createError({ statusCode: 503, statusMessage: "Notifications aren't configured on the server" })
  await requireCaller(event, settings)
  const { endpoint } = (await readBody(event)) ?? {}
  if (typeof endpoint !== 'string' || !endpoint) throw createError({ statusCode: 400, statusMessage: 'Missing endpoint' })
  if (!isPushEndpointAllowed(endpoint)) throw createError({ statusCode: 400, statusMessage: 'Not a push endpoint' })
  const store = useNotifier(settings)
  const subscription = await store.findSubscription(endpoint)
  if (!subscription) throw createError({ statusCode: 404, statusMessage: "This device isn't subscribed" })
  try {
    await createPushSender({ webpush, ...settings })(subscription, TEST_MESSAGE)
  } catch (error) {
    if (error?.statusCode === 404 || error?.statusCode === 410) {
      await store.deleteSubscription(subscription.id)
      throw createError({ statusCode: 410, statusMessage: 'This device has to turn notifications on again' })
    }
    throw createError({ statusCode: 502, statusMessage: 'The push service did not accept the notification' })
  }
  return { sent: true }
})
