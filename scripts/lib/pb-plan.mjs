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

const text = (name, required = false) =>
  ({ name, type: 'text', required, presentable: false, options: { min: null, max: null, pattern: '' } })
const number = (name, { required = false, min = null, noDecimal = false } = {}) =>
  ({ name, type: 'number', required, presentable: false, options: { min, max: null, noDecimal } })
// collectionId may be '@<name>' for a collection that only exists after an earlier op
const relation = (name, collectionId, required = false, maxSelect = 1) =>
  ({ name, type: 'relation', required, presentable: false, options: { collectionId, cascadeDelete: false, minSelect: null, maxSelect, displayFields: null } })
const select = (name, values, required = false) =>
  ({ name, type: 'select', required, presentable: false, options: { maxSelect: 1, values } })

const byName = (collections, name) => collections.find(collection => collection.name === name)
const findField = (collection, name) => collection?.schema.find(field => field.name === name)

// Key order matters: sign-up on "users" is closed before anything else is pinned to the owner
const rulesFor = (ownerId) => {
  const O = ownerRule(ownerId)
  return {
    users: { createRule: null },
    categories: { listRule: '', viewRule: '', createRule: O, updateRule: O, deleteRule: O },
    deals: { listRule: '', viewRule: '', createRule: O, updateRule: O, deleteRule: O },
    stock_movements: { listRule: O, viewRule: O, createRule: O, updateRule: null, deleteRule: null },
    [ARTICLES]: { listRule: `active = true || (${O})`, viewRule: `active = true || (${O})`, createRule: O, updateRule: O, deleteRule: O },
    [TRANSACTIONS]: { listRule: O, viewRule: O, createRule: O, updateRule: O, deleteRule: O }
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

  const missing = []
  if (!findField(articles, 'category')) missing.push(relation('category', '@categories'))
  if (!findField(articles, 'stock')) missing.push(number('stock', { min: 0, noDecimal: true }))
  if (!findField(articles, 'low_stock_threshold')) missing.push(number('low_stock_threshold', { min: 0, noDecimal: true }))
  if (missing.length) ops.push({ op: 'addFields', collection: ARTICLES, fields: missing })

  if (findField(articles, 'price')?.required) {
    ops.push({ op: 'updateField', collection: ARTICLES, field: 'price', patch: { required: false } })
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

export function planRules (collections, ownerId) {
  return Object.entries(rulesFor(ownerId))
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
