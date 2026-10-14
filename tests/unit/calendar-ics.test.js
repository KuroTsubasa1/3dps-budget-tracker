import { test } from 'node:test'
import assert from 'node:assert/strict'
import { calendarFeed, escapeText, foldLine } from '../../utils/calendar/ics.js'

const NOW = new Date(Date.UTC(2026, 9, 14, 11, 0, 0))
const convention = (id, overrides) => ({
  id,
  name: id,
  status: 'booked',
  city: '',
  venue: '',
  hall: '',
  table: '',
  starts_on: '',
  ends_on: '',
  applications_close: '',
  setup_at: '',
  ...overrides
})
// Unfolded lines of the feed
const linesOf = feed => feed.replace(/\r\n /g, '').split('\r\n')
const eventsOf = feed => feed.split('BEGIN:VEVENT').slice(1).map(block => linesOf(`BEGIN:VEVENT${block}`).filter(line => line && line !== 'END:VCALENDAR'))

test('a booked convention is an all-day event whose DTEND is the day after its last day', () => {
  const feed = calendarFeed([convention('dokomi0000000001', {
    name: 'Dokomi',
    city: 'Düsseldorf',
    venue: 'Messe; Nord',
    hall: 'Hall 4',
    table: 'B12',
    starts_on: '2026-11-07 00:00:00.000Z',
    ends_on: '2026-11-08 00:00:00.000Z'
  })], { now: NOW })
  assert.ok(feed.startsWith('BEGIN:VCALENDAR\r\nVERSION:2.0\r\nPRODID:-//Akinai//Convention calendar//EN\r\n'))
  assert.ok(feed.endsWith('END:VCALENDAR\r\n'))
  assert.deepEqual(eventsOf(feed), [[
    'BEGIN:VEVENT',
    'UID:dokomi0000000001-event@akinai',
    'DTSTAMP:20261014T110000Z',
    'DTSTART;VALUE=DATE:20261107',
    'DTEND;VALUE=DATE:20261109',
    'SUMMARY:Dokomi (booked)',
    'LOCATION:Messe\\; Nord\\, Düsseldorf',
    'DESCRIPTION:Hall 4 · Table B12',
    'END:VEVENT'
  ]])
})

test('a one-day convention ends the next day, and a deadline is its own all-day event', () => {
  const feed = calendarFeed([convention('c1', { status: 'interested', starts_on: '2027-01-31', applications_close: '2026-12-31' })], { now: NOW })
  const [event, deadline] = eventsOf(feed)
  assert.ok(event.includes('DTSTART;VALUE=DATE:20270131'))
  assert.ok(event.includes('DTEND;VALUE=DATE:20270201'))
  assert.ok(event.includes('SUMMARY:c1 (interested)'))
  assert.deepEqual(deadline.slice(1), [
    'UID:c1-deadline@akinai',
    'DTSTAMP:20261014T110000Z',
    'DTSTART;VALUE=DATE:20261231',
    'DTEND;VALUE=DATE:20270101',
    'SUMMARY:Applications close: c1',
    'END:VEVENT'
  ])
})

test('the setup is a one-hour timed event in UTC', () => {
  const [, setup] = eventsOf(calendarFeed([convention('c1', { starts_on: '2026-11-07', setup_at: '2026-11-07 08:30:00.000Z', venue: 'Messe' })], { now: NOW }))
  assert.deepEqual(setup.slice(3), ['DTSTART:20261107T083000Z', 'DTEND:20261107T093000Z', 'SUMMARY:Setup: c1', 'LOCATION:Messe', 'END:VEVENT'])
})

test('rejected and cancelled conventions are left out', () => {
  const feed = calendarFeed([
    convention('rejected', { status: 'rejected', starts_on: '2026-11-07', applications_close: '2026-10-20' }),
    convention('cancelled', { status: 'cancelled', starts_on: '2026-11-07', setup_at: '2026-11-07 08:00:00.000Z' }),
    convention('applied', { status: 'applied', starts_on: '2026-11-07' })
  ], { now: NOW })
  assert.deepEqual(eventsOf(feed).map(event => event[1]), ['UID:applied-event@akinai'])
})

test('text is escaped as RFC 5545 asks', () => {
  assert.equal(escapeText('a\\b;c,d\ne'), 'a\\\\b\\;c\\,d\\ne')
})

test('long lines fold at 75 octets without splitting a character', () => {
  const line = `SUMMARY:${'商'.repeat(40)}`
  const folded = foldLine(line)
  const parts = folded.split('\r\n')
  assert.ok(parts.length > 1)
  for (const part of parts) assert.ok(Buffer.byteLength(part) <= 75, `${Buffer.byteLength(part)} octets`)
  assert.ok(parts.slice(1).every(part => part.startsWith(' ')))
  assert.equal(parts.map((part, index) => (index ? part.slice(1) : part)).join(''), line)
  assert.equal(foldLine('SHORT:x'), 'SHORT:x')
  // Exactly 75 octets stay on one line
  assert.equal(foldLine('X'.repeat(75)), 'X'.repeat(75))
  assert.equal(foldLine('X'.repeat(76)), `${'X'.repeat(75)}\r\n X`)
})

test('every line of a feed with long names stays within 75 octets', () => {
  const name = 'Supercalifragilisticexpialidocious Convention of Extremely Long Names, Part 2'
  const feed = calendarFeed([convention('c1', { name, starts_on: '2026-11-07', venue: name, city: name })], { now: NOW })
  for (const line of feed.split('\r\n')) assert.ok(Buffer.byteLength(line) <= 75, line)
  assert.ok(linesOf(feed).includes(`SUMMARY:${escapeText(`${name} (booked)`)}`))
})

test('a lone carriage return is escaped like a line break', () => {
  assert.equal(escapeText('a\rb\r\nc\nd'), 'a\\nb\\nc\\nd')
})
