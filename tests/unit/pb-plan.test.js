import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import {
  ARTICLES,
  CATEGORY_SEED,
  ownerRule,
  planSchema,
  planRequireCategory,
  planRules,
  resolveOwner,
  simulate,
  guessCategory,
  describeOp
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
    `addFields:${ARTICLES}`,
    `updateField:${ARTICLES}.price`
  ])
  assert.deepEqual(ops[2].fields.map(field => field.name), ['category', 'stock', 'low_stock_threshold'])
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
    'setRules:stock_movements',
    `setRules:${ARTICLES}`,
    'setRules:budget_tracker_transactions'
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
