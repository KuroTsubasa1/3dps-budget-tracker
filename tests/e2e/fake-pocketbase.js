// In-memory stand-in for the PocketBase 0.22 REST API, served through Playwright routes
export const OWNER = { id: 'owner1', collectionId: '_pb_users_auth_', collectionName: 'users', email: 'owner@example.com' }
export const OWNER_PASSWORD = 'correct-horse'

const base64url = value => Buffer.from(JSON.stringify(value)).toString('base64url')
// The SDK only reads the payload's exp to decide isValid, so the signature can be fake
export const FAKE_TOKEN = [
  base64url({ alg: 'HS256', typ: 'JWT' }),
  base64url({ id: OWNER.id, type: 'authRecord', collectionId: OWNER.collectionId, exp: 4102444800 }),
  'fake-signature'
].join('.')

const COLLECTIONS = ['categories', 'budget_tracket_catalog', 'stock_movements', 'budget_tracker_transactions', 'deals', 'commissions', 'print_jobs']
const OWNER_READ_ONLY = new Set(['stock_movements', 'budget_tracker_transactions', 'commissions', 'print_jobs'])
const DEFAULTS = {
  categories: { sort_order: 0 },
  budget_tracket_catalog: { collectionId: 'articles0000001', active: true, stock: 0, low_stock_threshold: 2, target_stock: 0, images: [], price: 0, description: '' },
  stock_movements: { note: '' },
  budget_tracker_transactions: { notes: '' },
  deals: {},
  commissions: { notes: '', address: '', items: [], delivered_at: '', cancelled_at: '', anonymised_at: '', ready_at: '' },
  print_jobs: { done_at: '' }
}

let counter = 0
const newId = () => `fake${String(++counter).padStart(11, '0')}`
const stamp = () => new Date(1_760_000_000_000 + counter * 1000).toISOString().replace('T', ' ')

const parseValue = (raw) => {
  const value = raw.trim()
  if (/^(['"]).*\1$/.test(value)) return value.slice(1, -1)
  if (value === 'true' || value === 'false') return value === 'true'
  return Number(value)
}

// Only what the app sends: `field = value` and `field >= value` clauses joined by && and ||, optionally in parentheses
const CLAUSE = /^\s*(\w+)\s*(>=|=)\s*(.+?)\s*$/
// Dates compare as text; the app writes ISO ("T") and PocketBase filters use a space
const asDateText = value => String(value ?? '').replace('T', ' ')
const matchesClause = (record, clause) => {
  const [, field, operator, raw] = clause.match(CLAUSE)
  const value = parseValue(raw)
  if (operator === '>=') return asDateText(record[field]) >= asDateText(value)
  return record[field] === value
}
const matchesFilter = (record, filter) =>
  !filter || filter.replace(/[()]/g, '').split('||').some(group => group.split('&&').every(clause => matchesClause(record, clause)))

const sortRecords = (records, sort) => {
  if (!sort) return records
  const keys = sort.split(',').map(key => key.trim()).filter(Boolean)
  return [...records].sort((a, b) => {
    for (const key of keys) {
      const desc = key.startsWith('-')
      const field = desc ? key.slice(1) : key
      if (a[field] < b[field]) return desc ? 1 : -1
      if (a[field] > b[field]) return desc ? -1 : 1
    }
    return 0
  })
}

// The SDK sends JSON, or multipart with an @jsonPayload part plus one part per file
const parseBody = (request) => {
  const raw = request.postData()
  if (!raw) return {}
  const type = request.headers()['content-type'] || ''
  if (!type.includes('multipart/form-data')) return JSON.parse(raw)
  const boundary = type.split('boundary=')[1]
  const body = {}
  for (const part of raw.split(`--${boundary}`)) {
    const name = part.match(/name="([^"]+)"/)?.[1]
    if (!name) continue
    const filename = part.match(/filename="([^"]*)"/)?.[1]
    if (name === '@jsonPayload') {
      Object.assign(body, JSON.parse(part.split('\r\n\r\n').slice(1).join('\r\n\r\n').trim()))
    } else if (filename !== undefined) {
      body[name] = [...(body[name] || []), filename]
    } else {
      body[name] = part.split('\r\n\r\n').slice(1).join('\r\n\r\n').replace(/\r\n$/, '')
    }
  }
  return body
}

// File fields accept PocketBase's `field+` (append) and `field-` (remove) modifiers
const applyChanges = (record, body) => {
  for (const [key, value] of Object.entries(body)) {
    if (key.endsWith('+')) record[key.slice(0, -1)] = [...(record[key.slice(0, -1)] || []), ...[].concat(value)]
    else if (key.endsWith('-')) record[key.slice(0, -1)] = (record[key.slice(0, -1)] || []).filter(item => ![].concat(value).includes(item))
    else record[key] = value
  }
  return record
}

export function createFakePocketBase () {
  const db = Object.fromEntries(COLLECTIONS.map(name => [name, []]))
  const failures = {}
  const readFailures = {}
  const delays = {}
  // Collections whose write replies drop `items`, like a server that has not been migrated yet
  const stripItems = new Set()
  const requests = []
  const state = { enabled: false }

  // Expand only the relations the app asks for: category (articles) and article (commissions, print jobs)
  const EXPANDABLE = { category: 'categories', article: 'budget_tracket_catalog' }
  const withExpand = (record, expand) => {
    const fields = String(expand || '').split(',').map(field => field.trim()).filter(field => EXPANDABLE[field] && record[field])
    if (!fields.length) return record
    return { ...record, expand: Object.fromEntries(fields.map(field => [field, db[EXPANDABLE[field]].find(item => item.id === record[field])])) }
  }

  async function handle (route) {
    const request = route.request()
    const url = new URL(request.url())
    const method = request.method()
    const authorization = request.headers().authorization || ''
    const body = parseBody(request)
    const expand = url.searchParams.get('expand')
    const reply = (status, json) => route.fulfill({ status, json })
    requests.push({ method, path: url.pathname, body, authorization })

    if (url.pathname === '/api/collections/users/auth-with-password') {
      return body.identity === OWNER.email && body.password === OWNER_PASSWORD
        ? reply(200, { token: FAKE_TOKEN, record: OWNER })
        : reply(400, { code: 400, message: 'Failed to authenticate.', data: {} })
    }
    if (url.pathname === '/api/collections/users/auth-refresh') {
      return authorization === FAKE_TOKEN
        ? reply(200, { token: FAKE_TOKEN, record: OWNER })
        : reply(401, { code: 401, message: 'The request requires valid record authorization token.', data: {} })
    }

    const match = url.pathname.match(/^\/api\/collections\/([^/]+)\/records(?:\/([^/]+))?$/)
    if (!match || !db[match[1]]) return reply(404, { code: 404, message: 'The requested resource wasn\'t found.', data: {} })
    const [, name, id] = match
    const records = db[name]
    const isOwner = authorization === FAKE_TOKEN

    if (method === 'GET') {
      if (readFailures[name]) return reply(readFailures[name], { code: readFailures[name], message: 'Only admins can perform this action.', data: {} })
      const perPage = Number(url.searchParams.get('perPage') || 30)
      if (OWNER_READ_ONLY.has(name) && !isOwner) return reply(200, { page: 1, perPage, totalItems: 0, totalPages: 0, items: [] })
      if (id) {
        const record = records.find(item => item.id === id)
        return record ? reply(200, withExpand(record, expand)) : reply(404, { code: 404, message: 'Not found.', data: {} })
      }
      const items = sortRecords(records.filter(record => matchesFilter(record, url.searchParams.get('filter'))), url.searchParams.get('sort'))
      // perPage must echo the request: getFullList keeps paging while items.length === perPage
      return reply(200, { page: 1, perPage, totalItems: items.length, totalPages: 1, items: items.slice(0, perPage).map(record => withExpand(record, expand)) })
    }

    // PocketBase 0.22 treats a missing or invalid token as a guest: a create that fails its rule
    // is a 400, an update or delete a 404. It never answers 401/403 here.
    if (!isOwner) {
      return method === 'POST'
        ? reply(400, { code: 400, message: 'Failed to create record.', data: {} })
        : reply(404, { code: 404, message: 'The requested resource wasn\'t found.', data: {} })
    }
    // 'drop' is one-shot: the write happens, then the reply is lost (the connection aborts)
    const drop = failures[name] === 'drop'
    // A failure is a status, or { status, data, once } to carry PocketBase field errors / fail a single write
    const failure = typeof failures[name] === 'object' ? failures[name] : { status: failures[name] }
    if (failure.status && !drop) {
      if (failure.once) failures[name] = 0
      return reply(failure.status, { code: failure.status, message: 'Forced failure.', data: failure.data ?? {} })
    }
    // One-shot slow write: the write happens now, its reply arrives after the delay
    const delay = delays[name]
    delays[name] = 0
    const done = async (status, json) => {
      if (stripItems.has(name)) { json = { ...json }; delete json.items }
      if (delay) await new Promise(resolve => setTimeout(resolve, delay))
      if (!drop) return reply(status, json)
      failures[name] = 0
      return route.abort()
    }

    if (method === 'POST') {
      if (body.id && records.some(record => record.id === body.id)) {
        return reply(400, { code: 400, message: 'Failed to create record.', data: { id: { code: 'validation_invalid_id', message: 'The model id is invalid or already exists.' } } })
      }
      const record = applyChanges({ ...DEFAULTS[name], id: newId(), collectionName: name, created: stamp(), updated: stamp() }, body)
      records.push(record)
      return done(200, withExpand(record, expand))
    }
    const record = records.find(item => item.id === id)
    if (!record) return reply(404, { code: 404, message: 'Not found.', data: {} })
    if (method === 'PATCH') return done(200, withExpand(applyChanges(record, { ...body, updated: stamp() }), expand))
    if (method === 'DELETE') {
      // Mirrors PocketBase: a required relation blocks deleting the referenced record
      if (name === 'categories' && (db.budget_tracket_catalog.some(article => article.category === id) || db.deals.some(deal => deal.categories.includes(id)))) {
        return reply(400, { code: 400, message: 'Failed to delete record. Make sure that the record is not part of a required relation reference.', data: {} })
      }
      records.splice(records.indexOf(record), 1)
      if (delay) await new Promise(resolve => setTimeout(resolve, delay))
      return route.fulfill({ status: 204 })
    }
    return reply(405, { code: 405, message: 'Method not allowed.', data: {} })
  }

  return { db, failures, readFailures, delays, stripItems, requests, state, handle }
}
