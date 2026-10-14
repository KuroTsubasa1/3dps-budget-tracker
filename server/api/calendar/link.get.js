// GET /api/calendar/link: the path of the private calendar feed, for the owner only
import { notifierSettings } from '../../utils/notifierSettings.js'
import { requireCaller } from '../../utils/requireCaller.js'

export default defineEventHandler(async (event) => {
  const settings = notifierSettings(process.env)
  if (!settings.feed) throw createError({ statusCode: 503, statusMessage: "The calendar feed isn't configured on the server" })
  await requireCaller(event, settings)
  return { path: `/api/calendar/${settings.calendarSecret}.ics` }
})
