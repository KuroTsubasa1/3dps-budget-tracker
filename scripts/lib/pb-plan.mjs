// Pure planning for the PocketBase 0.22 schema migration (no network); see scripts/pb-migrate.mjs
export const ARTICLES = 'budget_tracket_catalog'
export const TRANSACTIONS = 'budget_tracker_transactions'
export const OWNER_RULE = '@request.auth.id != "" && @request.auth.collectionName = "users"'

export const CATEGORY_SEED = [
  ['GatchaPon', 4], ['Keychain', 4], ['Mini Figure', 8], ['Big Figure', 30], ['Pokeball', 30],
  ['CardridgeCase', 30], ['Coaster', 8], ['Bookmark', 5], ['Walldisplay', 30]
].map(([name, basePrice], index) => ({ name, base_price: basePrice, sort_order: index }))

const text = (name, required = false) =>
  ({ name, type: 'text', required, presentable: false, options: { min: null, max: null, pattern: '' } })
const number = (name, { required = false, min = null, noDecimal = false } = {}) =>
  ({ name, type: 'number', required, presentable: false, options: { min, max: null, noDecimal } })
// collectionId may be '@<name>' for a collection that only exists after an earlier op
const relation = (name, collectionId, required = false) =>
  ({ name, type: 'relation', required, presentable: false, options: { collectionId, cascadeDelete: false, minSelect: null, maxSelect: 1, displayFields: null } })
const select = (name, values, required = false) =>
  ({ name, type: 'select', required, presentable: false, options: { maxSelect: 1, values } })

const byName = (collections, name) => collections.find(collection => collection.name === name)
const findField = (collection, name) => collection?.schema.find(field => field.name === name)

const RULES = {
  categories: { listRule: '', viewRule: '', createRule: OWNER_RULE, updateRule: OWNER_RULE, deleteRule: OWNER_RULE },
  stock_movements: { listRule: OWNER_RULE, viewRule: OWNER_RULE, createRule: OWNER_RULE, updateRule: null, deleteRule: null },
  [ARTICLES]: {
    listRule: `active = true || (${OWNER_RULE})`,
    viewRule: `active = true || (${OWNER_RULE})`,
    createRule: OWNER_RULE,
    updateRule: OWNER_RULE,
    deleteRule: OWNER_RULE
  },
  [TRANSACTIONS]: { listRule: OWNER_RULE, viewRule: OWNER_RULE, createRule: OWNER_RULE, updateRule: OWNER_RULE, deleteRule: OWNER_RULE }
}

export function planSchema (collections) {
  const articles = byName(collections, ARTICLES)
  if (!articles) throw new Error(`Collection ${ARTICLES} not found`)
  const ops = []

  // New collections get their final rules immediately: nothing deployed uses them yet
  if (!byName(collections, 'categories')) {
    ops.push({
      op: 'createCollection',
      name: 'categories',
      body: {
        name: 'categories',
        type: 'base',
        schema: [text('name', true), number('base_price', { required: true, min: 0 }), number('sort_order', { noDecimal: true })],
        indexes: ['CREATE UNIQUE INDEX `idx_categories_name` ON `categories` (`name`)'],
        ...RULES.categories
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
        ...RULES.stock_movements
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

export function planRules (collections) {
  return Object.entries(RULES)
    .filter(([name]) => byName(collections, name))
    .filter(([name, rules]) => Object.entries(rules).some(([key, value]) => byName(collections, name)[key] !== value))
    .map(([name, rules]) => ({ op: 'setRules', collection: name, rules }))
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
      result.push({ id: `sim_${op.name}`, ...structuredClone(op.body), schema: op.body.schema.map(field => ({ id: `sim_${op.name}_${field.name}`, ...field })) })
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
