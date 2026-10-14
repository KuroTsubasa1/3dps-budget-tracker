// Pure planning for the PocketBase 0.22 schema migration (no network); see scripts/pb-migrate.mjs
export const ARTICLES = 'budget_tracket_catalog'
export const TRANSACTIONS = 'budget_tracker_transactions'
// Pins writes to one record in "users" (collection and id). The id is validated because it is spliced into the rule text.
// Combine it with other clauses only inside parentheses: `x || (<rule>)`.
export const ownerRule = (ownerId) => {
  if (!/^[a-z0-9]{15}$/.test(ownerId)) throw new Error(`Invalid owner id: ${ownerId}`)
  return `@request.auth.collectionName = "users" && @request.auth.id = "${ownerId}"`
}

export const CATEGORY_SEED = [
  ['GatchaPon', 4], ['Keychain', 4], ['Mini Figure', 8], ['Big Figure', 30], ['Pokeball', 30],
  ['CardridgeCase', 30], ['Coaster', 8], ['Bookmark', 5], ['Walldisplay', 30]
].map(([name, basePrice], index) => ({ name, base_price: basePrice, sort_order: index }))

export const DEAL_SEED = [
  { name: 'Keychain 2 for 7', type: 'bundle', categoryNames: ['Keychain'], min_qty: 2, price: 7 },
  { name: 'Mini Figure 2 for 15', type: 'bundle', categoryNames: ['Mini Figure'], min_qty: 2, price: 15 },
  { name: 'Coaster 2 for 15', type: 'bundle', categoryNames: ['Coaster'], min_qty: 2, price: 15 },
  { name: 'Bookmark 2 for 9', type: 'bundle', categoryNames: ['Bookmark'], min_qty: 2, price: 9 },
  { name: 'Big items', type: 'group', categoryNames: ['Big Figure', 'Pokeball', 'CardridgeCase'], min_qty: 2, price: 25 }
]

// One deal per category: a seed deal is skipped when any of its categories already belongs to a deal
export function planDealSeed (existingDeals, categories) {
  const taken = new Set(existingDeals.flatMap(deal => deal.categories))
  const create = []
  const skipped = []
  for (const seed of DEAL_SEED) {
    const ids = seed.categoryNames.map(name => categories.find(category => category.name === name)?.id)
    const missing = seed.categoryNames.find((name, index) => !ids[index])
    if (missing) {
      skipped.push({ name: seed.name, reason: `category ${missing} not found` })
    } else if (ids.some(id => taken.has(id))) {
      skipped.push({ name: seed.name, reason: 'a category already has a deal' })
    } else {
      ids.forEach(id => taken.add(id))
      create.push({ name: seed.name, type: seed.type, categories: ids, min_qty: seed.min_qty, price: seed.price })
    }
  }
  return { create, skipped }
}

const text = (name, required = false, pattern = '') =>
  ({ name, type: 'text', required, presentable: false, options: { min: null, max: null, pattern } })
const number = (name, { required = false, min = null, noDecimal = false } = {}) =>
  ({ name, type: 'number', required, presentable: false, options: { min, max: null, noDecimal } })
// collectionId may be '@<name>' for a collection that only exists after an earlier op
const relation = (name, collectionId, required = false, maxSelect = 1) =>
  ({ name, type: 'relation', required, presentable: false, options: { collectionId, cascadeDelete: false, minSelect: null, maxSelect, displayFields: null } })
const select = (name, values, required = false) =>
  ({ name, type: 'select', required, presentable: false, options: { maxSelect: 1, values } })
const email = (name, required = false) =>
  ({ name, type: 'email', required, presentable: false, options: { exceptDomains: null, onlyDomains: null } })
const date = name =>
  ({ name, type: 'date', required: false, presentable: false, options: { min: '', max: '' } })
const json = (name, { required = false, maxSize = 2000000 } = {}) =>
  ({ name, type: 'json', required, presentable: false, options: { maxSize } })
const url = (name, required = false) =>
  ({ name, type: 'url', required, presentable: false, options: { exceptDomains: null, onlyDomains: null } })

const byName = (collections, name) => collections.find(collection => collection.name === name)
const findField = (collection, name) => collection?.schema.find(field => field.name === name)

// Key order matters: sign-up on "users" is closed before anything else is pinned to the owner.
// With a notifier account the reminder job may also read and update conventions and read and delete
// push subscriptions; without one those two collections are the owner's alone.
const rulesFor = (ownerId, notifierId = null) => {
  const O = ownerRule(ownerId)
  if (notifierId && notifierId === ownerId) throw new Error('The notifier must be a different account from the owner')
  const ON = notifierId ? `(${O}) || (${ownerRule(notifierId)})` : O
  return {
    users: { createRule: null },
    categories: { listRule: '', viewRule: '', createRule: O, updateRule: O, deleteRule: O },
    deals: { listRule: '', viewRule: '', createRule: O, updateRule: O, deleteRule: O },
    stock_movements: { listRule: O, viewRule: O, createRule: O, updateRule: null, deleteRule: null },
    [ARTICLES]: { listRule: `active = true || (${O})`, viewRule: `active = true || (${O})`, createRule: O, updateRule: O, deleteRule: O },
    [TRANSACTIONS]: { listRule: O, viewRule: O, createRule: O, updateRule: O, deleteRule: O },
    commissions: { listRule: O, viewRule: O, createRule: O, updateRule: O, deleteRule: O },
    print_jobs: { listRule: O, viewRule: O, createRule: O, updateRule: O, deleteRule: O },
    conventions: { listRule: ON, viewRule: ON, createRule: O, updateRule: ON, deleteRule: O },
    push_subscriptions: { listRule: ON, viewRule: ON, createRule: O, updateRule: null, deleteRule: ON }
  }
}

// New collections exist before the owner is known, so they start admin-only (null); --apply-rules opens them to the owner
const LOCKED = { listRule: null, viewRule: null, createRule: null, updateRule: null, deleteRule: null }

export function planSchema (collections) {
  const articles = byName(collections, ARTICLES)
  if (!articles) throw new Error(`Collection ${ARTICLES} not found`)
  const ops = []

  // New collections start locked (admin-only writes); --apply-rules sets the owner rules
  if (!byName(collections, 'categories')) {
    ops.push({
      op: 'createCollection',
      name: 'categories',
      body: {
        name: 'categories',
        type: 'base',
        schema: [text('name', true), number('base_price', { required: true, min: 0 }), number('sort_order', { noDecimal: true })],
        indexes: ['CREATE UNIQUE INDEX `idx_categories_name` ON `categories` (`name`)'],
        ...LOCKED,
        listRule: '',
        viewRule: ''
      }
    })
  }
  if (!byName(collections, 'stock_movements')) {
    ops.push({
      op: 'createCollection',
      name: 'stock_movements',
      body: {
        name: 'stock_movements',
        type: 'base',
        // change is not "required": in 0.22 that would reject the 0 an empty-stock oversell records
        schema: [relation('article', articles.id, true), number('change', { noDecimal: true }), select('reason', ['sale', 'printed', 'correction'], true), text('note')],
        indexes: ['CREATE INDEX `idx_stock_movements_article` ON `stock_movements` (`article`)'],
        ...LOCKED
      }
    })
  }

  if (!byName(collections, 'deals')) {
    ops.push({
      op: 'createCollection',
      name: 'deals',
      body: {
        name: 'deals',
        type: 'base',
        // price is "required": 0 is rejected in 0.22, and a free deal is not a deal
        schema: [
          text('name', true),
          select('type', ['bundle', 'group'], true),
          relation('categories', '@categories', true, null),
          number('min_qty', { required: true, min: 2, noDecimal: true }),
          number('price', { required: true, min: 0 })
        ],
        indexes: [],
        ...LOCKED,
        listRule: '',
        viewRule: ''
      }
    })
  }

  const commissions = byName(collections, 'commissions')
  if (!commissions) {
    ops.push({
      op: 'createCollection',
      name: 'commissions',
      body: {
        name: 'commissions',
        type: 'base',
        // Customer data is personal: owner-only from the start (rules pinned by --apply-rules)
        schema: [
          text('customer_name', true),
          email('customer_email'),
          select('fulfilment', ['pickup', 'shipping'], true),
          text('address'),
          // Lines of a multi-article commission; article/quantity remain for records from before them
          json('items'),
          relation('article', articles.id),
          number('quantity', { min: 1, noDecimal: true }),
          number('agreed_price', { required: true, min: 0 }),
          text('notes'),
          select('status', ['open', 'printing', 'ready', 'delivered', 'cancelled'], true),
          date('delivered_at'),
          date('cancelled_at'),
          date('anonymised_at'),
          date('ready_at')
        ],
        indexes: [],
        ...LOCKED
      }
    })
  } else {
    const added = []
    // Servers migrated before the print board need the date behind "Done today"
    if (!findField(commissions, 'ready_at')) added.push(date('ready_at'))
    // Servers migrated before multi-article commissions need the line list
    if (!findField(commissions, 'items')) added.push(json('items'))
    if (added.length) ops.push({ op: 'addFields', collection: 'commissions', fields: added })
    // New commissions keep their lines in items and leave article/quantity empty
    for (const name of ['article', 'quantity']) {
      if (findField(commissions, name)?.required) ops.push({ op: 'updateField', collection: 'commissions', field: name, patch: { required: false } })
    }
  }

  if (!byName(collections, 'print_jobs')) {
    ops.push({
      op: 'createCollection',
      name: 'print_jobs',
      body: {
        name: 'print_jobs',
        type: 'base',
        schema: [
          relation('article', articles.id, true),
          number('quantity', { required: true, min: 1, noDecimal: true }),
          select('status', ['printing', 'done'], true),
          date('done_at')
        ],
        indexes: ['CREATE INDEX `idx_print_jobs_article` ON `print_jobs` (`article`)'],
        ...LOCKED
      }
    })
  }

  // Convention calendar: conventions with their reminders, and one record per device that gets push notifications
  if (!byName(collections, 'conventions')) {
    ops.push({
      op: 'createCollection',
      name: 'conventions',
      body: {
        name: 'conventions',
        type: 'base',
        // Dates are optional: an application can exist before its dates are known (booking needs both, checked in the app)
        schema: [
          text('name', true),
          text('city'),
          text('venue'),
          text('hall'),
          text('table'),
          date('starts_on'),
          date('ends_on'),
          select('status', ['interested', 'applied', 'booked', 'rejected', 'cancelled'], true),
          date('applications_open'),
          date('applications_close'),
          date('results_expected'),
          date('setup_at'),
          number('stand_fee', { min: 0 }),
          date('fee_paid_at'),
          text('fee_transaction'),
          json('reminders', { maxSize: 200000 })
        ],
        indexes: [],
        ...LOCKED
      }
    })
  }
  if (!byName(collections, 'push_subscriptions')) {
    ops.push({
      op: 'createCollection',
      name: 'push_subscriptions',
      body: {
        name: 'push_subscriptions',
        type: 'base',
        schema: [url('endpoint', true), json('keys', { required: true }), text('device')],
        indexes: ['CREATE UNIQUE INDEX `idx_push_subscriptions_endpoint` ON `push_subscriptions` (`endpoint`)'],
        ...LOCKED
      }
    })
  }

  const missing = []
  if (!findField(articles, 'category')) missing.push(relation('category', '@categories'))
  if (!findField(articles, 'stock')) missing.push(number('stock', { min: 0, noDecimal: true }))
  if (!findField(articles, 'low_stock_threshold')) missing.push(number('low_stock_threshold', { min: 0, noDecimal: true }))
  if (!findField(articles, 'target_stock')) missing.push(number('target_stock', { min: 0, noDecimal: true }))
  if (missing.length) ops.push({ op: 'addFields', collection: ARTICLES, fields: missing })

  if (findField(articles, 'price')?.required) {
    ops.push({ op: 'updateField', collection: ARTICLES, field: 'price', patch: { required: false } })
  }

  // The sale's local day (YYYY-MM-DD): a sale queued offline or uploaded later keeps it instead of
  // taking the day it reached the server. Optional, because older records only have `created`.
  const transactions = byName(collections, TRANSACTIONS)
  if (transactions) {
    const added = []
    if (!findField(transactions, 'date')) added.push(text('date', false, '^\\d{4}-\\d{2}-\\d{2}$'))
    // Reports: the sale's lines and its time. Optional, because older records have neither
    if (!findField(transactions, 'items')) added.push(json('items'))
    if (!findField(transactions, 'sold_at')) added.push(date('sold_at'))
    if (added.length) ops.push({ op: 'addFields', collection: TRANSACTIONS, fields: added })
  }
  return ops
}

// Run after every article has a category, otherwise existing records would fail validation on their next save
export function planRequireCategory (collections) {
  const category = findField(byName(collections, ARTICLES), 'category')
  return category && !category.required
    ? [{ op: 'updateField', collection: ARTICLES, field: 'category', patch: { required: true } }]
    : []
}

export const UNKNOWN_ARTICLE = 'Unknown article'

// Data conversion: every legacy commission (an article, no items yet) gets its one line.
// Commissions that already have items are skipped, so a re-run changes nothing.
export function planCommissionItems (commissions, articles) {
  return commissions
    .filter(commission => !(Array.isArray(commission.items) && commission.items.length) && commission.article)
    .map(commission => ({
      id: commission.id,
      patch: {
        items: [{
          article: commission.article,
          name: articles.find(article => article.id === commission.article)?.name ?? UNKNOWN_ARTICLE,
          quantity: Number(commission.quantity)
        }]
      }
    }))
}

export function planRules (collections, ownerId, notifierId = null) {
  return Object.entries(rulesFor(ownerId, notifierId))
    .filter(([name]) => byName(collections, name))
    .filter(([name, rules]) => Object.entries(rules).some(([key, value]) => byName(collections, name)[key] !== value))
    .map(([name, rules]) => ({ op: 'setRules', collection: name, rules }))
}

// users: [{ id, email }]. Several accounts need an explicit --owner email; a single account is taken as the owner.
export function resolveOwner (users, email) {
  if (email) {
    const wanted = email.toLowerCase()
    const match = users.find(user => String(user.email).toLowerCase() === wanted)
    if (!match) throw new Error(`No user with email ${email} in "users"`)
    return match
  }
  if (users.length === 0) throw new Error('No owner account in "users". Create it in the PocketBase admin first.')
  if (users.length === 1) return users[0]
  throw new Error(`Several accounts in "users": ${users.map(user => user.email).join(', ')}. Pass --owner <email> to choose the owner account.`)
}

// --apply-rules with --notifier: the owner must be named too, so the notifier is never taken for the owner
export function resolveAccounts (users, { owner, notifier } = {}) {
  if (notifier && !owner) throw new Error('Pass --owner <email> together with --notifier <email>, so the notifier is never taken for the owner.')
  const ownerAccount = resolveOwner(users, owner)
  if (!notifier) return { owner: ownerAccount, notifier: null }
  const notifierAccount = resolveOwner(users, notifier)
  if (notifierAccount.id === ownerAccount.id) throw new Error('The notifier must be a different account from the owner')
  return { owner: ownerAccount, notifier: notifierAccount }
}

export function resolveField (field, collections) {
  const target = field.options?.collectionId
  if (typeof target !== 'string' || !target.startsWith('@')) return field
  const collection = byName(collections, target.slice(1))
  if (!collection) throw new Error(`Relation target ${target.slice(1)} does not exist yet`)
  return { ...field, options: { ...field.options, collectionId: collection.id } }
}

// Applies ops to an in-memory copy; used by tests and to print what --apply would leave behind
export function simulate (collections, ops) {
  const result = structuredClone(collections)
  for (const op of ops) {
    if (op.op === 'createCollection') {
      result.push({ id: `sim_${op.name}`, ...structuredClone(op.body), schema: op.body.schema.map(field => ({ id: `sim_${op.name}_${field.name}`, ...resolveField(field, result) })) })
    } else if (op.op === 'addFields') {
      byName(result, op.collection).schema.push(...op.fields.map(field => ({ id: `sim_${field.name}`, ...resolveField(field, result) })))
    } else if (op.op === 'updateField') {
      Object.assign(findField(byName(result, op.collection), op.field), op.patch)
    } else if (op.op === 'setRules') {
      Object.assign(byName(result, op.collection), op.rules)
    }
  }
  return result
}

const GUESSES = [
  [/pokeball/, 'Pokeball'],
  [/keychain|schlüssel|anhänger/, 'Keychain'],
  [/gatcha|gacha/, 'GatchaPon'],
  [/coaster|untersetzer/, 'Coaster'],
  [/bookmark|lesezeichen/, 'Bookmark'],
  [/cartridge|cardridge|modul/, 'CardridgeCase'],
  [/frame|wall|rahmen/, 'Walldisplay'],
  [/mini/, 'Mini Figure'],
  [/figur/, 'Big Figure']
]

export const guessCategory = name =>
  GUESSES.find(([pattern]) => pattern.test(String(name).toLowerCase()))?.[1] ?? null

export function describeOp (op) {
  if (op.op === 'createCollection') return `create collection "${op.name}" (${op.body.schema.map(field => field.name).join(', ')})`
  if (op.op === 'addFields') return `add to "${op.collection}": ${op.fields.map(field => field.name).join(', ')}`
  if (op.op === 'updateField') return `change "${op.collection}.${op.field}": ${JSON.stringify(op.patch)}`
  return `set access rules on "${op.collection}"`
}
