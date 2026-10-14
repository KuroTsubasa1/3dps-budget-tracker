import { gotoReady } from './fixtures.js'

// Conventions seen on Wednesday 14 October 2026 at 13:00 in Berlin.
// Specs that use them run with `test.use({ timezoneId: CALENDAR_TIMEZONE })`.
export const CALENDAR_TIMEZONE = 'Europe/Berlin'
export const CALENDAR_NOW = new Date('2026-10-14T13:00:00+02:00')

// A record as PocketBase 0.22 returns it: dates as 'YYYY-MM-DD 00:00:00.000Z', empty fields as ''
export const convention = (id, overrides = {}) => ({
  id,
  collectionName: 'conventions',
  name: id,
  city: '',
  venue: '',
  hall: '',
  table: '',
  starts_on: '',
  ends_on: '',
  status: 'interested',
  applications_open: '',
  applications_close: '',
  results_expected: '',
  setup_at: '',
  stand_fee: 0,
  fee_paid_at: '',
  fee_transaction: '',
  reminders: [],
  created: '2026-10-01 10:00:00.000Z',
  updated: '2026-10-01 10:00:00.000Z',
  ...overrides
})
const day = value => `${value} 00:00:00.000Z`

export const DOKOMI = convention('dokomi000000001', {
  name: 'Dokomi',
  city: 'Düsseldorf',
  venue: 'Messe',
  hall: 'Hall 4',
  table: 'B12',
  status: 'booked',
  starts_on: day('2026-11-07'),
  ends_on: day('2026-11-08'),
  stand_fee: 45
})
export const CONNICHI = convention('connichi0000001', {
  name: 'Connichi',
  city: 'Wiesbaden',
  status: 'interested',
  starts_on: day('2027-09-10'),
  ends_on: day('2027-09-12'),
  applications_close: day('2026-10-21')
})
export const HANAMI = convention('hanami000000001', {
  name: 'Hanami Fest',
  status: 'interested',
  applications_close: day('2026-12-01')
})
export const MEGACON = convention('megacon00000001', {
  name: 'MegaCon',
  status: 'applied',
  starts_on: day('2026-11-21'),
  ends_on: day('2026-11-22'),
  results_expected: day('2026-10-20')
})
export const LASTYEAR = convention('lastyear0000001', { name: 'Animagic', status: 'booked', starts_on: day('2026-08-01'), ends_on: day('2026-08-02') })
export const REJECTED = convention('rejected0000001', { name: 'Comic Con', status: 'rejected', starts_on: day('2026-12-05') })
export const CONVENTIONS = [DOKOMI, CONNICHI, HANAMI, MEGACON, LASTYEAR, REJECTED]

// Seeds the conventions; `before` runs after seeding (to break a collection or add records),
// then the page opens with the clock fixed at CALENDAR_NOW
export async function openCalendar (page, api, { conventions = CONVENTIONS, before, path = '/calendar' } = {}) {
  api.seed({ conventions })
  if (before) before(api)
  await page.clock.setFixedTime(CALENDAR_NOW)
  await gotoReady(page, path)
}

export const sheet = page => page.getByTestId('convention-sheet')
