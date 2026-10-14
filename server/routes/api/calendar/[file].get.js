// GET /api/calendar/<secret>.ics: the private calendar feed. A wrong secret, or none set, is a 404.
import { notifierSettings } from '../../../utils/notifierSettings.js'
import { feedFileMatches } from '../../../utils/access.js'
import { useNotifier } from '../../../utils/notifier.js'
import { calendarFeed } from '../../../../utils/calendar/ics.js'

export default defineEventHandler(async (event) => {
  const settings = notifierSettings(process.env)
  if (!settings.feed || !feedFileMatches(getRouterParam(event, 'file') ?? '', settings.calendarSecret)) {
    throw createError({ statusCode: 404, statusMessage: 'Not found' })
  }
  let feed
  try {
    feed = calendarFeed(await useNotifier(settings).listConventions(), { now: new Date() })
  } catch {
    // Not the original error: it can carry the request URL, which holds the secret
    throw createError({ statusCode: 502, statusMessage: 'Calendar unavailable' })
  }
  setResponseHeader(event, 'Content-Type', 'text/calendar; charset=utf-8')
  setResponseHeader(event, 'Cache-Control', 'private, max-age=300')
  return feed
})
