import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import {
  ARTICLES,
  CATEGORY_SEED,
  planSchema,
  planRequireCategory,
  planRules,
  simulate,
  guessCategory,
  describeOp
} from '../../scripts/lib/pb-plan.mjs'

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

test('rules switch the existing collections to owner-only writes, and only once', () => {
  const afterSchema = simulate(current(), planSchema(current()))
  const ops = planRules(afterSchema)
  assert.deepEqual(opKeys(ops), [`setRules:${ARTICLES}`, 'setRules:budget_tracker_transactions'])
  assert.match(ops[0].rules.listRule, /^active = true \|\| \(/)
  assert.deepEqual(planRules(simulate(afterSchema, ops)), [])
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
