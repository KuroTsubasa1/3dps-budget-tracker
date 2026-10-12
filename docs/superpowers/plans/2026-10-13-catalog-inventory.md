# Catalog Management, Inventory and Owner Login Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let the owner log in and manage categories, articles and per-article stock (with a logged history) from the app, while the catalog stays publicly readable.

**Architecture:**
- The app talks to PocketBase 0.22 through the official JS SDK (`pocketbase@0.21.5`, the last line that supports 0.22). The owner signs in to the `users` collection, and PocketBase access rules enforce owner-only writes.
- Every stock change is a `stock_movements` record. 0.22 has no batch API, so the app always writes the movement first and then derives `stock` from the sum of the article's movements.
- Pure logic (pricing, movement maths, the migration planner) lives in `utils/` and `scripts/lib/` and is unit-tested with `node:test`. UI flows are tested with Playwright against an in-memory fake PocketBase.

**Tech Stack:** Nuxt 3.15 / Vue 3.5 `<script setup>`, Tailwind 3.4 tokens from the UI overhaul, PocketBase JS SDK 0.21.5, Playwright 1.63, Node 24 (`node:test`, `process.loadEnvFile`).

**Spec:** `docs/superpowers/specs/2026-10-13-catalog-inventory-design.md`

## Global Constraints

- **Server:** PocketBase **0.22** at `https://pocket.lasseharm.space`. Confirmed because `/api/admins/*` exists and `/api/collections/_superusers/*` returns 404. It has no batch API and uses the v0.22 collection format (`schema` array, `options` per field).
- **SDK:** `pocketbase@0.21.5`, pinned exactly.
  - The auth store key is `pocketbase_auth`, holding `{ token, model }`.
  - It sends `Authorization: <token>` with no `Bearer` prefix.
- **Collection names:**
  - Articles stay **`budget_tracket_catalog`** (typo kept).
  - New collections are `categories` and `stock_movements`.
  - Transactions stay `budget_tracker_transactions`.
- **Owner rule:** `@request.auth.id != "" && @request.auth.collectionName = "users"`.
- **Stock consistency:**
  - An article's `stock` is the sum of its movements, never below 0.
  - Oversell: a sale of `q` with stock `s < q` records `change = -s` with the note `oversold by (q - s)`, and the transaction keeps the full amount.
- **Effective price:** `price > 0` wins; otherwise the category's `base_price` applies. In PocketBase 0.22 an unset number field reads as `0`, so `0` means "no override".
- **Soft delete:** deleting an article sets `active = false`. Every catalog query filters on `active = true`.
- **Movement reasons:** `sale`, `printed` or `correction`. `printed` and `correction` changes must be non-zero. Only a sale from empty stock may record `change = 0`, and it carries the oversell note.
- **Category seed**, in this order, with these base prices: GatchaPon 4, Keychain 4, Mini Figure 8, Big Figure 30, Pokeball 30, CardridgeCase 30, Coaster 8, Bookmark 5, Walldisplay 30.
- **Admin token:** `POCKETBASE_ADMIN_TOKEN` lives only in the local `.env`. Only `scripts/pb-migrate.mjs` reads it. It is never `NUXT_PUBLIC_*`, never committed, and never sent to the app.
- **The migration is never run with `--apply` or `--apply-rules` by the implementer.** Those are the owner's steps. `--dry-run` may be shown to the owner if the token is present.
- **User-visible strings tests rely on:**
  - `Log in`, `Wrong email or password`, `Log out`, `Manage`, `+ New article`, `Out of stock`;
  - `N left`, `Low · N left`, `only N in stock`;
  - `Add printed`, `Correct count`, `Enter a name`, `Choose a category`.
- **UI-overhaul conventions still apply:**
  - semantic colour tokens only;
  - 44px tap targets;
  - `BottomSheet` for editors;
  - `gotoReady` in e2e tests;
  - 2-space indentation, single quotes, no semicolons.

## Review Focus

1. **Selling an article whose stock is already 0.** The sale goes through, a `sale` movement with `change: 0` and note `oversold by 1` is logged, and stock stays 0. *Pinned in Task 5: "selling from empty stock logs the oversell".*
2. **The owner's session expires while selling.** The transaction is kept locally and queued, and the toast says to log in again. Nothing is lost. *Pinned in Task 3: "an expired session keeps the transaction and asks to log in".*
3. **A sync retry after a partial failure** (the movement was saved but the stock update failed). The retry must not duplicate the transaction or the movement, and the stock ends correct. *Pinned in Task 5: "a retried sync does not duplicate the sale".*
4. **Deleting a category used only by hidden (soft-deleted) articles.** PocketBase refuses because the relation is required, and the owner sees a clear message instead of a silent failure. *Pinned in Task 7: "a category used by hidden articles explains why it cannot be deleted".*
5. **A login link with a foreign redirect** (`/login?redirect=//evil.example`). After login the app stays on this site. *Pinned in Task 3: "a redirect to another site is ignored".*

## Working setup (read before Task 1)

- The owner's `nuxt dev` server serves this checkout on :3000, and Playwright reuses it. Never stop it. If a newly installed dependency fails to resolve in the dev server (Task 3 installs `pocketbase`), ask the owner to restart `nuxt dev`.
- Commands:
  - e2e: `npx playwright test <file>` (both projects) or with `--project=mobile|chromium`;
  - unit: `npm run test:unit`.
- The production-build check at the end (Task 8) builds in a scratch git worktree served on :3100 with a temporary Playwright config, as in the UI-overhaul plan, so the dev server's `.nuxt` is untouched.

## File map

| File | Responsibility | Task |
|---|---|---|
| `utils/pricing.js` | `effectivePrice()` | 1 |
| `utils/inventory.js` | movement maths, `stockStatus()`, `newRecordId()` | 1 |
| `tests/unit/*.test.js` | `node:test` unit tests | 1, 2 |
| `scripts/lib/pb-plan.mjs` | pure migration planner (schema, rules, simulate, mapping guesses) | 2 |
| `scripts/pb-migrate.mjs` | CLI: dry run, `--apply`, `--apply-rules`, schema snapshot | 2 |
| `tests/fixtures/pb-schema-current.json` | v0.22 collections fixture for planner tests | 2 |
| `tests/e2e/fake-pocketbase.js` | in-memory PocketBase REST stand-in for e2e | 3 |
| `tests/e2e/fixtures.js` | `api` fixture on top of the fake, `owner` option, helpers | 3, 5 |
| `composables/usePocketBase.js`, `composables/useAuth.js` | SDK client, session | 3 |
| `middleware/owner.js`, `pages/login.vue` | gating and login | 3 |
| `composables/useTransactions.js` | owner auth header, movements on sync | 3, 5 |
| `composables/useArticles.js`, `composables/useCategories.js` | articles and categories data access | 4, 6, 7 |
| `pages/catalog.vue`, `components/CartPanel.vue` | chips, prices, stock badges, checkout, manage mode | 4, 5, 6 |
| `composables/useInventory.js` | apply movements, recompute stock, history | 5 |
| `components/ArticleSheet.vue`, `components/InventoryPanel.vue` | article editor and stock actions | 6 |
| `components/CategoryManager.vue`, `pages/settings.vue` | categories in Settings | 7 |

---

### Task 1: Pricing and stock maths

**Files:**
- Create: `utils/pricing.js`, `utils/inventory.js`
- Create: `tests/unit/pricing.test.js`, `tests/unit/inventory.test.js`
- Modify: `package.json` (add the `test:unit` script)

**Interfaces:**
- Produces:
  - `effectivePrice(article: { price }, category?: { base_price }): number`
  - `saleMovement(stock: number, quantity: number): { change, reason: 'sale', note }`
  - `printedMovement(count: number): { change, reason: 'printed', note: '' }`, which throws `Error('Printed count must be a whole number above 0')`
  - `correctionMovement(stock: number, target: number, note?: string): { change, reason: 'correction', note } | null`, which throws `Error('Stock count must be a whole number of 0 or more')` and returns `null` when nothing changes
  - `stockFromMovements(movements: Array<{ change }>): number`
  - `stockStatus(stock: number, threshold: number): 'out' | 'low' | 'ok'`
  - `newRecordId(): string`, 15 characters of `[a-z0-9]`, a valid PocketBase id

- [ ] **Step 1: Add the unit test script**

In `package.json` `scripts`, after `"test:e2e": "playwright test"`, add a comma and:

```json
    "test:unit": "node --test tests/unit/"
```

- [ ] **Step 2: Write the failing tests**

`tests/unit/pricing.test.js`:

```js
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { effectivePrice } from '../../utils/pricing.js'

const keychain = { base_price: 4 }

test('article price above 0 overrides the category', () => {
  assert.equal(effectivePrice({ price: 6 }, keychain), 6)
})

test('price 0 or missing falls back to the category base price', () => {
  assert.equal(effectivePrice({ price: 0 }, keychain), 4)
  assert.equal(effectivePrice({}, keychain), 4)
})

test('no category and no price is 0', () => {
  assert.equal(effectivePrice({ price: 0 }, undefined), 0)
})
```

`tests/unit/inventory.test.js`:

```js
import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  saleMovement,
  printedMovement,
  correctionMovement,
  stockFromMovements,
  stockStatus,
  newRecordId
} from '../../utils/inventory.js'

test('a sale within stock deducts the quantity', () => {
  assert.deepEqual(saleMovement(5, 2), { change: -2, reason: 'sale', note: '' })
})

test('an oversell deducts what is left and notes the rest', () => {
  assert.deepEqual(saleMovement(1, 3), { change: -1, reason: 'sale', note: 'oversold by 2' })
})

test('selling from empty stock records a zero change with the oversell note', () => {
  assert.deepEqual(saleMovement(0, 1), { change: 0, reason: 'sale', note: 'oversold by 1' })
})

test('printed counts must be whole numbers above 0', () => {
  assert.deepEqual(printedMovement(3), { change: 3, reason: 'printed', note: '' })
  assert.throws(() => printedMovement(0), /whole number above 0/)
  assert.throws(() => printedMovement(1.5), /whole number above 0/)
  assert.throws(() => printedMovement(NaN), /whole number above 0/)
})

test('a correction records the difference to the target', () => {
  assert.deepEqual(correctionMovement(5, 1, 'recount'), { change: -4, reason: 'correction', note: 'recount' })
  assert.deepEqual(correctionMovement(0, 3), { change: 3, reason: 'correction', note: '' })
})

test('a correction to the current count is not a movement', () => {
  assert.equal(correctionMovement(4, 4), null)
})

test('a correction target must be a whole number of 0 or more', () => {
  assert.throws(() => correctionMovement(4, -1), /0 or more/)
  assert.throws(() => correctionMovement(4, 2.5), /0 or more/)
})

test('stock is the sum of movements and never negative', () => {
  assert.equal(stockFromMovements([{ change: 5 }, { change: -2 }, { change: 0 }]), 3)
  assert.equal(stockFromMovements([{ change: 1 }, { change: -3 }]), 0)
  assert.equal(stockFromMovements([]), 0)
})

test('stock status uses the low-stock threshold', () => {
  assert.equal(stockStatus(0, 2), 'out')
  assert.equal(stockStatus(2, 2), 'low')
  assert.equal(stockStatus(3, 2), 'ok')
  assert.equal(stockStatus(1, 0), 'ok')
})

test('record ids are 15 lowercase alphanumerics and unique', () => {
  const ids = new Set(Array.from({ length: 200 }, newRecordId))
  assert.equal(ids.size, 200)
  for (const id of ids) assert.match(id, /^[a-z0-9]{15}$/)
})
```

- [ ] **Step 3: Run the tests to verify they fail**

Run: `npm run test:unit`
Expected: FAIL with `Cannot find module '.../utils/pricing.js'` (and the same for `inventory.js`).

- [ ] **Step 4: Implement**

`utils/pricing.js`:

```js
// PocketBase 0.22 reads an unset number field as 0, so only a positive price counts as an override
export const effectivePrice = (article, category) =>
  Number(article?.price) > 0 ? Number(article.price) : Number(category?.base_price ?? 0)
```

`utils/inventory.js`:

```js
const ID_ALPHABET = 'abcdefghijklmnopqrstuvwxyz0123456789'

// Sell what is left and note the rest; the sale itself is never blocked
export const saleMovement = (stock, quantity) => {
  const sold = Math.min(quantity, Math.max(0, stock))
  const oversold = quantity - sold
  return { change: -sold, reason: 'sale', note: oversold > 0 ? `oversold by ${oversold}` : '' }
}

export const printedMovement = (count) => {
  if (!Number.isInteger(count) || count <= 0) throw new Error('Printed count must be a whole number above 0')
  return { change: count, reason: 'printed', note: '' }
}

export const correctionMovement = (stock, target, note = '') => {
  if (!Number.isInteger(target) || target < 0) throw new Error('Stock count must be a whole number of 0 or more')
  const change = target - stock
  return change === 0 ? null : { change, reason: 'correction', note }
}

export const stockFromMovements = movements =>
  Math.max(0, movements.reduce((sum, movement) => sum + Number(movement.change), 0))

export const stockStatus = (stock, threshold) => {
  if (stock <= 0) return 'out'
  return stock <= threshold ? 'low' : 'ok'
}

// Client-side ids make retried creates detectable (PocketBase rejects a duplicate id)
export const newRecordId = () => {
  const bytes = crypto.getRandomValues(new Uint8Array(15))
  return Array.from(bytes, byte => ID_ALPHABET[byte % ID_ALPHABET.length]).join('')
}
```

- [ ] **Step 5: Run the tests to verify they pass**

Run: `npm run test:unit`
Expected: `# pass 13`, `# fail 0`.

- [ ] **Step 6: Commit**

```bash
git add package.json utils/pricing.js utils/inventory.js tests/unit/pricing.test.js tests/unit/inventory.test.js
git commit -m "Add pricing and stock movement helpers"
```

---

### Task 2: Migration planner and script

**Files:**
- Create: `scripts/lib/pb-plan.mjs`, `scripts/pb-migrate.mjs`
- Create: `tests/fixtures/pb-schema-current.json`, `tests/unit/pb-plan.test.js`
- Modify: `package.json` (add the `pb:migrate` script), `.env.example`, `README.md`

**Interfaces:**
- Produces, from `scripts/lib/pb-plan.mjs`:
  - `ARTICLES`, `TRANSACTIONS`, `OWNER_RULE`, `CATEGORY_SEED`
  - `planSchema(collections): Op[]`
  - `planRequireCategory(collections): Op[]`
  - `planRules(collections): Op[]`
  - `simulate(collections, ops): collections`
  - `resolveField(field, collections): field`
  - `guessCategory(name): string | null`
  - `describeOp(op): string`
- An `Op` is one of:
  - `{ op: 'createCollection', name, body }`
  - `{ op: 'addFields', collection, fields }`
  - `{ op: 'updateField', collection, field, patch }`
  - `{ op: 'setRules', collection, rules }`
- Produces the CLI `npm run pb:migrate -- [--apply | --apply-rules]`, which writes `scripts/category-mapping.json` and `pocketbase/schema.json`.

The fixture below is hand-written in the v0.22 format from the fields the live API returns. The implementer has no admin access. If the owner later runs the dry run, `pocketbase/schema.json` becomes the source of truth.

- [ ] **Step 1: Write the fixture**

`tests/fixtures/pb-schema-current.json`:

```json
[
  {
    "id": "_pb_users_auth_",
    "name": "users",
    "type": "auth",
    "system": false,
    "schema": [
      { "id": "users_name", "name": "name", "type": "text", "required": false, "presentable": false, "options": { "min": null, "max": null, "pattern": "" } }
    ],
    "indexes": [],
    "listRule": "id = @request.auth.id",
    "viewRule": "id = @request.auth.id",
    "createRule": "",
    "updateRule": "id = @request.auth.id",
    "deleteRule": "id = @request.auth.id",
    "options": {}
  },
  {
    "id": "i1f9o7q6bnjx6k8",
    "name": "budget_tracket_catalog",
    "type": "base",
    "system": false,
    "schema": [
      { "id": "cat_name", "name": "name", "type": "text", "required": true, "presentable": false, "options": { "min": null, "max": null, "pattern": "" } },
      { "id": "cat_price", "name": "price", "type": "number", "required": true, "presentable": false, "options": { "min": null, "max": null, "noDecimal": false } },
      { "id": "cat_desc", "name": "description", "type": "text", "required": false, "presentable": false, "options": { "min": null, "max": null, "pattern": "" } },
      { "id": "cat_images", "name": "images", "type": "file", "required": false, "presentable": false, "options": { "mimeTypes": [], "thumbs": [], "maxSelect": 99, "maxSize": 5242880, "protected": false } },
      { "id": "cat_active", "name": "active", "type": "bool", "required": false, "presentable": false, "options": {} },
      { "id": "cat_created_at", "name": "created_at", "type": "date", "required": false, "presentable": false, "options": { "min": "", "max": "" } },
      { "id": "cat_updated_at", "name": "updated_at", "type": "date", "required": false, "presentable": false, "options": { "min": "", "max": "" } }
    ],
    "indexes": [],
    "listRule": "",
    "viewRule": "",
    "createRule": null,
    "updateRule": null,
    "deleteRule": null,
    "options": {}
  },
  {
    "id": "txcollection001",
    "name": "budget_tracker_transactions",
    "type": "base",
    "system": false,
    "schema": [
      { "id": "tx_desc", "name": "description", "type": "text", "required": true, "presentable": false, "options": { "min": null, "max": null, "pattern": "" } },
      { "id": "tx_amount", "name": "amount", "type": "number", "required": true, "presentable": false, "options": { "min": null, "max": null, "noDecimal": false } },
      { "id": "tx_notes", "name": "notes", "type": "text", "required": false, "presentable": false, "options": { "min": null, "max": null, "pattern": "" } }
    ],
    "indexes": [],
    "listRule": null,
    "viewRule": null,
    "createRule": "@request.headers.x_token = \"legacy\"",
    "updateRule": null,
    "deleteRule": null,
    "options": {}
  }
]
```

- [ ] **Step 2: Write the failing tests**

`tests/unit/pb-plan.test.js`:

```js
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
```

- [ ] **Step 3: Run the tests to verify they fail**

Run: `npm run test:unit`
Expected: the `pb-plan` tests FAIL with `Cannot find module '.../scripts/lib/pb-plan.mjs'`, and the Task 1 tests still pass.

- [ ] **Step 4: Implement the planner**

`scripts/lib/pb-plan.mjs`:

```js
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
```

- [ ] **Step 5: Run the tests to verify they pass**

Run: `npm run test:unit`
Expected: `# fail 0`, with all 9 `pb-plan` tests passing alongside Task 1's.

- [ ] **Step 6: Write the CLI**

`scripts/pb-migrate.mjs`:

```js
// PocketBase 0.22 migration for categories, stock and owner-only rules.
//   npm run pb:migrate                 dry run: prints the plan, writes scripts/category-mapping.json
//   npm run pb:migrate -- --apply      schema + seed + category mapping (old rules stay; deployed app keeps working)
//   npm run pb:migrate -- --apply-rules  owner-only rules (run after the new app is deployed)
import { readFile, writeFile, mkdir } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import {
  ARTICLES,
  TRANSACTIONS,
  CATEGORY_SEED,
  planSchema,
  planRequireCategory,
  planRules,
  resolveField,
  guessCategory,
  describeOp
} from './lib/pb-plan.mjs'

try { process.loadEnvFile('.env') } catch { /* no .env: rely on the environment */ }

const BASE = (process.env.POCKETBASE_URL || 'https://pocket.lasseharm.space').replace(/\/$/, '')
const TOKEN = process.env.POCKETBASE_ADMIN_TOKEN
const MAPPING_FILE = 'scripts/category-mapping.json'
const SNAPSHOT_FILE = 'pocketbase/schema.json'
const MODE = process.argv.includes('--apply-rules') ? 'rules' : process.argv.includes('--apply') ? 'apply' : 'dry-run'

async function api (method, path, body) {
  const response = await fetch(`${BASE}/api${path}`, {
    method,
    headers: { Authorization: TOKEN, ...(body ? { 'Content-Type': 'application/json' } : {}) },
    body: body ? JSON.stringify(body) : undefined
  })
  const text = await response.text()
  if (!response.ok) throw new Error(`${method} ${path} → ${response.status} ${text}`)
  return text ? JSON.parse(text) : null
}

const listCollections = async () => (await api('GET', '/collections?perPage=500')).items
const listRecords = async (collection) => (await api('GET', `/collections/${collection}/records?perPage=500`)).items
const byName = (collections, name) => collections.find(collection => collection.name === name)

async function applyOp (op) {
  const collections = await listCollections()
  if (op.op === 'createCollection') return api('POST', '/collections', op.body)
  const collection = byName(collections, op.collection)
  if (op.op === 'setRules') return api('PATCH', `/collections/${collection.id}`, op.rules)
  const schema = op.op === 'addFields'
    ? [...collection.schema, ...op.fields.map(field => resolveField(field, collections))]
    : collection.schema.map(field => (field.name === op.field ? { ...field, ...op.patch } : field))
  return api('PATCH', `/collections/${collection.id}`, { schema })
}

async function loadMapping (articles) {
  const saved = existsSync(MAPPING_FILE) ? JSON.parse(await readFile(MAPPING_FILE, 'utf8')) : {}
  const mapping = {}
  for (const article of articles) {
    mapping[article.id] = saved[article.id] ?? { name: article.name, category: guessCategory(article.name) }
  }
  await writeFile(MAPPING_FILE, `${JSON.stringify(mapping, null, 2)}\n`)
  return mapping
}

async function writeSnapshot () {
  const ours = new Set(['categories', 'stock_movements', ARTICLES, TRANSACTIONS])
  const snapshot = (await listCollections()).filter(collection => ours.has(collection.name))
  await mkdir('pocketbase', { recursive: true })
  await writeFile(SNAPSHOT_FILE, `${JSON.stringify(snapshot, null, 2)}\n`)
  console.log(`Wrote ${SNAPSHOT_FILE}`)
}

async function ownerCount () {
  return (await api('GET', '/collections/users/records?perPage=1')).totalItems
}

async function migrateSchema () {
  console.log(`Server: ${BASE} (PocketBase 0.22 admin API)`)
  const collections = await listCollections()
  const ops = planSchema(collections)
  console.log(ops.length ? 'Schema changes:' : 'Schema: up to date')
  ops.forEach(op => console.log(`  - ${describeOp(op)}`))

  const existing = byName(collections, 'categories') ? await listRecords('categories') : []
  const seed = CATEGORY_SEED.filter(item => !existing.some(category => category.name === item.name))
  console.log(seed.length
    ? `Categories to add: ${seed.map(item => `${item.name} (${item.base_price} €)`).join(', ')}`
    : 'Categories: all present')

  const articles = await listRecords(ARTICLES)
  const mapping = await loadMapping(articles)
  console.log(`Article → category (edit ${MAPPING_FILE} to change):`)
  for (const entry of Object.values(mapping)) console.log(`  - ${entry.name} → ${entry.category ?? 'UNMAPPED'}`)

  const owners = await ownerCount()
  console.log(owners > 0
    ? `Owner accounts in "users": ${owners}`
    : 'WARNING: no record in "users". Create your owner account in the PocketBase admin before --apply-rules.')

  if (MODE === 'dry-run') {
    console.log('\nDry run only. Fix any UNMAPPED entries, then run: npm run pb:migrate -- --apply')
    return
  }

  for (const op of ops) await applyOp(op)
  for (const item of seed) await api('POST', '/collections/categories/records', item)

  const categories = await listRecords('categories')
  const unmapped = Object.values(mapping).filter(entry => !categories.some(category => category.name === entry.category))
  if (unmapped.length) {
    throw new Error(`Map these articles to an existing category in ${MAPPING_FILE}: ${unmapped.map(entry => entry.name).join(', ')}`)
  }
  for (const article of articles) {
    const target = categories.find(category => category.name === mapping[article.id].category)
    if (article.category === target.id) continue
    // First assignment also sets the default threshold; later runs leave the owner's value alone
    const patch = article.category ? { category: target.id } : { category: target.id, low_stock_threshold: 2 }
    await api('PATCH', `/collections/${ARTICLES}/records/${article.id}`, patch)
  }
  for (const op of planRequireCategory(await listCollections())) await applyOp(op)
  await writeSnapshot()
  console.log('Done. Deploy the new app, then run: npm run pb:migrate -- --apply-rules')
}

async function migrateRules () {
  const ops = planRules(await listCollections())
  if (!ops.length) return console.log('Rules: up to date')
  if ((await ownerCount()) === 0) throw new Error('No owner account in "users"; the new rules would lock everyone out')
  for (const op of ops) {
    console.log(`  - ${describeOp(op)}`)
    await applyOp(op)
  }
  await writeSnapshot()
  console.log('Rules applied. Only the logged-in owner can write now.')
}

if (!TOKEN) {
  console.error('Set POCKETBASE_ADMIN_TOKEN in .env (PocketBase admin UI → your admin → API token). Never prefix it with NUXT_PUBLIC_.')
  process.exit(1)
}

await (MODE === 'rules' ? migrateRules() : migrateSchema()).catch((error) => {
  console.error(error.message)
  process.exit(1)
})
```

- [ ] **Step 7: Wire up the script, env example and README**

In `package.json` `scripts`, after `test:unit`, add a comma and `"pb:migrate": "node scripts/pb-migrate.mjs"`.

Append to `.env.example`:

```
# Migration script only (scripts/pb-migrate.mjs). Never prefix these with NUXT_PUBLIC_.
POCKETBASE_URL=https://your-pocketbase-instance.example
POCKETBASE_ADMIN_TOKEN=
```

Append to `README.md`:

````markdown
## PocketBase setup: categories, stock and owner login

The app needs PocketBase **0.22** with an owner account in the `users` collection. Schema changes are made with a script that reads an admin token from your local `.env`:

```bash
npm run pb:migrate                  # dry run: prints the plan, writes scripts/category-mapping.json
npm run pb:migrate -- --apply       # create collections, seed categories, assign article categories
npm run pb:migrate -- --apply-rules # switch to owner-only writes (after deploying the new app)
```

Order matters:
1. Run `--apply`. The deployed app keeps working.
2. Deploy the new app.
3. Run `--apply-rules`. The old shared API token then stops working.

Each run writes the resulting schema to `pocketbase/schema.json`.
````

- [ ] **Step 8: Check that the CLI refuses to run without a token**

Run: `env -u POCKETBASE_ADMIN_TOKEN node scripts/pb-migrate.mjs; echo "exit $?"`
Expected: if `.env` has no token, it prints `Set POCKETBASE_ADMIN_TOKEN in .env …` and `exit 1`. If the owner has already added a token to `.env`, **do not run this step**: a run would contact the live server. Instead, tell the owner they can run `npm run pb:migrate` (dry run) themselves.

- [ ] **Step 9: Commit**

```bash
git add scripts/lib/pb-plan.mjs scripts/pb-migrate.mjs tests/fixtures/pb-schema-current.json tests/unit/pb-plan.test.js package.json .env.example README.md
git commit -m "Add PocketBase migration planner and script"
```

---

### Task 3: PocketBase client, owner login and fake backend for tests

**Files:**
- Install: `pocketbase@0.21.5`
- Create: `tests/e2e/fake-pocketbase.js`
- Modify: `tests/e2e/fixtures.js` (full rewrite below)
- Create: `composables/usePocketBase.js`, `composables/useAuth.js`, `middleware/owner.js`, `pages/login.vue`
- Modify: `nuxt.config.ts`, `app.vue`, `composables/useTransactions.js`, `pages/index.vue`, `pages/reports.vue`, `pages/settings.vue`
- Test: `tests/e2e/auth.spec.js`

**Interfaces:**
- Consumes: `BaseButton` and `useToast` from the UI overhaul.
- Produces:
  - `usePocketBase(): PocketBase`, a single client per page.
  - `useAuth()` → `{ user: Ref<object|null>, isOwner: ComputedRef<boolean>, restoreSession(): Promise<void>, login(email, password): Promise, logout(): void }`.
  - Pages opt in to the login gate with `definePageMeta({ middleware: 'owner' })`. A page sets `definePageMeta({ chromeless: true })` to hide the navigation.
- Produces for tests:
  - In `tests/e2e/fake-pocketbase.js`: `createFakePocketBase()`, `FAKE_TOKEN`, `OWNER` and `OWNER_PASSWORD`.
  - In the `api` fixture: `db`, `requests`, `posted`, `enable()`, `seed({ categories?, articles? })`, `mockCatalog(items?)`, `mockTransactions({ status? })` and `fail(collection, status)`.
  - `SAMPLE_CATEGORIES` and `sampleProducts`.
  - The test option `owner` (default `true`); a test calls `test.use({ owner: false })` to run logged out.

- [ ] **Step 1: Install the SDK**

Run: `npm install pocketbase@0.21.5 --save-exact`
Expected: `package.json` dependencies contain `"pocketbase": "0.21.5"`.

- [ ] **Step 2: Write the fake PocketBase**

`tests/e2e/fake-pocketbase.js`:

```js
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

const COLLECTIONS = ['categories', 'budget_tracket_catalog', 'stock_movements', 'budget_tracker_transactions']
const OWNER_READ_ONLY = new Set(['stock_movements', 'budget_tracker_transactions'])
const DEFAULTS = {
  categories: { sort_order: 0 },
  budget_tracket_catalog: { collectionId: 'articles0000001', active: true, stock: 0, low_stock_threshold: 2, images: [], price: 0, description: '' },
  stock_movements: { note: '' },
  budget_tracker_transactions: { notes: '' }
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

// Only what the app sends: `field = value` clauses joined by &&, optionally in parentheses
const matchesFilter = (record, filter) =>
  !filter || filter.replace(/[()]/g, '').split('&&').every((clause) => {
    const [field, value] = clause.split('=')
    return record[field.trim()] === parseValue(value)
  })

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
  const requests = []
  const state = { enabled: false }

  const withExpand = (record, expand) =>
    expand?.includes('category') && record.category
      ? { ...record, expand: { category: db.categories.find(category => category.id === record.category) } }
      : record

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

    if (!isOwner) return reply(403, { code: 403, message: 'Only the owner can perform this action.', data: {} })
    if (failures[name]) return reply(failures[name], { code: failures[name], message: 'Forced failure.', data: {} })

    if (method === 'POST') {
      if (body.id && records.some(record => record.id === body.id)) {
        return reply(400, { code: 400, message: 'Failed to create record.', data: { id: { code: 'validation_invalid_id', message: 'The model id is invalid or already exists.' } } })
      }
      const record = applyChanges({ ...DEFAULTS[name], id: newId(), collectionName: name, created: stamp(), updated: stamp() }, body)
      records.push(record)
      return reply(200, withExpand(record, expand))
    }
    const record = records.find(item => item.id === id)
    if (!record) return reply(404, { code: 404, message: 'Not found.', data: {} })
    if (method === 'PATCH') return reply(200, withExpand(applyChanges(record, { ...body, updated: stamp() }), expand))
    if (method === 'DELETE') {
      // Mirrors PocketBase: a required relation blocks deleting the referenced record
      if (name === 'categories' && db.budget_tracket_catalog.some(article => article.category === id)) {
        return reply(400, { code: 400, message: 'Failed to delete record. Make sure that the record is not part of a required relation reference.', data: {} })
      }
      records.splice(records.indexOf(record), 1)
      return route.fulfill({ status: 204 })
    }
    return reply(405, { code: 405, message: 'Method not allowed.', data: {} })
  }

  return { db, failures, requests, state, handle }
}
```

- [ ] **Step 3: Rewrite the fixtures**

Replace `tests/e2e/fixtures.js` entirely:

```js
import { test as base, expect } from '@playwright/test'
import { createFakePocketBase, FAKE_TOKEN, OWNER } from './fake-pocketbase.js'

const API_HOST = 'https://pocket.lasseharm.space/**'
const isApiRequest = url => url.startsWith('https://pocket.lasseharm.space/')

export const SAMPLE_CATEGORIES = [
  { id: 'cat-figure', name: 'Big Figure', base_price: 30, sort_order: 0 },
  { id: 'cat-keychain', name: 'Keychain', base_price: 4, sort_order: 1 },
  { id: 'cat-coaster', name: 'Coaster', base_price: 8, sort_order: 2 }
]

export const sampleProducts = [
  { id: 'p1', name: 'Dragon Figure', description: 'Articulated dragon', price: 12.5 },
  { id: 'p2', name: 'Phone Stand', description: 'Adjustable desk stand', price: 4 },
  { id: 'p3', name: 'Cable Clip', description: 'Pack of cable organisers', price: 1.5 }
]

// Every test starts with the backend unreachable (requests abort), so nothing can hit
// production data. Calling seed/mockCatalog/mockTransactions/enable switches on an
// in-memory PocketBase for that test. `auto` applies the block to every test.
export const test = base.extend({
  // Against `nuxt dev` the devtools launcher floats over the bottom tab bar and swallows taps
  hideDevtools: [async ({ context }, use) => {
    await context.addInitScript(() => {
      document.addEventListener('DOMContentLoaded', () => {
        const style = document.createElement('style')
        style.textContent = '#nuxt-devtools-container { display: none !important; }'
        document.head.appendChild(style)
      })
    })
    await use()
  }, { auto: true }],

  // Logged in as the owner unless a test calls test.use({ owner: false })
  owner: [true, { option: true }],
  ownerSession: [async ({ context, owner }, use) => {
    if (owner) {
      // Seed once per tab so a test that logs out stays logged out across reloads
      await context.addInitScript(({ token, model }) => {
        if (sessionStorage.getItem('owner-seeded')) return
        localStorage.setItem('pocketbase_auth', JSON.stringify({ token, model }))
        sessionStorage.setItem('owner-seeded', '1')
      }, { token: FAKE_TOKEN, model: OWNER })
    }
    await use()
  }, { auto: true }],

  api: [async ({ context }, use) => {
    const fake = createFakePocketBase()
    const handled = new Set()
    const seen = []
    context.on('request', req => { if (isApiRequest(req.url())) seen.push(req) })
    await context.route(API_HOST, (route) => {
      handled.add(route.request())
      return fake.state.enabled ? fake.handle(route) : route.abort()
    })

    const api = {
      db: fake.db,
      requests: fake.requests,
      get posted () { return fake.db.budget_tracker_transactions },
      enable () { fake.state.enabled = true },
      seed ({ categories = SAMPLE_CATEGORIES, articles = [] } = {}) {
        api.enable()
        fake.db.categories.push(...structuredClone(categories))
        fake.db.budget_tracket_catalog.push(...articles.map(article => ({
          collectionId: 'articles0000001',
          active: true,
          stock: 10,
          low_stock_threshold: 2,
          images: [],
          description: '',
          price: 0,
          category: 'cat-figure',
          ...article
        })))
      },
      async mockCatalog (items = sampleProducts) { api.seed({ articles: items }) },
      async mockTransactions ({ status = 200 } = {}) {
        api.enable()
        if (status !== 200) fake.failures.budget_tracker_transactions = status
      },
      fail (collection, status) { fake.failures[collection] = status }
    }
    await use(api)

    // Fail loudly if anything reached the real backend without being intercepted
    const leaked = seen.filter(req => !handled.has(req)).map(req => `${req.method()} ${req.url()}`)
    expect(leaked, 'requests escaped the API mocks').toEqual([])
  }, { auto: true }]
})

// Layouts switch (sheet vs inline, tab bar vs rail) once the client has mounted;
// app.vue marks <html data-hydrated> in its onMounted, which runs after every child
export async function gotoReady (page, path) {
  await page.goto(path)
  await page.locator('html[data-hydrated]').waitFor({ state: 'attached' })
}

// Below lg the add-transaction form lives in a bottom sheet behind the floating + button
export async function openTransactionForm (page) {
  if (page.viewportSize().width < 1024) {
    await page.getByRole('button', { name: 'Add transaction', exact: true }).click()
  }
}

export { expect, FAKE_TOKEN }
```

- [ ] **Step 4: Write the failing auth tests**

`tests/e2e/auth.spec.js`:

```js
import { test, expect, gotoReady, openTransactionForm, FAKE_TOKEN } from './fixtures.js'

const TRANSACTIONS_KEY = 'budget-tracker-transactions'

test.describe('logged out', () => {
  test.use({ owner: false })

  for (const path of ['/', '/reports', '/settings']) {
    test(`${path} redirects to login`, async ({ page }) => {
      await page.goto(path)
      await page.waitForURL(url => url.pathname === '/login')
      expect(new URL(page.url()).searchParams.get('redirect')).toBe(path)
    })
  }

  test('the catalog can be browsed but not sold from', async ({ page, api }) => {
    await api.mockCatalog()
    await gotoReady(page, '/catalog')
    await expect(page.getByRole('heading', { name: 'Dragon Figure' })).toBeVisible()
    await page.locator('h3', { hasText: 'Dragon Figure' }).click()
    await expect(page.getByRole('button', { name: /to cart/ })).toHaveCount(0)
    await expect(page.getByRole('button', { name: /View cart/ })).toHaveCount(0)
    await expect(page.getByRole('button', { name: 'Add to Balance' })).toHaveCount(0)
  })

  test('logging in returns to the requested page', async ({ page, api }) => {
    api.enable()
    await gotoReady(page, '/login?redirect=/reports')
    await expect(page.getByRole('navigation', { name: 'Primary' })).toHaveCount(0)
    await page.getByLabel('Email').fill('owner@example.com')
    await page.getByLabel('Password').fill('correct-horse')
    await page.getByRole('button', { name: 'Log in' }).click()
    await page.waitForURL(url => url.pathname === '/reports')
  })

  test('a wrong password shows an error', async ({ page, api }) => {
    api.enable()
    await gotoReady(page, '/login')
    await page.getByLabel('Email').fill('owner@example.com')
    await page.getByLabel('Password').fill('nope')
    await page.getByRole('button', { name: 'Log in' }).click()
    await expect(page.getByRole('alert')).toHaveText('Wrong email or password')
  })

  test('a redirect to another site is ignored', async ({ page, api }) => {
    api.enable()
    await gotoReady(page, '/login?redirect=//evil.example')
    await page.getByLabel('Email').fill('owner@example.com')
    await page.getByLabel('Password').fill('correct-horse')
    await page.getByRole('button', { name: 'Log in' }).click()
    await page.waitForURL(url => url.pathname === '/')
    expect(page.url()).not.toContain('evil.example')
  })
})

test('logging out from Settings returns to login and stays logged out', async ({ page }) => {
  await gotoReady(page, '/settings#api')
  await expect(page.getByText('owner@example.com')).toBeVisible()
  await page.getByRole('button', { name: 'Log out' }).click()
  await page.waitForURL(url => url.pathname === '/login')
  await page.goto('/')
  await page.waitForURL(url => url.pathname === '/login')
})

test('transactions are sent with the owner session instead of the shared token', async ({ page, api }) => {
  await api.mockTransactions()
  await gotoReady(page, '/')
  await openTransactionForm(page)
  await page.getByPlaceholder('What is this transaction for?').fill('Market sale')
  await page.getByPlaceholder('0.00').fill('25')
  await page.getByRole('button', { name: 'Add to Balance' }).click()

  await expect.poll(() => api.posted.length).toBe(1)
  const post = api.requests.find(request => request.method === 'POST' && request.path.endsWith('/budget_tracker_transactions/records'))
  expect(post.authorization).toBe(FAKE_TOKEN)
  expect(post.body.token).toBeUndefined()
})

test('an expired session keeps the transaction and asks to log in', async ({ page, api }) => {
  await api.mockTransactions({ status: 401 })
  await gotoReady(page, '/')
  await openTransactionForm(page)
  await page.getByPlaceholder('What is this transaction for?').fill('Commission')
  await page.getByPlaceholder('0.00').fill('40')
  await page.getByRole('button', { name: 'Add to Balance' }).click()

  await expect(page.getByText(/session has expired/)).toBeVisible()
  await expect(page.getByText('1 pending')).toBeVisible()
  const stored = await page.evaluate(key => JSON.parse(localStorage.getItem(key) || '[]'), TRANSACTIONS_KEY)
  expect(stored).toHaveLength(1)
})
```

- [ ] **Step 5: Run the tests to verify they fail**

Run: `npx playwright test tests/e2e/auth.spec.js`
Expected: FAIL. There is no redirect to `/login` (pages render), `/login` is 404, there's no "Log out" button, and the POST carries `x-token` with no `Authorization` header.

- [ ] **Step 6: Implement the client and session**

In `nuxt.config.ts` `runtimeConfig.public`, after `apiToken`, add a comma and:

```ts
      pocketbaseUrl: process.env.NUXT_PUBLIC_POCKETBASE_URL || 'https://pocket.lasseharm.space'
```

`composables/usePocketBase.js`:

```js
import PocketBase from 'pocketbase'

let client = null

export const usePocketBase = () => {
  if (!client) {
    client = new PocketBase(useRuntimeConfig().public.pocketbaseUrl)
    // Several components load the same lists; the SDK would otherwise cancel duplicate requests
    client.autoCancellation(false)
  }
  return client
}
```

`composables/useAuth.js`:

```js
import { ref, computed } from 'vue'
import { usePocketBase } from './usePocketBase'

const user = ref(null)
let listening = false

export const useAuth = () => {
  const pb = usePocketBase()

  if (import.meta.client && !listening) {
    listening = true
    pb.authStore.onChange(() => {
      user.value = pb.authStore.isValid ? pb.authStore.model : null
    })
  }

  const isOwner = computed(() => user.value?.collectionName === 'users')

  // Called from app.vue's onMounted so the server and the first client render agree (logged-out UI)
  const restoreSession = async () => {
    user.value = pb.authStore.isValid ? pb.authStore.model : null
    if (!user.value || !navigator.onLine) return
    try {
      await pb.collection('users').authRefresh()
    } catch (error) {
      // Only a rejected token ends the session; network trouble keeps it for offline selling
      if (error.status === 401) pb.authStore.clear()
    }
  }

  const login = (email, password) => pb.collection('users').authWithPassword(email, password)
  const logout = () => pb.authStore.clear()

  return { user, isOwner, restoreSession, login, logout }
}
```

`middleware/owner.js`:

```js
import { usePocketBase } from '~/composables/usePocketBase'

// The session lives in localStorage, so only the client can decide: the server renders,
// then this runs again during hydration and redirects
export default defineNuxtRouteMiddleware((to) => {
  if (import.meta.server) return
  if (!usePocketBase().authStore.isValid) {
    return navigateTo({ path: '/login', query: { redirect: to.fullPath } })
  }
})
```

`pages/login.vue`:

```vue
<template>
  <div class="mx-auto flex min-h-[70vh] max-w-sm flex-col justify-center">
    <h1 class="text-xl font-semibold text-ink">Log in</h1>
    <p class="mb-6 mt-1 text-sm text-ink-muted">Owner account for Budget Tracker</p>
    <form class="space-y-4" novalidate @submit.prevent="submit">
      <p v-if="error" role="alert" class="rounded-lg bg-expense/10 px-3 py-2 text-sm text-expense">{{ error }}</p>
      <div>
        <label for="login-email" class="label">Email</label>
        <input id="login-email" v-model="email" type="email" class="input" autocomplete="username">
      </div>
      <div>
        <label for="login-password" class="label">Password</label>
        <input id="login-password" v-model="password" type="password" class="input" autocomplete="current-password">
      </div>
      <BaseButton type="submit" size="lg" block :loading="busy">Log in</BaseButton>
    </form>
  </div>
</template>

<script setup>
import { ref } from 'vue'
import { useAuth } from '~/composables/useAuth'

definePageMeta({ chromeless: true })

const route = useRoute()
const { login } = useAuth()

const email = ref('')
const password = ref('')
const error = ref('')
const busy = ref(false)

// Only same-site paths: "//host" and absolute URLs would send the owner elsewhere
const redirectTarget = () => {
  const target = route.query.redirect
  return typeof target === 'string' && target.startsWith('/') && !target.startsWith('//') ? target : '/'
}

const submit = async () => {
  error.value = ''
  if (!email.value.trim() || !password.value) {
    error.value = 'Enter your email and password'
    return
  }
  busy.value = true
  try {
    await login(email.value.trim(), password.value)
    await navigateTo(redirectTarget(), { replace: true })
  } catch (err) {
    error.value = err.status === 400 ? 'Wrong email or password' : 'Could not reach the server. Check your connection.'
  } finally {
    busy.value = false
  }
}
</script>
```

- [ ] **Step 7: Hide the chrome on login and restore the session in `app.vue`**

Replace `app.vue` entirely:

```vue
<template>
  <div class="min-h-screen">
    <AppSideNav v-if="!chromeless" />
    <div :class="{ 'md:pl-20 lg:pl-60': !chromeless }">
      <AppTopBar v-if="!chromeless" />
      <main class="mx-auto max-w-6xl px-4 pt-4 md:px-6 md:pt-6" :class="chromeless ? 'pb-10' : 'pb-nav md:pb-10'">
        <NuxtPage />
      </main>
    </div>
    <AppBottomNav v-if="!chromeless" />
    <ToastHost>
      <PWAInstall />
    </ToastHost>
  </div>
</template>

<script setup>
import { computed, onMounted, watch } from 'vue'
import { useAppSettings } from '~/composables/useAppSettings'
import { useAuth } from '~/composables/useAuth'

const route = useRoute()
const chromeless = computed(() => !!route.meta.chromeless)

const { displaySettings } = useAppSettings()
const { restoreSession } = useAuth()
const isDark = computed(() => !!displaySettings.value.darkMode)

useHead({
  meta: [{ name: 'theme-color', content: computed(() => (isDark.value ? '#111827' : '#ffffff')) }]
})

onMounted(() => {
  // useAppSettings loads stored settings in its own onMounted, registered before this one
  watch(isDark, dark => document.documentElement.classList.toggle('dark', dark), { immediate: true })
  restoreSession()
  document.documentElement.dataset.hydrated = ''
})
</script>
```

- [ ] **Step 8: Gate the pages**

At the top of `<script setup>` in `pages/index.vue`, `pages/reports.vue` and `pages/settings.vue`, directly after the import lines, add:

```js
definePageMeta({ middleware: 'owner' })
```

- [ ] **Step 9: Send the owner session with transactions**

In `composables/useTransactions.js`:

1. Add `import { usePocketBase } from './usePocketBase'` below the `useOfflineQueue` import.
2. Replace `  const API_TOKEN = config.public.apiToken` with `  const pb = usePocketBase()`.
3. Directly after the `saveTransactions` function, add:

```js
  // The owner's session token replaces the shared x-token; PocketBase rules check @request.auth.
  // txSynced survives in the offline queue so a retry never posts the same transaction twice.
  const postTransaction = async (data) => {
    if (data.txSynced) return null
    const response = await fetch(`${API_BASE_URL}${API_ENDPOINT}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: pb.authStore.token },
      body: JSON.stringify({ description: data.description, amount: data.amount, notes: data.notes || '' })
    })
    if (!response.ok) {
      const error = new Error(`API error: ${response.status}`)
      error.status = response.status
      throw error
    }
    data.txSynced = true
    return response.json()
  }
```

4. In `sendToPocketbase`, replace everything from `const fullUrl = \`${API_BASE_URL}${API_ENDPOINT}\`` up to and including `return await response.json()` with:

```js
      const record = await postTransaction(transactionData)
      syncStatus.value.lastSync = new Date().toISOString()
      return record
```

5. In the same function's `catch`, replace the `if (!isOnline()) { … } else { … }` block with:

```js
      if (!isOnline()) {
        apiError.value = 'You are offline. Transaction saved locally and will sync when online.'
      } else if (error.status === 401 || error.status === 403) {
        apiError.value = 'Your session has expired. Log in again to sync - Transaction saved locally.'
      } else {
        apiError.value = 'Failed to save transaction to server'
      }
```

6. In `syncTransactionsQueue`, replace the whole `return await processQueue(async (item) => { … })` call with:

```js
    return await processQueue(item => postTransaction(item))
```

- [ ] **Step 10: Replace the API settings section with the session details**

In `pages/settings.vue`:

1. Replace the whole `<BaseCard v-if="activeCategory === 'api'" …>…</BaseCard>` block with:

```vue
        <BaseCard v-if="activeCategory === 'api'" title="API Configuration" subtitle="Server and owner login" icon="code">
          <dl class="space-y-3 text-sm">
            <div>
              <dt class="text-ink-muted">PocketBase server</dt>
              <dd class="break-all font-medium text-ink">{{ pocketbaseUrl }}</dd>
            </div>
            <div>
              <dt class="text-ink-muted">Logged in as</dt>
              <dd class="font-medium text-ink">{{ user?.email || 'Not logged in' }}</dd>
            </div>
          </dl>
          <BaseButton class="mt-4" variant="secondary" block icon="x" @click="handleLogout">Log out</BaseButton>
        </BaseCard>
```

2. In `SETTINGS_CATEGORIES`, change the API entry's description to `'Server and owner login'`.
3. In the script:
   - add `import { useAuth } from '~/composables/useAuth'` after the `useAppSettings` import;
   - remove `apiSettings,` and `saveApiSettings,` from the `useAppSettings()` destructuring;
   - delete `const showToken = ref(false)` and the `handleSaveApiSettings` function;
   - add the following after the `useToast()` line:

```js
const { user, logout } = useAuth()
const pocketbaseUrl = useRuntimeConfig().public.pocketbaseUrl

const handleLogout = () => {
  logout()
  navigateTo('/login')
}
```

- [ ] **Step 11: Run the tests to verify they pass**

Run: `npx playwright test tests/e2e/auth.spec.js`
Expected: all pass on both projects. If the `/` redirect tests fail because the page renders without redirecting (route middleware not re-running on hydration), add `routeRules: { '/': { ssr: false }, '/reports': { ssr: false }, '/settings': { ssr: false } }` to `nuxt.config.ts` and ledger it as a ruling. If `pocketbase` fails to resolve in the dev server, ask the owner to restart `nuxt dev`.

Run: `npx playwright test`
Expected: the whole suite passes. The existing specs run logged in through the `owner` default, and `mockCatalog`/`mockTransactions` now drive the fake.

- [ ] **Step 12: Commit**

```bash
git add package.json package-lock.json nuxt.config.ts app.vue composables/usePocketBase.js composables/useAuth.js composables/useTransactions.js middleware/owner.js pages/login.vue pages/index.vue pages/reports.vue pages/settings.vue tests/e2e/fake-pocketbase.js tests/e2e/fixtures.js tests/e2e/auth.spec.js
git commit -m "Add owner login with PocketBase auth and gate management pages"
```

---

### Task 4: Catalog with categories, effective prices and stock badges

**Files:**
- Create: `composables/useArticles.js`, `composables/useCategories.js`
- Modify: `pages/catalog.vue` (full rewrite below), `components/CartPanel.vue`
- Test: `tests/e2e/catalog.spec.js` (append tests)

**Interfaces:**
- Consumes: `effectivePrice` and `stockStatus` (Task 1), `useAuth().isOwner` and `usePocketBase` (Task 3), and `api.seed` (Task 3).
- Produces:
  - `useArticles()` → `{ ARTICLES, listActive(): Promise<Article[]>, imageUrl(article, thumb?) }`, with articles carrying `expand.category`.
  - `useCategories()` → `{ listCategories(): Promise<Category[]> }`, sorted by `sort_order, name`.
  - `CartPanel` takes an optional prop `priceOf: Function` (default `item => item.price`).
  - In `catalog.vue`: `products`, `categories`, `priceOf(product)`, `onCardClick(product)` and `fetchProducts()`.

- [ ] **Step 1: Write the failing tests**

Append inside the `describe` block of `tests/e2e/catalog.spec.js`, before its closing `})`:

```js
  test('category chips filter the grid', async ({ page, api }) => {
    api.seed({
      articles: [
        { id: 'k1', name: 'Pikachu Keychain', category: 'cat-keychain' },
        { id: 'f1', name: 'Glurak Figure', category: 'cat-figure' }
      ]
    })
    await gotoReady(page, '/catalog')
    const chips = page.getByRole('group', { name: 'Categories' })
    await chips.getByRole('button', { name: 'Keychain' }).click()
    await expect(page.getByRole('heading', { name: 'Pikachu Keychain' })).toBeVisible()
    await expect(page.getByRole('heading', { name: 'Glurak Figure' })).toHaveCount(0)
    await chips.getByRole('button', { name: 'All' }).click()
    await expect(page.getByRole('heading', { name: 'Glurak Figure' })).toBeVisible()
  })

  test('articles without their own price use the category price', async ({ page, api }) => {
    api.seed({
      articles: [
        { id: 'k1', name: 'Pikachu Keychain', category: 'cat-keychain', price: 0 },
        { id: 'k2', name: 'Golden Keychain', category: 'cat-keychain', price: 6 }
      ]
    })
    await gotoReady(page, '/catalog')
    await expect(page.locator('article', { hasText: 'Pikachu Keychain' })).toContainText('4,00')
    await expect(page.locator('article', { hasText: 'Golden Keychain' })).toContainText('6,00')
  })

  test('cards show stock badges', async ({ page, api }) => {
    api.seed({
      articles: [
        { id: 'a1', name: 'Empty One', stock: 0 },
        { id: 'a2', name: 'Low One', stock: 1, low_stock_threshold: 2 },
        { id: 'a3', name: 'Plenty One', stock: 5 }
      ]
    })
    await gotoReady(page, '/catalog')
    await expect(page.locator('article', { hasText: 'Empty One' })).toContainText('Out of stock')
    await expect(page.locator('article', { hasText: 'Low One' })).toContainText('Low · 1 left')
    await expect(page.locator('article', { hasText: 'Plenty One' })).toContainText('5 left')
  })

  test('soft-deleted articles are not listed', async ({ page, api }) => {
    api.seed({ articles: [{ id: 'a1', name: 'Hidden One', active: false }, { id: 'a2', name: 'Visible One' }] })
    await gotoReady(page, '/catalog')
    await expect(page.getByRole('heading', { name: 'Visible One' })).toBeVisible()
    await expect(page.getByRole('heading', { name: 'Hidden One' })).toHaveCount(0)
  })
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx playwright test tests/e2e/catalog.spec.js`
Expected: the 4 new tests FAIL. There is no `Categories` group, the price shows `0,00` instead of `4,00`, there are no badges, and the hidden article is listed. The older catalog tests still pass.

- [ ] **Step 3: Add the data composables**

`composables/useArticles.js`:

```js
import { usePocketBase } from './usePocketBase'

export const ARTICLES = 'budget_tracket_catalog'

export const useArticles = () => {
  const pb = usePocketBase()

  // Soft-deleted articles (active = false) never appear in the catalog
  const listActive = () =>
    pb.collection(ARTICLES).getFullList({ filter: 'active = true', expand: 'category', sort: 'name' })

  const imageUrl = (article, thumb = '300x300') => pb.files.getUrl(article, article.images[0], { thumb })

  return { ARTICLES, listActive, imageUrl }
}
```

`composables/useCategories.js`:

```js
import { usePocketBase } from './usePocketBase'

export const useCategories = () => {
  const pb = usePocketBase()

  const listCategories = () => pb.collection('categories').getFullList({ sort: 'sort_order,name' })

  return { listCategories }
}
```

- [ ] **Step 4: Let `CartPanel` price lines through a function**

In `components/CartPanel.vue`:
1. Replace `{{ formatCurrency(item.price) }} each · {{ formatCurrency(item.price * item.quantity) }}` with `{{ formatCurrency(priceOf(item)) }} each · {{ formatCurrency(priceOf(item) * item.quantity) }}`.
2. In `defineProps`, after `total`, add a comma and `priceOf: { type: Function, default: item => item.price }`.

- [ ] **Step 5: Rewrite `pages/catalog.vue`**

```vue
<template>
  <div :class="{ 'pb-20': showCartBar }">
    <div class="lg:grid lg:items-start lg:gap-6" :class="{ 'lg:grid-cols-[minmax(0,1fr)_20rem]': isOwner }">
      <div class="min-w-0">
        <PageHeader title="Product Catalog" subtitle="Browse and select 3D printing products" />

        <div class="mb-4 space-y-3">
          <div class="relative">
            <AppIcon name="search" class="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-muted" />
            <input
              ref="searchInput"
              v-model="searchQuery"
              type="text"
              class="input pl-9"
              placeholder="Search products..."
              aria-label="Search products"
            >
          </div>
          <div class="flex gap-2">
            <select ref="sortSelect" v-model="sortOption" class="input w-auto flex-1 pr-9 sm:flex-none" aria-label="Sort by">
              <option value="name">Sort by Name</option>
              <option value="price">Sort by Price</option>
            </select>
            <button type="button" class="chip chip-idle" @click="sortDirection = sortDirection === 'asc' ? 'desc' : 'asc'">
              <AppIcon name="sort" class="h-4 w-4" />
              {{ sortDirection === 'asc' ? 'A to Z' : 'Z to A' }}
            </button>
          </div>
          <div v-if="categories.length" class="no-scrollbar -mx-4 flex gap-2 overflow-x-auto px-4 md:mx-0 md:flex-wrap md:px-0" role="group" aria-label="Categories">
            <button
              type="button"
              class="chip"
              :class="selectedCategory === 'all' ? 'chip-active' : 'chip-idle'"
              :aria-pressed="selectedCategory === 'all'"
              @click="selectedCategory = 'all'"
            >
              All
            </button>
            <button
              v-for="category in categories"
              :key="category.id"
              type="button"
              class="chip"
              :class="selectedCategory === category.id ? 'chip-active' : 'chip-idle'"
              :aria-pressed="selectedCategory === category.id"
              @click="selectedCategory = category.id"
            >
              {{ category.name }}
            </button>
          </div>
        </div>

        <div v-if="loading" class="card flex h-48 flex-col items-center justify-center gap-3">
          <span class="h-8 w-8 animate-spin rounded-full border-4 border-muted border-t-accent" aria-hidden="true" />
          <p class="text-sm text-ink-muted">Loading products...</p>
        </div>

        <div v-else-if="error" class="card px-4 py-8 text-center">
          <AppIcon name="exclamation" class="mx-auto mb-3 h-8 w-8 text-expense" />
          <p class="mb-4 text-sm text-expense">{{ error }}</p>
          <BaseButton variant="secondary" icon="refresh" @click="fetchProducts">Try Again</BaseButton>
        </div>

        <div v-else-if="filteredProducts.length === 0" class="card px-4 py-8 text-center">
          <p class="text-sm font-medium text-ink">No products match your search</p>
          <p class="mb-4 mt-1 text-sm text-ink-muted">Try adjusting your search criteria</p>
          <BaseButton variant="secondary" icon="x" @click="clearFilters">Clear Search</BaseButton>
        </div>

        <div v-else class="grid grid-cols-2 gap-3 md:grid-cols-3 md:gap-4 xl:grid-cols-4">
          <article
            v-for="product in filteredProducts"
            :key="product.id"
            class="card flex flex-col overflow-hidden transition-shadow"
            :class="{ 'cursor-pointer': isOwner, 'ring-2 ring-accent': isSelected(product) }"
            @click="onCardClick(product)"
          >
            <div class="relative aspect-square bg-muted">
              <img
                v-if="product.images && product.images.length > 0"
                :src="imageUrl(product)"
                :alt="product.name"
                class="h-full w-full object-cover"
                loading="lazy"
              >
              <div v-else class="flex h-full items-center justify-center text-ink-muted">
                <AppIcon name="image" class="h-10 w-10" />
              </div>
              <span
                v-if="isSelected(product)"
                class="absolute right-2 top-2 flex h-6 min-w-[1.5rem] items-center justify-center rounded-full bg-accent px-1.5 text-xs font-semibold text-white"
              >
                {{ product.quantity }}
              </span>
            </div>
            <div class="flex flex-1 flex-col gap-2 p-3">
              <h3 class="line-clamp-2 break-words text-sm font-semibold text-ink">{{ product.name }}</h3>
              <span class="self-start rounded-full px-2 py-0.5 text-xs font-medium" :class="STOCK_BADGE[stockStatus(product.stock, product.low_stock_threshold)]">
                {{ stockLabel(product) }}
              </span>
              <div class="hidden sm:block">
                <p class="line-clamp-2 text-xs text-ink-muted">{{ product.description }}</p>
              </div>
              <div class="mt-auto flex flex-wrap items-center justify-between gap-2">
                <p class="text-sm font-semibold tabular-nums text-ink">{{ formatCurrency(priceOf(product)) }}</p>
                <template v-if="isOwner">
                  <QuantityStepper
                    v-if="isSelected(product)"
                    :quantity="product.quantity"
                    :name="product.name"
                    @increment="incrementQuantity(product)"
                    @decrement="decrementQuantity(product)"
                  />
                  <button
                    v-else
                    type="button"
                    class="flex h-11 w-11 items-center justify-center rounded-lg bg-accent/10 text-accent hover:bg-accent/20"
                    :aria-label="`Add ${product.name} to cart`"
                    @click.stop="incrementQuantity(product)"
                  >
                    <AppIcon name="plus" class="h-5 w-5" />
                  </button>
                </template>
              </div>
            </div>
          </article>
        </div>
      </div>

      <aside v-if="isOwner && isDesktop" class="lg:sticky lg:top-20">
        <BaseCard title="Cart" subtitle="Selected products for purchase" icon="cart">
          <CartPanel
            :items="selectedProducts"
            :total="totalAmount"
            :price-of="priceOf"
            @increment="incrementQuantity"
            @decrement="decrementQuantity"
            @remove="removeProduct"
            @submit="submitToBalance"
          />
        </BaseCard>
      </aside>
    </div>

    <template v-if="isOwner && !isDesktop">
      <button
        v-if="showCartBar"
        type="button"
        class="fixed inset-x-4 z-30 flex min-h-[52px] items-center justify-between gap-3 rounded-xl bg-accent px-4 text-white shadow-lg bottom-above-nav md:bottom-6 md:left-auto md:right-6 md:w-80"
        @click="isCartOpen = true"
      >
        <span class="text-sm font-medium">
          {{ selectedProducts.length }} items · <span class="tabular-nums">{{ formatCurrency(totalAmount) }}</span>
        </span>
        <span class="flex items-center gap-1 text-sm font-semibold">
          View cart
          <AppIcon name="chevron-right" class="h-4 w-4" />
        </span>
      </button>
      <BottomSheet v-model:open="isCartOpen" title="Cart">
        <CartPanel
          :items="selectedProducts"
          :total="totalAmount"
          :price-of="priceOf"
          @increment="incrementQuantity"
          @decrement="decrementQuantity"
          @remove="removeProduct"
          @submit="submitToBalance"
        />
      </BottomSheet>
    </template>
  </div>
</template>

<script setup>
import { ref, computed, watch, onMounted, onBeforeUnmount } from 'vue'
import { useTransactions } from '~/composables/useTransactions'
import { useArticles } from '~/composables/useArticles'
import { useCategories } from '~/composables/useCategories'
import { useAuth } from '~/composables/useAuth'
import { useMediaQuery } from '~/composables/useMediaQuery'
import { useToast } from '~/composables/useToast'
import { formatCurrency } from '~/utils/currency'
import { effectivePrice } from '~/utils/pricing'
import { stockStatus } from '~/utils/inventory'

const STOCK_BADGE = {
  out: 'bg-expense/10 text-expense',
  low: 'bg-amber-500/15 text-amber-700 dark:text-amber-300',
  ok: 'bg-muted text-ink-muted'
}

const { listActive, imageUrl } = useArticles()
const { listCategories } = useCategories()
const { isOwner } = useAuth()

const products = ref([])
const categories = ref([])
const loading = ref(false)
const error = ref(null)

const isDesktop = useMediaQuery('(min-width: 1024px)')
const isCartOpen = ref(false)
// The sheet is dropped at lg+; don't let it reappear (unlocked) when the screen shrinks again
watch(isDesktop, (desktop) => { if (desktop) isCartOpen.value = false })
const searchInput = ref(null)
const sortSelect = ref(null)

const fetchProducts = async () => {
  loading.value = true
  error.value = null
  try {
    const [articles, categoryList] = await Promise.all([listActive(), listCategories()])
    products.value = articles.map(item => ({ ...item, quantity: 0 }))
    categories.value = categoryList
  } catch (err) {
    error.value = 'Could not load products. Check your connection and try again.'
  } finally {
    loading.value = false
  }
}

const priceOf = product => effectivePrice(product, product.expand?.category)

const stockLabel = (product) => {
  const status = stockStatus(product.stock, product.low_stock_threshold)
  if (status === 'out') return 'Out of stock'
  return status === 'low' ? `Low · ${product.stock} left` : `${product.stock} left`
}

const sortOption = ref('name') // 'name', 'price'
const sortDirection = ref('asc') // 'asc', 'desc'
const searchQuery = ref('')
const selectedCategory = ref('all')

const sortProducts = (list) => {
  return [...list].sort((a, b) => {
    const modifier = sortDirection.value === 'asc' ? 1 : -1
    if (sortOption.value === 'price') {
      return (priceOf(a) - priceOf(b)) * modifier
    }
    return a.name.localeCompare(b.name) * modifier
  })
}

const filteredProducts = computed(() => {
  let result = products.value
  if (selectedCategory.value !== 'all') {
    result = result.filter(product => product.category === selectedCategory.value)
  }
  if (searchQuery.value) {
    const query = searchQuery.value.toLowerCase()
    result = result.filter(product =>
      product.name.toLowerCase().includes(query) ||
      (product.description || '').toLowerCase().includes(query)
    )
  }
  return sortProducts(result)
})

const clearFilters = () => {
  searchQuery.value = ''
  selectedCategory.value = 'all'
}

const selectedProducts = computed(() => products.value.filter(p => p.quantity > 0))

const totalAmount = computed(() => {
  return products.value.reduce((sum, product) => sum + (priceOf(product) * product.quantity), 0)
})

const showCartBar = computed(() => isOwner.value && !isDesktop.value && selectedProducts.value.length > 0 && !isCartOpen.value)

const isSelected = product => product.quantity > 0

const incrementQuantity = (product) => {
  product.quantity++
}

const decrementQuantity = (product) => {
  if (product.quantity > 0) {
    product.quantity--
  }
}

const removeProduct = (product) => {
  product.quantity = 0
}

// Only the owner sells; visitors just browse
const onCardClick = (product) => {
  if (isOwner.value) incrementQuantity(product)
}

const { addTransaction } = useTransactions()
const { toast } = useToast()

const submitToBalance = () => {
  if (selectedProducts.value.length === 0) return

  const total = totalAmount.value
  const productNames = selectedProducts.value
    .map(product => `${product.name} (${formatCurrency(priceOf(product))} × ${product.quantity})`)
    .join('\n')

  addTransaction({
    description: `3D Printing Products:\n${productNames}`,
    amount: total,
    date: new Date().toISOString().split('T')[0]
  })

  // Reset all product quantities to 0
  products.value.forEach(product => { product.quantity = 0 })
  isCartOpen.value = false
  toast(`Added ${formatCurrency(total)} to balance`)
}

// Ctrl/Cmd+F focuses search, Ctrl/Cmd+S focuses sort
const handleKeyboardShortcuts = (event) => {
  if (!(event.ctrlKey || event.metaKey)) return
  if (event.key === 'f') {
    event.preventDefault()
    searchInput.value?.focus()
  } else if (event.key === 's') {
    event.preventDefault()
    sortSelect.value?.focus()
  }
}

onMounted(() => {
  fetchProducts()
  window.addEventListener('keydown', handleKeyboardShortcuts)
})

onBeforeUnmount(() => {
  window.removeEventListener('keydown', handleKeyboardShortcuts)
})
</script>
```

Removed from the old page: the never-used favourites code (`toggleFavorite`, `isFavorite`, the `favorites` localStorage key). This closes the UI-overhaul deferred minor.

- [ ] **Step 6: Run the tests to verify they pass**

Run: `npx playwright test tests/e2e/catalog.spec.js tests/e2e/auth.spec.js`
Expected: all pass on both projects.

- [ ] **Step 7: Commit**

```bash
git add composables/useArticles.js composables/useCategories.js components/CartPanel.vue pages/catalog.vue tests/e2e/catalog.spec.js
git commit -m "Show categories, effective prices and stock badges in the catalog"
```

---

### Task 5: Stock deduction at checkout, oversell and offline sync

**Files:**
- Create: `composables/useInventory.js`
- Modify: `composables/useTransactions.js`, `pages/catalog.vue`, `components/CartPanel.vue`
- Test: `tests/e2e/inventory.spec.js`

**Interfaces:**
- Consumes:
  - from Task 1: `saleMovement`, `stockFromMovements` and `newRecordId`;
  - from Task 3: `postTransaction` and `txSynced` in `useTransactions`;
  - from Task 4: `ARTICLES` and `priceOf`.
- Produces:
  - `useInventory()` → `{ applyMovements(movements: Movement[]): Promise<Record<articleId, number>>, recomputeStock(articleId): Promise<number>, listMovements(articleId, limit = 10): Promise<Movement[]> }`.
  - A `Movement` is `{ id, article, change, reason, note }`.
  - `addTransaction(transaction)` accepts an optional `stockMovements: Movement[]`. They are synced after the transaction, kept with it in the offline queue, and not stored in the local transaction history.

- [ ] **Step 1: Write the failing tests**

`tests/e2e/inventory.spec.js`:

```js
import { test, expect, gotoReady } from './fixtures.js'

const keychain = overrides => ({ id: 'k1', name: 'Pikachu Keychain', category: 'cat-keychain', price: 0, stock: 5, ...overrides })
const card = (page, name) => page.locator('h3', { hasText: name })
const isCompact = page => page.viewportSize().width < 1024

const openCart = async (page) => {
  if (isCompact(page)) await page.getByRole('button', { name: /View cart/ }).click()
}

const addToCart = async (page, name, times) => {
  for (let i = 0; i < times; i++) await card(page, name).click()
}

test('checkout logs a sale and lowers stock', async ({ page, api }) => {
  api.seed({ articles: [keychain()] })
  await gotoReady(page, '/catalog')
  await addToCart(page, 'Pikachu Keychain', 2)
  await openCart(page)
  await page.getByRole('button', { name: 'Add to Balance' }).click()

  await expect.poll(() => api.db.stock_movements.length).toBe(1)
  expect(api.db.stock_movements[0]).toMatchObject({ article: 'k1', change: -2, reason: 'sale', note: '' })
  await expect.poll(() => api.db.budget_tracket_catalog[0].stock).toBe(3)
  expect(api.posted[0].amount).toBe(8)
  await expect(page.locator('article', { hasText: 'Pikachu Keychain' })).toContainText('3 left')
})

test('overselling warns, sells, and stops stock at 0', async ({ page, api }) => {
  api.seed({ articles: [keychain({ stock: 1 })] })
  await gotoReady(page, '/catalog')
  await addToCart(page, 'Pikachu Keychain', 3)
  await openCart(page)
  await expect(page.getByText('only 1 in stock')).toBeVisible()
  await page.getByRole('button', { name: 'Add to Balance' }).click()

  await expect.poll(() => api.db.stock_movements.length).toBe(1)
  expect(api.db.stock_movements[0]).toMatchObject({ change: -1, reason: 'sale', note: 'oversold by 2' })
  await expect.poll(() => api.db.budget_tracket_catalog[0].stock).toBe(0)
  expect(api.posted[0].amount).toBe(12)
  await expect(page.locator('article', { hasText: 'Pikachu Keychain' })).toContainText('Out of stock')
})

test('selling from empty stock logs the oversell', async ({ page, api }) => {
  api.seed({ articles: [keychain({ stock: 0 })] })
  await gotoReady(page, '/catalog')
  await addToCart(page, 'Pikachu Keychain', 1)
  await openCart(page)
  await page.getByRole('button', { name: 'Add to Balance' }).click()

  await expect.poll(() => api.db.stock_movements.length).toBe(1)
  expect(api.db.stock_movements[0]).toMatchObject({ change: 0, reason: 'sale', note: 'oversold by 1' })
  expect(api.db.budget_tracket_catalog[0].stock).toBe(0)
  expect(api.posted).toHaveLength(1)
})

test('an offline checkout syncs its stock changes later', async ({ page, api, context }) => {
  api.seed({ articles: [keychain()] })
  await gotoReady(page, '/catalog')
  await context.setOffline(true)
  await addToCart(page, 'Pikachu Keychain', 1)
  await openCart(page)
  await page.getByRole('button', { name: 'Add to Balance' }).click()
  expect(api.db.stock_movements).toHaveLength(0)

  await context.setOffline(false)
  await page.getByRole('navigation', { name: 'Primary' }).getByRole('link', { name: 'Dashboard', exact: true }).click()
  await page.getByRole('button', { name: /Sync now/ }).click()

  await expect.poll(() => api.db.stock_movements.length).toBe(1)
  await expect.poll(() => api.db.budget_tracket_catalog[0].stock).toBe(4)
  expect(api.posted).toHaveLength(1)
})

test('a retried sync does not duplicate the sale', async ({ page, api }) => {
  api.seed({ articles: [keychain()] })
  // The movement is created, then the stock update fails, so the whole sale is queued
  api.fail('budget_tracket_catalog', 500)
  await gotoReady(page, '/catalog')
  await addToCart(page, 'Pikachu Keychain', 2)
  await openCart(page)
  await page.getByRole('button', { name: 'Add to Balance' }).click()
  await expect.poll(() => api.db.stock_movements.length).toBe(1)

  api.fail('budget_tracket_catalog', 0)
  await page.getByRole('navigation', { name: 'Primary' }).getByRole('link', { name: 'Dashboard', exact: true }).click()
  await page.getByRole('button', { name: /Sync now/ }).click()

  await expect.poll(() => api.db.budget_tracket_catalog[0].stock).toBe(3)
  expect(api.posted).toHaveLength(1)
  expect(api.db.stock_movements).toHaveLength(1)
})
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx playwright test tests/e2e/inventory.spec.js`
Expected: FAIL. No `stock_movements` are created, stock stays 5, and there is no "only 1 in stock" warning.

- [ ] **Step 3: Implement `useInventory`**

`composables/useInventory.js`:

```js
import { usePocketBase } from './usePocketBase'
import { ARTICLES } from './useArticles'
import { stockFromMovements } from '~/utils/inventory'

const MOVEMENTS = 'stock_movements'

export const useInventory = () => {
  const pb = usePocketBase()

  // Movement ids are generated client-side, so a retry that hits an existing id already succeeded
  const createMovement = async (movement) => {
    try {
      await pb.collection(MOVEMENTS).create(movement)
    } catch (error) {
      if (!(error.status === 400 && error.response?.data?.id)) throw error
    }
  }

  // PocketBase 0.22 has no batch API: the log is written first and stock is always derived from it
  const recomputeStock = async (articleId) => {
    const movements = await pb.collection(MOVEMENTS).getFullList({
      filter: pb.filter('article = {:id}', { id: articleId }),
      fields: 'change'
    })
    const stock = stockFromMovements(movements)
    await pb.collection(ARTICLES).update(articleId, { stock })
    return stock
  }

  const applyMovements = async (movements) => {
    for (const movement of movements) await createMovement(movement)
    const stocks = {}
    for (const articleId of new Set(movements.map(movement => movement.article))) {
      stocks[articleId] = await recomputeStock(articleId)
    }
    return stocks
  }

  const listMovements = async (articleId, limit = 10) => {
    const result = await pb.collection(MOVEMENTS).getList(1, limit, {
      filter: pb.filter('article = {:id}', { id: articleId }),
      sort: '-created'
    })
    return result.items
  }

  return { applyMovements, recomputeStock, listMovements }
}
```

- [ ] **Step 4: Sync movements with transactions**

In `composables/useTransactions.js`:
1. Add `import { useInventory } from './useInventory'` below the `usePocketBase` import.
2. Directly below `const pb = usePocketBase()`, add `const { applyMovements } = useInventory()`.
3. Replace the whole `postTransaction` function from Task 3 with:

```js
  // The owner's session token replaces the shared x-token; PocketBase rules check @request.auth.
  // txSynced survives in the offline queue so a retry never posts the same transaction twice;
  // stock movements are idempotent by id, so they are simply replayed.
  const postTransaction = async (data) => {
    let record = null
    if (!data.txSynced) {
      const response = await fetch(`${API_BASE_URL}${API_ENDPOINT}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: pb.authStore.token },
        body: JSON.stringify({ description: data.description, amount: data.amount, notes: data.notes || '' })
      })
      if (!response.ok) {
        const error = new Error(`API error: ${response.status}`)
        error.status = response.status
        throw error
      }
      data.txSynced = true
      record = await response.json()
    }
    if (data.stockMovements?.length) await applyMovements(data.stockMovements)
    return record
  }
```

4. In `addTransaction`, replace `    transactions.value = [...transactions.value, newTransaction]` with:

```js
    // Stock movements travel with the queued transaction but are not part of the local history
    const { stockMovements, ...historyEntry } = newTransaction
    transactions.value = [...transactions.value, historyEntry]
```

- [ ] **Step 5: Deduct stock at checkout**

In `pages/catalog.vue`:
1. Change `import { stockStatus } from '~/utils/inventory'` to `import { stockStatus, saleMovement, newRecordId } from '~/utils/inventory'`.
2. Replace the whole `submitToBalance` function with:

```js
const submitToBalance = () => {
  if (selectedProducts.value.length === 0) return

  const total = totalAmount.value
  const productNames = selectedProducts.value
    .map(product => `${product.name} (${formatCurrency(priceOf(product))} × ${product.quantity})`)
    .join('\n')
  // Overselling is allowed: the movement deducts what is left and notes the rest
  const stockMovements = selectedProducts.value.map(product => ({
    id: newRecordId(),
    article: product.id,
    ...saleMovement(product.stock, product.quantity)
  }))

  addTransaction({
    description: `3D Printing Products:\n${productNames}`,
    amount: total,
    date: new Date().toISOString().split('T')[0],
    stockMovements
  })

  products.value.forEach((product) => {
    if (product.quantity) product.stock = Math.max(0, product.stock - product.quantity)
    product.quantity = 0
  })
  isCartOpen.value = false
  toast(`Added ${formatCurrency(total)} to balance`)
}
```

- [ ] **Step 6: Warn about overselling in the cart**

In `components/CartPanel.vue`, directly after the `<p class="truncate text-xs tabular-nums text-ink-muted">…</p>` line-price paragraph, add:

```vue
          <p v-if="item.quantity > item.stock" class="text-xs font-medium text-amber-700 dark:text-amber-300">
            only {{ Math.max(0, item.stock) }} in stock
          </p>
```

- [ ] **Step 7: Run the tests to verify they pass**

Run: `npx playwright test tests/e2e/inventory.spec.js tests/e2e/catalog.spec.js tests/e2e/transactions.spec.js`
Expected: all pass on both projects.

- [ ] **Step 8: Commit**

```bash
git add composables/useInventory.js composables/useTransactions.js pages/catalog.vue components/CartPanel.vue tests/e2e/inventory.spec.js
git commit -m "Deduct stock at checkout with logged sale movements"
```

---

### Task 6: Manage mode and the article editor

**Files:**
- Modify: `composables/useArticles.js` (full rewrite below), `pages/catalog.vue`
- Create: `components/ArticleSheet.vue`, `components/InventoryPanel.vue`
- Test: `tests/e2e/articles.spec.js`

**Interfaces:**
- Consumes:
  - from Task 1: `printedMovement`, `correctionMovement` and `newRecordId`;
  - from Task 5: `useInventory().applyMovements` and `listMovements`;
  - from Task 4: `useCategories().listCategories`.
- Produces:
  - `useArticles()` adds:
    - `createArticle(fields, images?: File[]): Promise<Article>`
    - `updateArticle(id, fields, { add?: File[], remove?: string[] }): Promise<Article>`
    - `deleteArticle(id): Promise` (sets `active = false`)
    - Create and update responses include `expand.category`.
  - `<ArticleSheet v-model:open :article="Article|null" :categories @saved(article) @deleted(id) @stock-changed(id, stock)>`
  - `<InventoryPanel :article @changed(stock)>`

- [ ] **Step 1: Write the failing tests**

`tests/e2e/articles.spec.js`:

```js
import { test, expect, gotoReady } from './fixtures.js'

const sheet = page => page.getByRole('dialog')

test.describe('managing articles', () => {
  test.beforeEach(async ({ page, api }) => {
    api.seed({ articles: [{ id: 'k1', name: 'Pikachu Keychain', category: 'cat-keychain', price: 0, stock: 5 }] })
    await gotoReady(page, '/catalog')
    await page.getByRole('button', { name: 'Manage' }).click()
  })

  test('creating an article with starting stock', async ({ page, api }) => {
    await page.getByRole('button', { name: '+ New article' }).click()
    await sheet(page).getByLabel('Name').fill('Evoli Keychain')
    await sheet(page).getByLabel('Category').selectOption({ label: 'Keychain' })
    await sheet(page).getByLabel('Starting stock').fill('3')
    await sheet(page).getByRole('button', { name: 'Create article' }).click()

    await expect(sheet(page)).toHaveCount(0)
    const created = page.locator('article', { hasText: 'Evoli Keychain' })
    await expect(created).toContainText('4,00')
    await expect(created).toContainText('3 left')
    const record = api.db.budget_tracket_catalog.find(article => article.name === 'Evoli Keychain')
    expect(record).toMatchObject({ category: 'cat-keychain', stock: 3, active: true })
    expect(api.db.stock_movements).toEqual([expect.objectContaining({ article: record.id, change: 3, reason: 'correction', note: 'starting stock' })])
  })

  test('validation names the missing field', async ({ page }) => {
    await page.getByRole('button', { name: '+ New article' }).click()
    await sheet(page).getByRole('button', { name: 'Create article' }).click()
    await expect(sheet(page).getByRole('alert')).toHaveText('Enter a name')
    await sheet(page).getByLabel('Name').fill('Nameless')
    await sheet(page).getByRole('button', { name: 'Create article' }).click()
    await expect(sheet(page).getByRole('alert')).toHaveText('Choose a category')
  })

  test('editing sets a price override', async ({ page, api }) => {
    await page.locator('h3', { hasText: 'Pikachu Keychain' }).click()
    await sheet(page).getByLabel('Price override').fill('6')
    await sheet(page).getByRole('button', { name: 'Save changes' }).click()
    await expect(page.locator('article', { hasText: 'Pikachu Keychain' })).toContainText('6,00')
    expect(api.db.budget_tracket_catalog[0].price).toBe(6)
  })

  test('adding printed items and correcting the count are logged', async ({ page, api }) => {
    await page.locator('h3', { hasText: 'Pikachu Keychain' }).click()
    await sheet(page).getByLabel('Add printed').fill('2')
    await sheet(page).getByRole('button', { name: 'Add', exact: true }).click()
    await expect(sheet(page).getByTestId('article-stock')).toHaveText('7')

    await sheet(page).getByLabel('Correct count').fill('1')
    await sheet(page).getByLabel('Correction note').fill('recount')
    await sheet(page).getByRole('button', { name: 'Set' }).click()
    await expect(sheet(page).getByTestId('article-stock')).toHaveText('1')
    await expect(sheet(page).getByText('recount')).toBeVisible()

    expect(api.db.stock_movements.map(m => [m.reason, m.change, m.note])).toEqual([
      ['printed', 2, ''],
      ['correction', -6, 'recount']
    ])
    expect(api.db.budget_tracket_catalog[0].stock).toBe(1)
  })

  test('deleting hides the article but keeps the record', async ({ page, api }) => {
    await page.locator('h3', { hasText: 'Pikachu Keychain' }).click()
    await sheet(page).getByRole('button', { name: 'Delete article' }).click()
    await sheet(page).getByRole('button', { name: 'Delete', exact: true }).click()
    await expect(page.getByRole('heading', { name: 'Pikachu Keychain' })).toHaveCount(0)
    expect(api.db.budget_tracket_catalog[0].active).toBe(false)
  })

  test('uploading an image attaches it to the article', async ({ page, api }) => {
    await page.locator('h3', { hasText: 'Pikachu Keychain' }).click()
    await sheet(page).getByLabel('Add images').setInputFiles({ name: 'pikachu.png', mimeType: 'image/png', buffer: Buffer.from('89504e47', 'hex') })
    await sheet(page).getByRole('button', { name: 'Save changes' }).click()
    await expect(sheet(page)).toHaveCount(0)
    expect(api.db.budget_tracket_catalog[0].images).toEqual(['pikachu.png'])
  })
})

test.describe('visitors', () => {
  test.use({ owner: false })

  test('cannot see the manage button', async ({ page, api }) => {
    api.seed({ articles: [{ id: 'k1', name: 'Pikachu Keychain' }] })
    await gotoReady(page, '/catalog')
    await expect(page.getByRole('heading', { name: 'Pikachu Keychain' })).toBeVisible()
    await expect(page.getByRole('button', { name: 'Manage' })).toHaveCount(0)
  })
})
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx playwright test tests/e2e/articles.spec.js`
Expected: FAIL. There is no `Manage` button. The visitors test passes already, which is correct.

- [ ] **Step 3: Rewrite `composables/useArticles.js`**

```js
import { usePocketBase } from './usePocketBase'

export const ARTICLES = 'budget_tracket_catalog'

export const useArticles = () => {
  const pb = usePocketBase()
  const withCategory = { expand: 'category' }

  // Soft-deleted articles (active = false) never appear in the catalog
  const listActive = () =>
    pb.collection(ARTICLES).getFullList({ filter: 'active = true', expand: 'category', sort: 'name' })

  const createArticle = (fields, images = []) =>
    pb.collection(ARTICLES).create({ ...fields, active: true, stock: 0, ...(images.length ? { images } : {}) }, withCategory)

  // `images+` appends and `images-` removes files without touching the rest
  const updateArticle = (id, fields, { add = [], remove = [] } = {}) =>
    pb.collection(ARTICLES).update(id, {
      ...fields,
      ...(add.length ? { 'images+': add } : {}),
      ...(remove.length ? { 'images-': remove } : {})
    }, withCategory)

  // Soft delete keeps sales and stock history pointing at a real record
  const deleteArticle = id => pb.collection(ARTICLES).update(id, { active: false })

  const imageUrl = (article, thumb = '300x300') => pb.files.getUrl(article, article.images[0], { thumb })

  return { ARTICLES, listActive, createArticle, updateArticle, deleteArticle, imageUrl }
}
```

- [ ] **Step 4: Create `components/InventoryPanel.vue`**

```vue
<template>
  <div class="space-y-4">
    <div class="flex items-baseline justify-between gap-3">
      <h3 class="text-sm font-semibold text-ink">Inventory</h3>
      <p class="text-sm text-ink-muted">
        In stock:
        <span class="text-lg font-semibold tabular-nums text-ink" data-testid="article-stock">{{ stock }}</span>
      </p>
    </div>

    <p v-if="error" role="alert" class="rounded-lg bg-expense/10 px-3 py-2 text-sm text-expense">{{ error }}</p>

    <form class="flex items-end gap-2" novalidate @submit.prevent="addPrinted">
      <div class="min-w-0 flex-1">
        <label for="inventory-printed" class="label">Add printed</label>
        <input id="inventory-printed" v-model="printedCount" type="text" inputmode="numeric" class="input" placeholder="0">
      </div>
      <BaseButton type="submit" variant="secondary" icon="plus" :loading="busy === 'printed'">Add</BaseButton>
    </form>

    <form class="space-y-2" novalidate @submit.prevent="correct">
      <div class="flex items-end gap-2">
        <div class="min-w-0 flex-1">
          <label for="inventory-count" class="label">Correct count</label>
          <input id="inventory-count" v-model="correctTo" type="text" inputmode="numeric" class="input" placeholder="0">
        </div>
        <BaseButton type="submit" variant="secondary" :loading="busy === 'correction'">Set</BaseButton>
      </div>
      <input v-model="correctionNote" type="text" class="input" placeholder="Note (optional)" aria-label="Correction note">
    </form>

    <div>
      <h4 class="mb-1 text-xs font-medium uppercase tracking-wide text-ink-muted">Recent changes</h4>
      <p v-if="!movements.length" class="text-sm text-ink-muted">No stock changes yet</p>
      <ul v-else class="divide-y divide-line rounded-lg border border-line">
        <li v-for="movement in movements" :key="movement.id" class="flex items-center justify-between gap-3 px-3 py-2 text-sm">
          <div class="min-w-0">
            <p class="font-medium text-ink">{{ REASON_LABEL[movement.reason] }}</p>
            <p class="truncate text-xs text-ink-muted">
              {{ formatDateTime(movement.created) }}<template v-if="movement.note"> · {{ movement.note }}</template>
            </p>
          </div>
          <span class="shrink-0 font-semibold tabular-nums" :class="movement.change < 0 ? 'text-expense' : 'text-income'">
            {{ movement.change > 0 ? '+' : '' }}{{ movement.change }}
          </span>
        </li>
      </ul>
    </div>
  </div>
</template>

<script setup>
import { ref, onMounted } from 'vue'
import { useInventory } from '~/composables/useInventory'
import { printedMovement, correctionMovement, newRecordId } from '~/utils/inventory'
import { formatDateTime } from '~/utils/date'

const props = defineProps({
  article: { type: Object, required: true }
})
const emit = defineEmits(['changed'])

const REASON_LABEL = { sale: 'Sold', printed: 'Printed', correction: 'Correction' }

const { applyMovements, listMovements } = useInventory()

const stock = ref(props.article.stock ?? 0)
const movements = ref([])
const printedCount = ref('')
const correctTo = ref('')
const correctionNote = ref('')
const busy = ref('')
const error = ref('')

const loadMovements = async () => {
  movements.value = await listMovements(props.article.id)
}

onMounted(() => {
  loadMovements().catch(() => { error.value = 'Could not load stock history' })
})

const parseCount = value => (String(value).trim() === '' ? NaN : Number(value))

// Stock changes need the server: they are owner actions in the sheet, not part of offline selling
const record = async (kind, movement) => {
  busy.value = kind
  error.value = ''
  try {
    const stocks = await applyMovements([{ id: newRecordId(), article: props.article.id, ...movement }])
    stock.value = stocks[props.article.id]
    emit('changed', stock.value)
    await loadMovements()
    return true
  } catch (err) {
    error.value = 'Could not save the stock change. Check your connection and try again.'
    return false
  } finally {
    busy.value = ''
  }
}

const addPrinted = async () => {
  let movement
  try {
    movement = printedMovement(parseCount(printedCount.value))
  } catch (err) {
    error.value = err.message
    return
  }
  if (await record('printed', movement)) printedCount.value = ''
}

const correct = async () => {
  let movement
  try {
    movement = correctionMovement(stock.value, parseCount(correctTo.value), correctionNote.value.trim())
  } catch (err) {
    error.value = err.message
    return
  }
  if (!movement) {
    error.value = `Stock is already ${stock.value}`
    return
  }
  if (await record('correction', movement)) {
    correctTo.value = ''
    correctionNote.value = ''
  }
}
</script>
```

- [ ] **Step 5: Create `components/ArticleSheet.vue`**

```vue
<template>
  <BottomSheet :open="open" :title="article ? 'Edit article' : 'New article'" @update:open="$emit('update:open', $event)">
    <form class="space-y-4" novalidate @submit.prevent="save">
      <p v-if="error" role="alert" class="rounded-lg bg-expense/10 px-3 py-2 text-sm text-expense">{{ error }}</p>

      <div>
        <label for="article-name" class="label">Name</label>
        <input id="article-name" v-model="form.name" type="text" class="input" autocomplete="off">
      </div>

      <div>
        <label for="article-category" class="label">Category</label>
        <select id="article-category" v-model="form.category" class="input pr-9">
          <option value="" disabled>Choose a category</option>
          <option v-for="category in categories" :key="category.id" :value="category.id">{{ category.name }}</option>
        </select>
      </div>

      <div class="grid grid-cols-2 gap-3">
        <div>
          <label for="article-price" class="label">Price override</label>
          <input id="article-price" v-model="form.price" type="text" inputmode="decimal" class="input" :placeholder="categoryPricePlaceholder">
          <p class="hint">Empty uses the category price</p>
        </div>
        <div>
          <label for="article-threshold" class="label">Low stock at</label>
          <input id="article-threshold" v-model="form.lowStockThreshold" type="text" inputmode="numeric" class="input">
        </div>
      </div>

      <div v-if="!article">
        <label for="article-stock" class="label">Starting stock</label>
        <input id="article-stock" v-model="form.startingStock" type="text" inputmode="numeric" class="input" placeholder="0">
      </div>

      <div>
        <label for="article-description" class="label">Description</label>
        <textarea id="article-description" v-model="form.description" rows="2" class="input py-2" />
      </div>

      <div>
        <p class="label">Images</p>
        <ul v-if="keptImages.length || newImages.length" class="mb-2 divide-y divide-line rounded-lg border border-line text-sm">
          <li v-for="name in keptImages" :key="name" class="flex items-center justify-between gap-2 pl-3">
            <span class="truncate text-ink">{{ name }}</span>
            <button
              type="button"
              class="flex h-11 w-11 shrink-0 items-center justify-center text-ink-muted hover:text-expense"
              :aria-label="`Remove image ${name}`"
              @click="removeImage(name)"
            >
              <AppIcon name="trash" class="h-4 w-4" />
            </button>
          </li>
          <li v-for="file in newImages" :key="file.name" class="truncate px-3 py-3 text-ink-muted">{{ file.name }} (new)</li>
        </ul>
        <input
          type="file"
          accept="image/*"
          multiple
          aria-label="Add images"
          class="block w-full text-sm text-ink-muted file:mr-3 file:min-h-[44px] file:rounded-lg file:border-0 file:bg-muted file:px-4 file:text-sm file:font-semibold file:text-ink"
          @change="addImages"
        >
      </div>

      <BaseButton type="submit" size="lg" block :loading="saving">{{ article ? 'Save changes' : 'Create article' }}</BaseButton>
    </form>

    <section v-if="article" class="mt-6 border-t border-line pt-5">
      <InventoryPanel :article="article" @changed="stock => $emit('stock-changed', article.id, stock)" />
    </section>

    <div v-if="article" class="mt-6 border-t border-line pt-5">
      <BaseButton v-if="!confirmingDelete" variant="ghost" block icon="trash" @click="confirmingDelete = true">Delete article</BaseButton>
      <div v-else class="space-y-3">
        <p class="text-sm text-ink-muted">Hide “{{ article.name }}” from the catalog? Its sales and stock history are kept.</p>
        <div class="grid grid-cols-2 gap-2">
          <BaseButton variant="secondary" @click="confirmingDelete = false">Cancel</BaseButton>
          <BaseButton variant="danger" :loading="deleting" @click="remove">Delete</BaseButton>
        </div>
      </div>
    </div>
  </BottomSheet>
</template>

<script setup>
import { ref, computed, watch } from 'vue'
import { useArticles } from '~/composables/useArticles'
import { useInventory } from '~/composables/useInventory'
import { formatCurrency } from '~/utils/currency'
import { correctionMovement, newRecordId } from '~/utils/inventory'

const props = defineProps({
  open: { type: Boolean, default: false },
  article: { type: Object, default: null },
  categories: { type: Array, required: true }
})
const emit = defineEmits(['update:open', 'saved', 'deleted', 'stock-changed'])

const { createArticle, updateArticle, deleteArticle } = useArticles()
const { applyMovements } = useInventory()

const emptyForm = () => ({ name: '', category: '', price: '', lowStockThreshold: '2', startingStock: '', description: '' })

const form = ref(emptyForm())
const keptImages = ref([])
const removedImages = ref([])
const newImages = ref([])
const error = ref('')
const saving = ref(false)
const deleting = ref(false)
const confirmingDelete = ref(false)

// Refill the form every time the sheet opens
watch(() => props.open, (isOpen) => {
  if (!isOpen) return
  const article = props.article
  form.value = article
    ? {
        name: article.name,
        category: article.category,
        price: Number(article.price) > 0 ? String(article.price) : '',
        lowStockThreshold: String(article.low_stock_threshold ?? 2),
        startingStock: '',
        description: article.description || ''
      }
    : emptyForm()
  keptImages.value = article ? [...(article.images || [])] : []
  removedImages.value = []
  newImages.value = []
  error.value = ''
  confirmingDelete.value = false
}, { immediate: true })

const selectedCategory = computed(() => props.categories.find(category => category.id === form.value.category))
const categoryPricePlaceholder = computed(() =>
  selectedCategory.value ? `${formatCurrency(selectedCategory.value.base_price)} (category)` : 'Category price'
)

const addImages = (event) => {
  newImages.value = [...newImages.value, ...event.target.files]
  event.target.value = ''
}

const removeImage = (name) => {
  keptImages.value = keptImages.value.filter(image => image !== name)
  removedImages.value = [...removedImages.value, name]
}

const parseNumber = value => Number(String(value).trim().replace(',', '.'))
const isBlank = value => String(value).trim() === ''
const isCount = value => Number.isInteger(parseNumber(value)) && parseNumber(value) >= 0

const validate = () => {
  if (!form.value.name.trim()) return 'Enter a name'
  if (!form.value.category) return 'Choose a category'
  if (!isBlank(form.value.price) && !(parseNumber(form.value.price) >= 0)) return 'Price must be a number'
  if (!isCount(form.value.lowStockThreshold)) return 'Low stock must be a whole number of 0 or more'
  if (!isBlank(form.value.startingStock) && !isCount(form.value.startingStock)) return 'Starting stock must be a whole number of 0 or more'
  return ''
}

const save = async () => {
  error.value = validate()
  if (error.value) return
  saving.value = true
  const fields = {
    name: form.value.name.trim(),
    category: form.value.category,
    // 0 means "no override" in PocketBase 0.22 number fields
    price: isBlank(form.value.price) ? 0 : parseNumber(form.value.price),
    low_stock_threshold: parseNumber(form.value.lowStockThreshold),
    description: form.value.description.trim()
  }
  try {
    let article
    if (props.article) {
      article = await updateArticle(props.article.id, fields, { add: newImages.value, remove: removedImages.value })
    } else {
      article = await createArticle(fields, newImages.value)
      const startingStock = isBlank(form.value.startingStock) ? 0 : parseNumber(form.value.startingStock)
      const movement = correctionMovement(0, startingStock, 'starting stock')
      if (movement) {
        const stocks = await applyMovements([{ id: newRecordId(), article: article.id, ...movement }])
        article = { ...article, stock: stocks[article.id] }
      }
    }
    emit('saved', article)
    emit('update:open', false)
  } catch (err) {
    error.value = 'Could not save the article. Check your connection and try again.'
  } finally {
    saving.value = false
  }
}

const remove = async () => {
  deleting.value = true
  try {
    await deleteArticle(props.article.id)
    emit('deleted', props.article.id)
    emit('update:open', false)
  } catch (err) {
    error.value = 'Could not delete the article. Check your connection and try again.'
    confirmingDelete.value = false
  } finally {
    deleting.value = false
  }
}
</script>
```

- [ ] **Step 6: Add manage mode to the catalog**

In `pages/catalog.vue`:

1. Replace `<PageHeader title="Product Catalog" subtitle="Browse and select 3D printing products" />` with:

```vue
        <PageHeader title="Product Catalog" subtitle="Browse and select 3D printing products">
          <template v-if="isOwner" #actions>
            <BaseButton :variant="managing ? 'primary' : 'secondary'" icon="cog" :aria-pressed="managing" @click="managing = !managing">
              {{ managing ? 'Done' : 'Manage' }}
            </BaseButton>
          </template>
        </PageHeader>
```

2. Directly before `<div v-if="loading" class="card flex h-48`, add:

```vue
        <BaseButton v-if="managing" class="mb-4" block icon="plus" @click="openEditor(null)">+ New article</BaseButton>
```

The button's visible text is `+ New article`. Its `icon="plus"` icon is `aria-hidden`, so the accessible name stays `+ New article`.

3. Replace `<template v-if="isOwner">` (the one wrapping `QuantityStepper`) with `<template v-if="isOwner && !managing">`.
4. Directly before the final `</div>` of the template (after the `</template>` closing the cart sheet block), add:

```vue
    <ArticleSheet
      v-model:open="isEditorOpen"
      :article="editingArticle"
      :categories="categories"
      @saved="onArticleSaved"
      @deleted="onArticleDeleted"
      @stock-changed="onStockChanged"
    />
```

5. In the script, replace the `onCardClick` function with:

```js
const managing = ref(false)
const isEditorOpen = ref(false)
const editingArticle = ref(null)

const openEditor = (article) => {
  editingArticle.value = article
  isEditorOpen.value = true
}

// In manage mode a tap edits the article; otherwise only the owner sells and visitors browse
const onCardClick = (product) => {
  if (managing.value) openEditor(product)
  else if (isOwner.value) incrementQuantity(product)
}

const onArticleSaved = (article) => {
  const index = products.value.findIndex(product => product.id === article.id)
  if (index === -1) products.value.push({ ...article, quantity: 0 })
  else products.value[index] = { ...article, quantity: products.value[index].quantity }
}

const onArticleDeleted = (id) => {
  products.value = products.value.filter(product => product.id !== id)
}

const onStockChanged = (id, stock) => {
  const product = products.value.find(item => item.id === id)
  if (product) product.stock = stock
}
```

- [ ] **Step 7: Run the tests to verify they pass**

Run: `npx playwright test tests/e2e/articles.spec.js tests/e2e/catalog.spec.js tests/e2e/inventory.spec.js`
Expected: all pass on both projects.

- [ ] **Step 8: Commit**

```bash
git add composables/useArticles.js components/ArticleSheet.vue components/InventoryPanel.vue pages/catalog.vue tests/e2e/articles.spec.js
git commit -m "Add catalog manage mode with article editor and stock actions"
```

---

### Task 7: Categories in Settings

**Files:**
- Modify: `composables/useCategories.js` (full rewrite below), `utils/icons.js`, `pages/settings.vue`
- Create: `components/CategoryManager.vue`
- Test: `tests/e2e/categories.spec.js`

**Interfaces:**
- Consumes: `ARTICLES` (Task 4) and the `BottomSheet`, `BaseCard` and `BaseButton` components.
- Produces:
  - `useCategories()` → `{ listCategories, createCategory(fields), updateCategory(id, fields), deleteCategory(id), countActiveArticles(id) }`.
  - `deleteCategory` throws `Error` with `inUse: number` when active articles use the category, and passes the PocketBase 400 through when hidden articles still reference it.
  - New icons: `chevron-up` and `chevron-down`.

- [ ] **Step 1: Write the failing tests**

`tests/e2e/categories.spec.js`:

```js
import { test, expect, gotoReady } from './fixtures.js'

const rows = page => page.getByRole('list', { name: 'Categories' }).getByRole('listitem')
const editor = page => page.getByRole('dialog')

test.describe('categories', () => {
  test.beforeEach(async ({ page, api }) => {
    api.seed({ articles: [{ id: 'k1', name: 'Pikachu Keychain', category: 'cat-keychain' }] })
    await gotoReady(page, '/settings#categories')
  })

  test('lists categories in order with their base prices', async ({ page }) => {
    await expect(rows(page)).toHaveCount(3)
    await expect(rows(page).nth(0)).toContainText('Big Figure')
    await expect(rows(page).nth(0)).toContainText('30,00')
    await expect(rows(page).nth(1)).toContainText('Keychain')
  })

  test('adding a category puts it last', async ({ page, api }) => {
    await page.getByRole('button', { name: 'Add category' }).click()
    await editor(page).getByLabel('Name').fill('Sticker')
    await editor(page).getByLabel('Base price').fill('2,50')
    await editor(page).getByRole('button', { name: 'Save' }).click()
    await expect(rows(page).nth(3)).toContainText('Sticker')
    expect(api.db.categories.find(c => c.name === 'Sticker')).toMatchObject({ base_price: 2.5, sort_order: 3 })
  })

  test('repricing a category', async ({ page, api }) => {
    await page.getByRole('button', { name: 'Edit Keychain' }).click()
    await editor(page).getByLabel('Base price').fill('5')
    await editor(page).getByRole('button', { name: 'Save' }).click()
    await expect(rows(page).nth(1)).toContainText('5,00')
    expect(api.db.categories.find(c => c.name === 'Keychain').base_price).toBe(5)
  })

  test('moving a category up swaps the order', async ({ page, api }) => {
    await page.getByRole('button', { name: 'Move Keychain up' }).click()
    await expect(rows(page).nth(0)).toContainText('Keychain')
    const order = [...api.db.categories].sort((a, b) => a.sort_order - b.sort_order).map(c => c.name)
    expect(order.slice(0, 2)).toEqual(['Keychain', 'Big Figure'])
  })

  test('a category in use cannot be deleted', async ({ page, api }) => {
    await page.getByRole('button', { name: 'Edit Keychain' }).click()
    await editor(page).getByRole('button', { name: 'Delete category' }).click()
    await editor(page).getByRole('button', { name: 'Delete', exact: true }).click()
    await expect(editor(page).getByRole('alert')).toHaveText('Move the 1 Keychain article first')
    expect(api.db.categories).toHaveLength(3)
  })

  test('an unused category can be deleted', async ({ page, api }) => {
    await page.getByRole('button', { name: 'Edit Coaster' }).click()
    await editor(page).getByRole('button', { name: 'Delete category' }).click()
    await editor(page).getByRole('button', { name: 'Delete', exact: true }).click()
    await expect(rows(page)).toHaveCount(2)
    expect(api.db.categories.map(c => c.name)).not.toContain('Coaster')
  })

  test('a category used by hidden articles explains why it cannot be deleted', async ({ page, api }) => {
    api.db.budget_tracket_catalog.push({ id: 'h1', name: 'Old Coaster', category: 'cat-coaster', active: false })
    await page.getByRole('button', { name: 'Edit Coaster' }).click()
    await editor(page).getByRole('button', { name: 'Delete category' }).click()
    await editor(page).getByRole('button', { name: 'Delete', exact: true }).click()
    await expect(editor(page).getByRole('alert')).toHaveText('Deleted articles still use this category, so it has to stay.')
    expect(api.db.categories).toHaveLength(3)
  })

  test('a duplicate name is rejected before saving', async ({ page }) => {
    await page.getByRole('button', { name: 'Add category' }).click()
    await editor(page).getByLabel('Name').fill('keychain')
    await editor(page).getByLabel('Base price').fill('3')
    await editor(page).getByRole('button', { name: 'Save' }).click()
    await expect(editor(page).getByRole('alert')).toHaveText('A category with this name already exists')
  })
})
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx playwright test tests/e2e/categories.spec.js`
Expected: FAIL. `#categories` isn't a known Settings section, so the page shows the default section and there is no `Categories` list.

- [ ] **Step 3: Add the icons**

In `utils/icons.js`, after the `'chevron-left'` entry, add:

```js
  'chevron-up': 'M5 15l7-7 7 7',
  'chevron-down': 'M19 9l-7 7-7-7',
```

- [ ] **Step 4: Rewrite `composables/useCategories.js`**

```js
import { usePocketBase } from './usePocketBase'
import { ARTICLES } from './useArticles'

const CATEGORIES = 'categories'

export const useCategories = () => {
  const pb = usePocketBase()

  const listCategories = () => pb.collection(CATEGORIES).getFullList({ sort: 'sort_order,name' })
  const createCategory = fields => pb.collection(CATEGORIES).create(fields)
  const updateCategory = (id, fields) => pb.collection(CATEGORIES).update(id, fields)

  const countActiveArticles = async (id) => {
    const result = await pb.collection(ARTICLES).getList(1, 1, {
      filter: pb.filter('category = {:id} && active = true', { id })
    })
    return result.totalItems
  }

  // Active articles must be moved first; hidden ones still block it in PocketBase (required relation)
  const deleteCategory = async (id) => {
    const inUse = await countActiveArticles(id)
    if (inUse > 0) throw Object.assign(new Error('Category in use'), { inUse })
    await pb.collection(CATEGORIES).delete(id)
  }

  return { listCategories, createCategory, updateCategory, deleteCategory, countActiveArticles }
}
```

- [ ] **Step 5: Create `components/CategoryManager.vue`**

```vue
<template>
  <BaseCard title="Categories" subtitle="Base prices apply to every article without its own price" icon="bag" flush>
    <template #actions>
      <BaseButton variant="ghost" icon="plus" aria-label="Add category" @click="openEditor(null)">Add</BaseButton>
    </template>

    <p v-if="loadError" class="px-4 py-6 text-sm text-expense md:px-5">{{ loadError }}</p>
    <p v-else-if="!categories.length" class="px-4 py-6 text-sm text-ink-muted md:px-5">No categories yet</p>
    <ul v-else class="divide-y divide-line" aria-label="Categories">
      <li v-for="(category, index) in categories" :key="category.id" class="flex items-center gap-1 py-1 pl-4 pr-1 md:pl-5">
        <button
          type="button"
          class="flex min-h-[44px] min-w-0 flex-1 items-center justify-between gap-3 text-left"
          :aria-label="`Edit ${category.name}`"
          @click="openEditor(category)"
        >
          <span class="truncate text-sm font-medium text-ink">{{ category.name }}</span>
          <span class="shrink-0 text-sm tabular-nums text-ink-muted">{{ formatCurrency(category.base_price) }}</span>
        </button>
        <button
          type="button"
          class="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg text-ink-muted hover:bg-muted disabled:opacity-30"
          :aria-label="`Move ${category.name} up`"
          :disabled="index === 0 || moving"
          @click="move(index, -1)"
        >
          <AppIcon name="chevron-up" class="h-4 w-4" />
        </button>
        <button
          type="button"
          class="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg text-ink-muted hover:bg-muted disabled:opacity-30"
          :aria-label="`Move ${category.name} down`"
          :disabled="index === categories.length - 1 || moving"
          @click="move(index, 1)"
        >
          <AppIcon name="chevron-down" class="h-4 w-4" />
        </button>
      </li>
    </ul>

    <BottomSheet v-model:open="isEditorOpen" :title="editing ? 'Edit category' : 'New category'">
      <form class="space-y-4" novalidate @submit.prevent="save">
        <p v-if="error" role="alert" class="rounded-lg bg-expense/10 px-3 py-2 text-sm text-expense">{{ error }}</p>
        <div>
          <label for="category-name" class="label">Name</label>
          <input id="category-name" v-model="form.name" type="text" class="input" autocomplete="off">
        </div>
        <div>
          <label for="category-price" class="label">Base price</label>
          <input id="category-price" v-model="form.basePrice" type="text" inputmode="decimal" class="input" placeholder="0.00">
        </div>
        <BaseButton type="submit" size="lg" block :loading="saving">Save</BaseButton>
      </form>

      <div v-if="editing" class="mt-6 border-t border-line pt-5">
        <BaseButton v-if="!confirmingDelete" variant="ghost" block icon="trash" @click="confirmingDelete = true">Delete category</BaseButton>
        <div v-else class="space-y-3">
          <p class="text-sm text-ink-muted">Delete “{{ editing.name }}”? This can't be undone.</p>
          <div class="grid grid-cols-2 gap-2">
            <BaseButton variant="secondary" @click="confirmingDelete = false">Cancel</BaseButton>
            <BaseButton variant="danger" :loading="deleting" @click="remove">Delete</BaseButton>
          </div>
        </div>
      </div>
    </BottomSheet>
  </BaseCard>
</template>

<script setup>
import { ref, onMounted } from 'vue'
import { useCategories } from '~/composables/useCategories'
import { formatCurrency } from '~/utils/currency'

const { listCategories, createCategory, updateCategory, deleteCategory } = useCategories()

const categories = ref([])
const loadError = ref('')
const isEditorOpen = ref(false)
const editing = ref(null)
const form = ref({ name: '', basePrice: '' })
const error = ref('')
const saving = ref(false)
const deleting = ref(false)
const confirmingDelete = ref(false)
const moving = ref(false)

const load = async () => {
  try {
    categories.value = await listCategories()
    loadError.value = ''
  } catch (err) {
    loadError.value = 'Could not load categories. Check your connection and try again.'
  }
}

onMounted(load)

const openEditor = (category) => {
  editing.value = category
  form.value = category ? { name: category.name, basePrice: String(category.base_price) } : { name: '', basePrice: '' }
  error.value = ''
  confirmingDelete.value = false
  isEditorOpen.value = true
}

const parsePrice = value => Number(String(value).trim().replace(',', '.'))

const validate = () => {
  const name = form.value.name.trim()
  if (!name) return 'Enter a name'
  const taken = categories.value.some(c => c.id !== editing.value?.id && c.name.toLowerCase() === name.toLowerCase())
  if (taken) return 'A category with this name already exists'
  // PocketBase 0.22 treats a required number of 0 as missing
  if (!(parsePrice(form.value.basePrice) > 0)) return 'Base price must be above 0'
  return ''
}

const save = async () => {
  error.value = validate()
  if (error.value) return
  saving.value = true
  const fields = { name: form.value.name.trim(), base_price: parsePrice(form.value.basePrice) }
  try {
    if (editing.value) {
      await updateCategory(editing.value.id, fields)
    } else {
      const last = categories.value.reduce((max, c) => Math.max(max, c.sort_order ?? 0), -1)
      await createCategory({ ...fields, sort_order: last + 1 })
    }
    await load()
    isEditorOpen.value = false
  } catch (err) {
    error.value = 'Could not save the category. Check your connection and try again.'
  } finally {
    saving.value = false
  }
}

const remove = async () => {
  deleting.value = true
  try {
    await deleteCategory(editing.value.id)
    await load()
    isEditorOpen.value = false
  } catch (err) {
    if (err.inUse) {
      error.value = `Move the ${err.inUse} ${editing.value.name} ${err.inUse === 1 ? 'article' : 'articles'} first`
    } else if (err.status === 400) {
      error.value = 'Deleted articles still use this category, so it has to stay.'
    } else {
      error.value = 'Could not delete the category. Check your connection and try again.'
    }
    confirmingDelete.value = false
  } finally {
    deleting.value = false
  }
}

// Writes the new positions of both swapped categories so equal sort_orders can't stall the move
const move = async (index, direction) => {
  const target = index + direction
  const reordered = [...categories.value]
  ;[reordered[index], reordered[target]] = [reordered[target], reordered[index]]
  moving.value = true
  try {
    await Promise.all([
      updateCategory(reordered[index].id, { sort_order: index }),
      updateCategory(reordered[target].id, { sort_order: target })
    ])
    categories.value = reordered.map((category, position) => ({ ...category, sort_order: position }))
  } catch (err) {
    loadError.value = 'Could not reorder categories. Check your connection and try again.'
  } finally {
    moving.value = false
  }
}
</script>
```

- [ ] **Step 6: Add the section to Settings**

In `pages/settings.vue`:
1. In `SETTINGS_CATEGORIES`, after the `display` entry, add:

```js
  { id: 'categories', name: 'Categories', description: 'Base prices and order', icon: 'bag' },
```

2. Directly before `<BaseCard v-if="activeCategory === 'notifications'"`, add:

```vue
        <CategoryManager v-if="activeCategory === 'categories'" />
```

- [ ] **Step 7: Run the tests to verify they pass**

Run: `npx playwright test tests/e2e/categories.spec.js tests/e2e/settings.spec.js`
Expected: all pass on both projects.

- [ ] **Step 8: Commit**

```bash
git add composables/useCategories.js utils/icons.js components/CategoryManager.vue pages/settings.vue tests/e2e/categories.spec.js
git commit -m "Manage categories, base prices and order in Settings"
```

---

### Task 8: Phone sweep, full verification and handover

**Files:**
- Modify: `tests/e2e/mobile.spec.js` (add the new pages to the sweep)
- Modify: `CLAUDE.md` (one line)

**Interfaces:**
- Consumes: everything above.

- [ ] **Step 1: Extend the 375px sweep**

In `tests/e2e/mobile.spec.js`, change the `PAGES` array to:

```js
const PAGES = [
  '/',
  '/catalog',
  '/business-card',
  '/reports',
  '/login',
  '/settings',
  '/settings#account',
  '/settings#api',
  '/settings#display',
  '/settings#categories',
  '/settings#notifications',
  '/settings#data'
]
```

The `api.mockCatalog(longProducts)` call already seeds categories and articles through the fake.

Run: `npx playwright test tests/e2e/mobile.spec.js --project=mobile`
Expected: all pass, with no horizontal scroll and no tap target under 44px. Any failure names the element; fix it in the component that owns it (usually a missing `min-w-0`/`truncate`, or an icon button without `h-11 w-11`), then re-run.

- [ ] **Step 2: Check the manage-mode sheet at 375px**

Append to the `phone layout sweep` describe block in `tests/e2e/mobile.spec.js`:

```js
  test('the article editor fits at 375px', async ({ page, api }) => {
    await api.mockCatalog(longProducts)
    await gotoReady(page, '/catalog')
    await page.getByRole('button', { name: 'Manage' }).click()
    await page.locator('h3').first().click()
    await expect(page.getByRole('dialog')).toBeVisible()
    const scrollWidth = await page.evaluate(() => document.documentElement.scrollWidth)
    expect(scrollWidth).toBeLessThanOrEqual(page.viewportSize().width)
    const clipped = await page.getByRole('dialog').evaluate(dialog => dialog.scrollWidth > dialog.clientWidth)
    expect(clipped).toBe(false)
  })
```

Run: `npx playwright test tests/e2e/mobile.spec.js --project=mobile -g "article editor"`
Expected: PASS.

- [ ] **Step 3: Note the conventions**

In `CLAUDE.md` `## Code Style Guidelines`, add as the last bullet:

```markdown
- Data access goes through the PocketBase SDK (`usePocketBase`, pinned `pocketbase@0.21.5` for server 0.22). Stock changes are `stock_movements` records written via `useInventory`; never patch an article's `stock` directly. Schema changes go through `scripts/pb-migrate.mjs`.
```

- [ ] **Step 4: Full verification**

Run: `npm run test:unit && npx playwright test`
Expected: unit tests `# fail 0`, and every Playwright test passes on both projects. Record the counts.

Production build: create a scratch worktree at HEAD with `node_modules` symlinked, run `npx nuxt build`, and serve it with `PORT=3100 node .output/server/index.mjs`. Then run `npx playwright test -c <temp config extending playwright.config.js with baseURL http://localhost:3100 and webServer undefined>`.
Expected: same results as against the dev server. Afterwards remove the worktree and stop the server.

- [ ] **Step 5: Commit**

```bash
git add tests/e2e/mobile.spec.js CLAUDE.md
git commit -m "Sweep new catalog and login screens at 375px"
```

- [ ] **Step 6: Hand the rollout to the owner**

Do not run the migration yourself. Report to the owner:
1. Put `POCKETBASE_ADMIN_TOKEN=…` in `.env` (from the PocketBase admin UI), and create the owner account in `users` if there isn't one.
2. Run `npm run pb:migrate`, review the plan and fix `scripts/category-mapping.json`, then run `npm run pb:migrate -- --apply`.
3. Deploy the app, then run `npm run pb:migrate -- --apply-rules`.
4. Set real stock counts with Manage → article → Correct count.
