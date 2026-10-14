import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import {
  ARTICLES,
  TRANSACTIONS,
  CATEGORY_SEED,
  DEAL_SEED,
  ownerRule,
  planSchema,
  planRequireCategory,
  planRules,
  resolveOwner,
  simulate,
  guessCategory,
  describeOp,
  planDealSeed,
  planCommissionItems
} from '../../scripts/lib/pb-plan.mjs'

const OWNER_ID = 'owner0000000001'
const OWNER_EXPR = `@request.auth.collectionName = "users" && @request.auth.id = "${OWNER_ID}"`
const current = () => JSON.parse(readFileSync(new URL('../fixtures/pb-schema-current.json', import.meta.url)))
const opKeys = ops => ops.map(op => `${op.op}:${op.name || op.collection}${op.field ? `.${op.field}` : ''}`)

test('plans the new collections, article fields and optional price', () => {
  const ops = planSchema(current())
  assert.deepEqual(opKeys(ops), [
    'createCollection:categories',
    'createCollection:stock_movements',
    'createCollection:deals',
    'createCollection:commissions',
    'createCollection:print_jobs',
    `addFields:${ARTICLES}`,
    `updateField:${ARTICLES}.price`,
    `addFields:${TRANSACTIONS}`
  ])
  assert.deepEqual(ops[5].fields.map(field => field.name), ['category', 'stock', 'low_stock_threshold', 'target_stock'])
})

test('stock movements point at the articles collection', () => {
  const movements = planSchema(current()).find(op => op.name === 'stock_movements')
  const article = movements.body.schema.find(field => field.name === 'article')
  assert.equal(article.options.collectionId, 'i1f9o7q6bnjx6k8')
})

test('the article category starts optional and becomes required in a later step', () => {
  const afterSchema = simulate(current(), planSchema(current()))
  const category = afterSchema.find(c => c.name === ARTICLES).schema.find(f => f.name === 'category')
  assert.equal(category.required, false)
  assert.equal(category.options.collectionId, afterSchema.find(c => c.name === 'categories').id)

  const requireOps = planRequireCategory(afterSchema)
  assert.deepEqual(opKeys(requireOps), [`updateField:${ARTICLES}.category`])
  assert.deepEqual(planRequireCategory(simulate(afterSchema, requireOps)), [])
})

test('planning again after applying is a no-op', () => {
  const ops = planSchema(current())
  assert.deepEqual(planSchema(simulate(current(), ops)), [])
})

test('new collections are created with locked write rules until --apply-rules', () => {
  const [categories, movements] = planSchema(current()).filter(op => op.op === 'createCollection')
  assert.deepEqual(
    { listRule: categories.body.listRule, viewRule: categories.body.viewRule, createRule: categories.body.createRule, updateRule: categories.body.updateRule, deleteRule: categories.body.deleteRule },
    { listRule: '', viewRule: '', createRule: null, updateRule: null, deleteRule: null }
  )
  for (const key of ['listRule', 'viewRule', 'createRule', 'updateRule', 'deleteRule']) {
    assert.equal(movements.body[key], null, `stock_movements.${key}`)
  }
})

test('rules pin the owner record id, close sign-up first, and apply only once', () => {
  const afterSchema = simulate(current(), planSchema(current()))
  const ops = planRules(afterSchema, OWNER_ID)
  assert.deepEqual(opKeys(ops), [
    'setRules:users',
    'setRules:categories',
    'setRules:deals',
    'setRules:stock_movements',
    `setRules:${ARTICLES}`,
    'setRules:budget_tracker_transactions',
    'setRules:commissions',
    'setRules:print_jobs'
  ])
  assert.deepEqual(planRules(simulate(afterSchema, ops), OWNER_ID), [])
})

test('the users rule change only closes sign-up', () => {
  const afterSchema = simulate(current(), planSchema(current()))
  const [users] = planRules(afterSchema, OWNER_ID)
  assert.deepEqual(users.rules, { createRule: null })
})

test('the articles list rule keeps active articles public and owner-only otherwise', () => {
  const afterSchema = simulate(current(), planSchema(current()))
  const articles = planRules(afterSchema, OWNER_ID).find(op => op.collection === ARTICLES)
  assert.equal(articles.rules.listRule, `active = true || (${OWNER_EXPR})`)
  assert.equal(articles.rules.viewRule, `active = true || (${OWNER_EXPR})`)
  assert.equal(articles.rules.updateRule, OWNER_EXPR)
})

test('ownerRule only accepts a PocketBase record id', () => {
  assert.equal(ownerRule(OWNER_ID), OWNER_EXPR)
  assert.throws(() => ownerRule('x" || 1=1'), /Invalid owner id/)
  assert.throws(() => ownerRule('OWNER0000000001'), /Invalid owner id/)
})

test('resolveOwner: an explicit email wins, matched case-insensitively', () => {
  const users = [{ id: 'aaaaaaaaaaaaaaa', email: 'a@x.de' }, { id: 'bbbbbbbbbbbbbbb', email: 'Lasse@x.de' }]
  assert.equal(resolveOwner(users, 'lasse@X.de').id, 'bbbbbbbbbbbbbbb')
  assert.throws(() => resolveOwner(users, 'nobody@x.de'), /No user with email nobody@x.de in "users"/)
})

test('resolveOwner: no users is an error', () => {
  assert.throws(() => resolveOwner([]), /No owner account in "users"\. Create it in the PocketBase admin first\./)
})

test('resolveOwner: a single user is the owner', () => {
  const user = { id: 'aaaaaaaaaaaaaaa', email: 'a@x.de' }
  assert.equal(resolveOwner([user]), user)
})

test('resolveOwner: several users without --owner is an error that lists them', () => {
  const users = [{ id: 'aaaaaaaaaaaaaaa', email: 'a@x.de' }, { id: 'bbbbbbbbbbbbbbb', email: 'b@x.de' }]
  assert.throws(() => resolveOwner(users), /a@x\.de, b@x\.de[\s\S]*Pass --owner <email> to choose the owner account/)
})

test('the seed matches the agreed categories and base prices', () => {
  assert.deepEqual(CATEGORY_SEED.map(c => [c.name, c.base_price]), [
    ['GatchaPon', 4], ['Keychain', 4], ['Mini Figure', 8], ['Big Figure', 30], ['Pokeball', 30],
    ['CardridgeCase', 30], ['Coaster', 8], ['Bookmark', 5], ['Walldisplay', 30]
  ])
})

test('article names map to a best-guess category', () => {
  assert.equal(guessCategory('Pokeball Variante 1'), 'Pokeball')
  assert.equal(guessCategory('Pokemon Frame'), 'Walldisplay')
  assert.equal(guessCategory('Glurak Schlüsselanhänger'), 'Keychain')
  assert.equal(guessCategory('Something else'), null)
})

test('a missing articles collection is an error, not an empty plan', () => {
  assert.throws(() => planSchema(current().filter(c => c.name !== ARTICLES)), /budget_tracket_catalog not found/)
})

test('ops describe themselves for the dry run', () => {
  const [first] = planSchema(current())
  assert.equal(describeOp(first), 'create collection "categories" (name, base_price, sort_order)')
})

test('deals reference categories, may hold several, and start publicly readable but locked', () => {
  const afterSchema = simulate(current(), planSchema(current()))
  const deals = afterSchema.find(c => c.name === 'deals')
  const categories = deals.schema.find(f => f.name === 'categories')
  assert.equal(categories.options.collectionId, afterSchema.find(c => c.name === 'categories').id)
  assert.equal(categories.options.maxSelect, null)
  assert.equal(categories.required, true)
  assert.deepEqual(deals.schema.find(f => f.name === 'type').options.values, ['bundle', 'group'])
  assert.equal(deals.schema.find(f => f.name === 'min_qty').options.min, 2)
  assert.deepEqual(
    [deals.listRule, deals.viewRule, deals.createRule, deals.updateRule, deals.deleteRule],
    ['', '', null, null, null]
  )
})

test('owner rules open deal writes to the owner only', () => {
  const afterSchema = simulate(current(), planSchema(current()))
  const deals = planRules(afterSchema, OWNER_ID).find(op => op.collection === 'deals')
  assert.deepEqual(deals.rules, { listRule: '', viewRule: '', createRule: OWNER_EXPR, updateRule: OWNER_EXPR, deleteRule: OWNER_EXPR })
})

const CATEGORY_RECORDS = ['Keychain', 'Mini Figure', 'Coaster', 'Bookmark', 'Big Figure', 'Pokeball', 'CardridgeCase']
  .map((name, index) => ({ id: `cat${String(index).padStart(12, '0')}`, name }))
const idOf = name => CATEGORY_RECORDS.find(category => category.name === name).id

test('the deal seed matches the agreed price list', () => {
  assert.deepEqual(DEAL_SEED.map(deal => [deal.name, deal.type, deal.categoryNames, deal.min_qty, deal.price]), [
    ['Keychain 2 for 7', 'bundle', ['Keychain'], 2, 7],
    ['Mini Figure 2 for 15', 'bundle', ['Mini Figure'], 2, 15],
    ['Coaster 2 for 15', 'bundle', ['Coaster'], 2, 15],
    ['Bookmark 2 for 9', 'bundle', ['Bookmark'], 2, 9],
    ['Big items', 'group', ['Big Figure', 'Pokeball', 'CardridgeCase'], 2, 25]
  ])
})

test('seeding maps category names to ids', () => {
  const { create, skipped } = planDealSeed([], CATEGORY_RECORDS)
  assert.deepEqual(skipped, [])
  assert.equal(create.length, 5)
  assert.deepEqual(create[4], { name: 'Big items', type: 'group', categories: [idOf('Big Figure'), idOf('Pokeball'), idOf('CardridgeCase')], min_qty: 2, price: 25 })
})

test('seeding skips a deal whose category already has a deal, so re-runs change nothing', () => {
  const first = planDealSeed([], CATEGORY_RECORDS).create
  assert.deepEqual(planDealSeed(first, CATEGORY_RECORDS), {
    create: [],
    skipped: first.map(deal => ({ name: deal.name, reason: 'a category already has a deal' }))
  })
})

test('seeding skips a deal whose category does not exist', () => {
  const { create, skipped } = planDealSeed([], CATEGORY_RECORDS.filter(category => category.name !== 'Bookmark'))
  assert.equal(create.length, 4)
  assert.deepEqual(skipped, [{ name: 'Bookmark 2 for 9', reason: 'category Bookmark not found' }])
})

test('commissions are created locked and reference the articles', () => {
  const afterSchema = simulate(current(), planSchema(current()))
  const commissions = afterSchema.find(c => c.name === 'commissions')
  const field = name => commissions.schema.find(f => f.name === name)
  assert.equal(field('article').options.collectionId, 'i1f9o7q6bnjx6k8')
  assert.equal(field('article').options.maxSelect, 1)
  assert.equal(field('customer_email').type, 'email')
  assert.deepEqual(field('fulfilment').options.values, ['pickup', 'shipping'])
  assert.deepEqual(field('status').options.values, ['open', 'printing', 'ready', 'delivered', 'cancelled'])
  assert.equal(field('quantity').options.min, 1)
  for (const name of ['delivered_at', 'cancelled_at', 'anonymised_at']) assert.equal(field(name).type, 'date', name)
  assert.deepEqual(
    [commissions.listRule, commissions.viewRule, commissions.createRule, commissions.updateRule, commissions.deleteRule],
    [null, null, null, null, null]
  )
})

test('owner rules give the owner, and only the owner, every commission permission', () => {
  const afterSchema = simulate(current(), planSchema(current()))
  const commissions = planRules(afterSchema, OWNER_ID).find(op => op.collection === 'commissions')
  assert.deepEqual(commissions.rules, { listRule: OWNER_EXPR, viewRule: OWNER_EXPR, createRule: OWNER_EXPR, updateRule: OWNER_EXPR, deleteRule: OWNER_EXPR })
})

test('print jobs are created locked, reference the articles, and the new fields exist', () => {
  const afterSchema = simulate(current(), planSchema(current()))
  const jobs = afterSchema.find(c => c.name === 'print_jobs')
  const field = name => jobs.schema.find(f => f.name === name)
  assert.equal(field('article').options.collectionId, 'i1f9o7q6bnjx6k8')
  assert.equal(field('article').options.maxSelect, 1)
  assert.equal(field('article').required, true)
  assert.deepEqual(field('quantity').options, { min: 1, max: null, noDecimal: true })
  assert.equal(field('quantity').required, true)
  assert.deepEqual(field('status').options.values, ['printing', 'done'])
  assert.equal(field('status').required, true)
  assert.equal(field('done_at').type, 'date')
  assert.deepEqual(
    [jobs.listRule, jobs.viewRule, jobs.createRule, jobs.updateRule, jobs.deleteRule],
    [null, null, null, null, null]
  )
  const target = afterSchema.find(c => c.name === ARTICLES).schema.find(f => f.name === 'target_stock')
  assert.deepEqual(target.options, { min: 0, max: null, noDecimal: true })
  assert.equal(target.required, false)
  assert.equal(afterSchema.find(c => c.name === 'commissions').schema.find(f => f.name === 'ready_at').type, 'date')
})

test('the print_jobs create op carries its article index', () => {
  const op = planSchema(current()).find(item => item.op === 'createCollection' && item.name === 'print_jobs')
  assert.ok(op, 'print_jobs create op exists')
  assert.deepEqual(op.body.indexes, ['CREATE INDEX `idx_print_jobs_article` ON `print_jobs` (`article`)'])
})

test('owner rules give the owner, and only the owner, every print job permission', () => {
  const afterSchema = simulate(current(), planSchema(current()))
  const jobs = planRules(afterSchema, OWNER_ID).find(op => op.collection === 'print_jobs')
  assert.deepEqual(jobs.rules, { listRule: OWNER_EXPR, viewRule: OWNER_EXPR, createRule: OWNER_EXPR, updateRule: OWNER_EXPR, deleteRule: OWNER_EXPR })
})

// The live server after the commissions sub-project: no print_jobs, no target_stock, commissions without ready_at
const afterCommissions = () => {
  const collections = simulate(current(), planSchema(current())).filter(c => c.name !== 'print_jobs')
  const strip = (name, fieldName) => {
    const collection = collections.find(c => c.name === name)
    collection.schema = collection.schema.filter(f => f.name !== fieldName)
  }
  strip('commissions', 'ready_at')
  strip(ARTICLES, 'target_stock')
  return collections
}

test('a server migrated for commissions gains ready_at, print_jobs and target_stock exactly once', () => {
  const ops = planSchema(afterCommissions())
  assert.deepEqual(opKeys(ops), ['addFields:commissions', 'createCollection:print_jobs', `addFields:${ARTICLES}`])
  assert.deepEqual(ops[0].fields.map(field => [field.name, field.type]), [['ready_at', 'date']])
  assert.deepEqual(ops[2].fields.map(field => field.name), ['target_stock'])
  assert.deepEqual(planSchema(simulate(afterCommissions(), ops)), [])
})

const ITEMS_FIELD = { name: 'items', type: 'json', required: false, presentable: false, options: { maxSize: 2000000 } }

test('a fresh install creates commissions with items and an optional article and quantity', () => {
  const op = planSchema(current()).find(item => item.op === 'createCollection' && item.name === 'commissions')
  const field = name => op.body.schema.find(f => f.name === name)
  assert.deepEqual(field('items'), ITEMS_FIELD)
  assert.equal(field('article').required, false)
  assert.equal(field('article').options.collectionId, 'i1f9o7q6bnjx6k8')
  assert.equal(field('quantity').required, false)
  assert.deepEqual(field('quantity').options, { min: 1, max: null, noDecimal: true })
})

// The live server after the print board: commissions without items, article and quantity still required
const afterPrintBoard = () => {
  const collections = simulate(current(), planSchema(current()))
  const commissions = collections.find(c => c.name === 'commissions')
  commissions.schema = commissions.schema
    .filter(f => f.name !== 'items')
    .map(f => (f.name === 'article' || f.name === 'quantity' ? { ...f, required: true } : f))
  return collections
}

test('a server migrated for the print board gains items and an optional article and quantity exactly once', () => {
  const ops = planSchema(afterPrintBoard())
  assert.deepEqual(opKeys(ops), ['addFields:commissions', 'updateField:commissions.article', 'updateField:commissions.quantity'])
  assert.deepEqual(ops[0].fields, [ITEMS_FIELD])
  assert.deepEqual(ops.slice(1).map(op => op.patch), [{ required: false }, { required: false }])
  assert.equal(describeOp(ops[1]), 'change "commissions.article": {"required":false}')
  assert.deepEqual(planSchema(simulate(afterPrintBoard(), ops)), [])
})

const PLAN_ARTICLES = [{ id: 'k1', name: 'Pikachu Keychain' }, { id: 'f1', name: 'Glurak Figure' }]

test('legacy commissions convert to one line and converted ones are skipped', () => {
  const commissions = [
    { id: 'c1', article: 'k1', quantity: 2, items: null },
    { id: 'c2', article: 'f1', quantity: 1, items: [] },
    { id: 'c3', article: 'k1', quantity: 1, items: [{ article: 't1', name: 'Totoro', quantity: 1 }] },
    { id: 'c4', article: '', quantity: 0, items: [{ article: 'k1', name: 'Pikachu Keychain', quantity: 3 }] }
  ]
  assert.deepEqual(planCommissionItems(commissions, PLAN_ARTICLES), [
    { id: 'c1', patch: { items: [{ article: 'k1', name: 'Pikachu Keychain', quantity: 2 }] } },
    { id: 'c2', patch: { items: [{ article: 'f1', name: 'Glurak Figure', quantity: 1 }] } }
  ])
})

test('a legacy commission whose article is gone converts as Unknown article', () => {
  assert.deepEqual(planCommissionItems([{ id: 'c1', article: 'zzzzzzzzzzzzzzz', quantity: 4 }], PLAN_ARTICLES), [
    { id: 'c1', patch: { items: [{ article: 'zzzzzzzzzzzzzzz', name: 'Unknown article', quantity: 4 }] } }
  ])
})

test('converting again after applying changes nothing', () => {
  const commissions = [{ id: 'c1', article: 'k1', quantity: 2, items: null }, { id: 'c2', article: '', quantity: 0, items: null }]
  const patches = planCommissionItems(commissions, PLAN_ARTICLES)
  assert.equal(patches.length, 1)
  const applied = commissions.map(commission => ({ ...commission, ...patches.find(item => item.id === commission.id)?.patch }))
  assert.deepEqual(planCommissionItems(applied, PLAN_ARTICLES), [])
})

const DATE_FIELD = { name: 'date', type: 'text', required: false, presentable: false, options: { min: null, max: null, pattern: '^\\d{4}-\\d{2}-\\d{2}$' } }
const live = () => JSON.parse(readFileSync(new URL('../../pocketbase/schema.json', import.meta.url)))

test('transactions gain an optional sale date field', () => {
  const op = planSchema(current()).find(item => item.op === 'addFields' && item.collection === TRANSACTIONS)
  assert.deepEqual(op.fields, [DATE_FIELD])
  assert.ok(new RegExp(DATE_FIELD.options.pattern).test('2026-10-14'))
  assert.equal(describeOp(op), `add to "${TRANSACTIONS}": date`)
})

test('the live schema needs exactly the transaction date field, and only once', () => {
  const ops = planSchema(live())
  assert.deepEqual(ops, [{ op: 'addFields', collection: TRANSACTIONS, fields: [DATE_FIELD] }])
  assert.deepEqual(planSchema(simulate(live(), ops)), [])
})
