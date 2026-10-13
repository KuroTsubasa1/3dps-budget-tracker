# Cart Deals Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** The cart prices itself from owner-managed deals ("N for X €" bundles and "each X € from N" groups), and stock replays the movement log with a per-step floor.

**Architecture:**
- A pure, cent-exact `priceCart(lines, deals)` in `utils/deals.js` is the single source of cart prices. The catalog cart, checkout amount and description all use it.
- Deals live in a new PocketBase `deals` collection: public read, owner-only writes. The sub-project 1 migration script creates and seeds it.
- The owner edits deals in a new Settings → Deals section.
- `stockFromMovements` replays movements in date order and floors at 0 at every step.

**Tech Stack:** Nuxt 3.21 / Vue 3.5 `<script setup>`, Tailwind tokens, PocketBase 0.22 with `pocketbase@0.21.5`, `node:test` unit tests, Playwright against the in-memory fake PocketBase.

**Spec:** `docs/superpowers/specs/2026-10-13-cart-deals-design.md`

## Global Constraints

- **Deal types:**
  - `bundle`: exactly 1 category; `min_qty` N ≥ 2; `price` = the price of N items together. Pairs plus singles: `floor(n/N) × price + (n mod N) × base`.
  - `group`: ≥ 1 category; once the regular items across the categories reach N, each costs `price`.
- **Articles with `price > 0`** (an override) are priced at their own price, never count toward a deal, and never get one.
- **At most one deal per category.** The Deals screen refuses overlaps with `<Category> is already in the deal "<name>"`.
- **Money:** all money maths in integer cents (`Math.round(x * 100)`). Results are returned in euros and shown with `formatCurrency()`.
- **Never surcharge:** a deal whose computed saving is ≤ 0 is not applied.
- **Invalid deals are skipped, never thrown on:** a deal with no categories, a bundle with more than one category, N < 2 or non-integer, or price ≤ 0.
- **Deal summary text** (`describeDeal`), used on the cards, the Deals list and the example:
  - bundle → `N for <formatCurrency(price)>`, e.g. `2 for 7,00 €`;
  - group → `<formatCurrency(price)> each from N`, e.g. `25,00 € each from 2`.
- **Checkout description** gets a final line `Deals: <name> (−<formatCurrency(saving)>), …` when deals applied. The transaction `amount` = `priceCart(...).total`.
- **Stock floor:** replay movements sorted by `created`, then `id`, with `stock = max(0, stock + change)` per movement. `recomputeStock` fetches with `sort: 'created,id'`.
- **`deals` collection (PocketBase 0.22 format):**
  - fields: `name` text required; `type` select `bundle|group` required; `categories` relation → categories, multiple, required; `min_qty` number noDecimal min 2 required; `price` number min 0 required;
  - created with public list/view and locked (null) writes;
  - `--apply-rules` sets owner rules: create/update/delete = `ownerRule(ownerId)`.
- **Deal seed:**
  - `Keychain 2 for 7`: bundle, [Keychain], 2, 7
  - `Mini Figure 2 for 15`: bundle, [Mini Figure], 2, 15
  - `Coaster 2 for 15`: bundle, [Coaster], 2, 15
  - `Bookmark 2 for 9`: bundle, [Bookmark], 2, 9
  - `Big items`: group, [Big Figure, Pokeball, CardridgeCase], 2, 25
- **Strings tests rely on:**
  - `Deals applied` (cart list label);
  - `Deals` (Settings list label and section name);
  - `Add deal`, `Edit <name>`, `Delete deal`, `Number of items (N)`, `Price`, `Deal type`;
  - the validation messages in Task 5.
- **Existing conventions:** semantic colour tokens, 44px tap targets, `BottomSheet` editors, `gotoReady`. Never stop the owner's `nuxt dev` on :3000. Never contact pocket.lasseharm.space. Never run `pb:migrate` with credentials or flags.

## Review Focus

1. **A deal priced worse than buying singly** (e.g. "2 for 9 €" on 4 € keychains) must never raise the price. The saving is ≤ 0, so the deal is not applied. *Pinned in Task 1: "a deal that would cost more is not applied".*
2. **Cent drift with odd prices** (2 for 4,99 € on 2,55 € items). 3 items must be exactly 7,54 €. *Pinned in Task 1: "cent arithmetic stays exact".*
3. **A group deal across categories with different base prices** must compute the saving against each item's own base. *Pinned in Task 1: "group savings use each item's own base price".*
4. **Deleting a category that a deal still uses.** PocketBase refuses (required relation), and the message must name the deal, not blame "deleted articles". *Pinned in Task 5: "a category used by a deal names the deal when deleting".*
5. **Editing an existing deal** must not trip the overlap check against itself. *Pinned in Task 5: "editing a deal's price keeps its categories".*

## Working setup

- The owner's `nuxt dev` serves this checkout on :3000, and Playwright reuses it. Cold-compile timeouts can happen on the first run after edits; re-run once before investigating.
- Unit tests: `npm run test:unit`. e2e: `npx playwright test <files>` (chromium and mobile projects).
- e2e talks only to the fake PocketBase in `tests/e2e/fake-pocketbase.js`, via the `api` fixture in `tests/e2e/fixtures.js`.

## File map

| File | Responsibility | Task |
|---|---|---|
| `utils/deals.js` | `priceCart`, `describeDeal`, `isValidDeal`, `dealForCategory` | 1 |
| `tests/unit/deals.test.js` | engine unit tests | 1 |
| `utils/inventory.js`, `composables/useInventory.js` | per-step stock floor | 2 |
| `scripts/lib/pb-plan.mjs`, `scripts/pb-migrate.mjs` | `deals` collection, rules, seed | 3 |
| `tests/unit/pb-plan.test.js` | planner tests | 3 |
| `tests/e2e/fake-pocketbase.js`, `tests/e2e/fixtures.js` | `deals` in the fake and in `api.seed` | 4 |
| `composables/useDeals.js` | deals data access | 4 |
| `pages/catalog.vue`, `components/CartPanel.vue` | cart pricing, deal rows, card hints, checkout | 4 |
| `components/DealManager.vue`, `pages/settings.vue`, `components/CategoryManager.vue` | Deals screen, category delete message | 5 |
| `tests/e2e/deals.spec.js`, `tests/e2e/mobile.spec.js` | e2e | 4, 5 |

---

### Task 1: Pricing engine

**Files:**
- Create: `utils/deals.js`
- Create: `tests/unit/deals.test.js`

**Interfaces:**
- Produces:
  - `priceCart(lines, deals = []) → { lines: PricedLine[], applied: AppliedDeal[], subtotal, savings, total }`
    - `line`: `{ articleId, name, quantity, categoryId, basePrice, override }`
    - `PricedLine`: `line` plus `{ unitPrice, lineTotal }`
    - `AppliedDeal`: `{ dealId, name, saving, description }`
  - `describeDeal(deal) → string`
  - `isValidDeal(deal) → boolean`
  - `dealForCategory(deals, categoryId) → deal | undefined` (valid deals only)

- [ ] **Step 1: Write the failing tests**

`tests/unit/deals.test.js`:

```js
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { priceCart, describeDeal, isValidDeal, dealForCategory } from '../../utils/deals.js'

const KEYCHAIN = { categoryId: 'key', basePrice: 4 }
const FIGURE = { categoryId: 'fig', basePrice: 30 }
const POKEBALL = { categoryId: 'poke', basePrice: 30 }
const CASE = { categoryId: 'case', basePrice: 30 }

const DEALS = [
  { id: 'd-key', name: 'Keychain 2 for 7', type: 'bundle', categories: ['key'], min_qty: 2, price: 7 },
  { id: 'd-big', name: 'Big items', type: 'group', categories: ['fig', 'poke', 'case'], min_qty: 2, price: 25 }
]

const line = (kind, quantity, extra = {}) =>
  ({ articleId: `${kind.categoryId}-${extra.id ?? 1}`, name: extra.name ?? kind.categoryId, quantity, override: 0, ...kind, ...extra })

const total = (lines, deals = DEALS) => priceCart(lines, deals).total

test('keychains: pairs at the pair price, leftovers at full price', () => {
  assert.equal(total([line(KEYCHAIN, 1)]), 4)
  assert.equal(total([line(KEYCHAIN, 2)]), 7)
  assert.equal(total([line(KEYCHAIN, 3)]), 11)
  assert.equal(total([line(KEYCHAIN, 4)]), 14)
  assert.equal(total([line(KEYCHAIN, 5)]), 18)
})

test('bundle counts across several articles of the same category', () => {
  assert.equal(total([line(KEYCHAIN, 1, { id: 'a' }), line(KEYCHAIN, 2, { id: 'b' })]), 11)
})

test('big items: any 2+ from the group cost 25 each', () => {
  assert.equal(total([line(FIGURE, 1)]), 30)
  assert.equal(total([line(FIGURE, 2)]), 50)
  assert.equal(total([line(FIGURE, 1), line(POKEBALL, 1)]), 50)
  assert.equal(total([line(POKEBALL, 1), line(CASE, 1)]), 50)
  assert.equal(total([line(FIGURE, 1), line(POKEBALL, 1), line(CASE, 1)]), 75)
})

test('an overridden article neither gets nor unlocks a deal', () => {
  assert.equal(total([line(POKEBALL, 1), line(POKEBALL, 1, { id: 'gold', override: 45 })]), 75)
  assert.equal(total([line(KEYCHAIN, 1), line(KEYCHAIN, 1, { id: 'gold', override: 6 })]), 10)
})

test('deals for different categories apply side by side', () => {
  const result = priceCart([line(KEYCHAIN, 2), line(FIGURE, 1)], DEALS)
  assert.equal(result.total, 37)
  assert.deepEqual(result.applied.map(deal => deal.name), ['Keychain 2 for 7'])
})

test('an empty cart costs nothing', () => {
  assert.deepEqual(priceCart([], DEALS), { lines: [], applied: [], subtotal: 0, savings: 0, total: 0 })
})

test('savings are attributed per deal and add up to subtotal minus total', () => {
  const result = priceCart([line(KEYCHAIN, 3), line(FIGURE, 1), line(POKEBALL, 1)], DEALS)
  assert.equal(result.subtotal, 72)
  assert.deepEqual(result.applied.map(deal => [deal.dealId, deal.saving]), [['d-key', 1], ['d-big', 10]])
  assert.equal(result.savings, 11)
  assert.equal(result.total, 61)
})

test('lines carry their unit price and undiscounted line total', () => {
  const [priced] = priceCart([line(KEYCHAIN, 3)], DEALS).lines
  assert.equal(priced.unitPrice, 4)
  assert.equal(priced.lineTotal, 12)
  const [own] = priceCart([line(KEYCHAIN, 2, { override: 6 })], DEALS).lines
  assert.equal(own.unitPrice, 6)
  assert.equal(own.lineTotal, 12)
})

test('a deal that would cost more is not applied', () => {
  const pricey = [{ id: 'bad', name: '2 for 9', type: 'bundle', categories: ['key'], min_qty: 2, price: 9 }]
  const result = priceCart([line(KEYCHAIN, 2)], pricey)
  assert.equal(result.total, 8)
  assert.deepEqual(result.applied, [])
})

test('cent arithmetic stays exact', () => {
  const odd = [{ id: 'odd', name: '2 for 4,99', type: 'bundle', categories: ['x'], min_qty: 2, price: 4.99 }]
  assert.equal(total([{ articleId: 'x1', name: 'x', quantity: 3, categoryId: 'x', basePrice: 2.55, override: 0 }], odd), 7.54)
  assert.equal(total([{ articleId: 'y1', name: 'y', quantity: 3, categoryId: 'y', basePrice: 0.1, override: 0 }], []), 0.3)
})

test("group savings use each item's own base price", () => {
  const mixed = [{ id: 'mix', name: 'Mix', type: 'group', categories: ['a', 'b'], min_qty: 2, price: 10 }]
  const result = priceCart([
    { articleId: 'a1', name: 'a', quantity: 1, categoryId: 'a', basePrice: 12, override: 0 },
    { articleId: 'b1', name: 'b', quantity: 1, categoryId: 'b', basePrice: 15, override: 0 }
  ], mixed)
  assert.equal(result.subtotal, 27)
  assert.equal(result.applied[0].saving, 7)
  assert.equal(result.total, 20)
})

test('invalid deals are skipped instead of throwing', () => {
  const broken = [
    { id: 'none', name: 'no categories', type: 'bundle', categories: [], min_qty: 2, price: 7 },
    { id: 'two', name: 'bundle on two', type: 'bundle', categories: ['key', 'fig'], min_qty: 2, price: 7 },
    { id: 'one', name: 'N of 1', type: 'bundle', categories: ['key'], min_qty: 1, price: 3 },
    { id: 'free', name: 'free', type: 'group', categories: ['fig'], min_qty: 2, price: 0 },
    { id: 'kind', name: 'unknown type', type: 'percent', categories: ['key'], min_qty: 2, price: 1 }
  ]
  assert.equal(total([line(KEYCHAIN, 2), line(FIGURE, 2)], broken), 68)
  broken.forEach(deal => assert.equal(isValidDeal(deal), false, deal.name))
  DEALS.forEach(deal => assert.equal(isValidDeal(deal), true, deal.name))
})

test('deals describe themselves', () => {
  assert.match(describeDeal(DEALS[0]), /^2 for 7,00\s€$/)
  assert.match(describeDeal(DEALS[1]), /^25,00\s€ each from 2$/)
})

test('dealForCategory finds the valid deal a category belongs to', () => {
  assert.equal(dealForCategory(DEALS, 'poke').id, 'd-big')
  assert.equal(dealForCategory(DEALS, 'nope'), undefined)
})
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npm run test:unit`
Expected: `deals.test.js` fails with `Cannot find module '.../utils/deals.js'`. The other suites still pass.

- [ ] **Step 3: Implement**

`utils/deals.js`:

```js
import { formatCurrency } from './currency.js'

// Cart pricing for the shop's two deal types, computed in whole cents.
// See docs/superpowers/specs/2026-10-13-cart-deals-design.md
const toCents = value => Math.round(Number(value) * 100)
const toEuros = cents => cents / 100

export const isValidDeal = (deal) => {
  const categories = Array.isArray(deal?.categories) ? deal.categories : []
  const minQty = Number(deal?.min_qty)
  return (deal?.type === 'bundle' || deal?.type === 'group') &&
    categories.length > 0 &&
    (deal.type !== 'bundle' || categories.length === 1) &&
    Number.isInteger(minQty) && minQty >= 2 &&
    Number(deal.price) > 0
}

export const describeDeal = deal =>
  deal.type === 'bundle'
    ? `${deal.min_qty} for ${formatCurrency(Number(deal.price))}`
    : `${formatCurrency(Number(deal.price))} each from ${deal.min_qty}`

export const dealForCategory = (deals, categoryId) =>
  deals.filter(isValidDeal).find(deal => deal.categories.includes(categoryId))

// lines: { articleId, name, quantity, categoryId, basePrice, override } — override > 0 is the article's own price
export function priceCart (lines, deals = []) {
  const priced = lines.map((line) => {
    const unitPrice = Number(line.override) > 0 ? Number(line.override) : Number(line.basePrice) || 0
    return { ...line, unitPrice, lineTotal: toEuros(toCents(unitPrice) * line.quantity) }
  })
  // Overridden articles are special: they never count toward, or receive, a deal
  const regular = priced.filter(line => !(Number(line.override) > 0) && line.quantity > 0)
  const applied = []

  for (const deal of deals.filter(isValidDeal)) {
    const members = regular.filter(line => deal.categories.includes(line.categoryId))
    const count = members.reduce((sum, line) => sum + line.quantity, 0)
    const n = Number(deal.min_qty)
    if (count < n) continue

    const fullCents = members.reduce((sum, line) => sum + toCents(line.unitPrice) * line.quantity, 0)
    const priceCents = toCents(deal.price)
    // A bundle covers one category, so its members share one base price
    const dealCents = deal.type === 'bundle'
      ? Math.floor(count / n) * priceCents + (count % n) * toCents(members[0].unitPrice)
      : count * priceCents
    const saving = fullCents - dealCents
    // Never surcharge: a deal priced worse than buying singly is ignored
    if (saving > 0) applied.push({ dealId: deal.id, name: deal.name, saving: toEuros(saving), description: describeDeal(deal) })
  }

  const subtotalCents = priced.reduce((sum, line) => sum + toCents(line.unitPrice) * line.quantity, 0)
  const savingsCents = applied.reduce((sum, deal) => sum + toCents(deal.saving), 0)
  return {
    lines: priced,
    applied,
    subtotal: toEuros(subtotalCents),
    savings: toEuros(savingsCents),
    total: toEuros(subtotalCents - savingsCents)
  }
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npm run test:unit`
Expected: all pass (`deals.test.js` adds 15 tests) and `fail 0`.

- [ ] **Step 5: Commit**

```bash
git add utils/deals.js tests/unit/deals.test.js
git commit -m "Add cart pricing engine for bundle and group deals"
```

---

### Task 2: Stock floor per movement

**Files:**
- Modify: `utils/inventory.js` (`stockFromMovements`), `composables/useInventory.js` (`recomputeStock`)
- Modify: `tests/unit/inventory.test.js`, `tests/e2e/inventory.spec.js`

**Interfaces:**
- Produces: `stockFromMovements(movements: Array<{ change, created?, id? }>) → number`, which replays in `created`, then `id`, order and floors at 0 each step.

- [ ] **Step 1: Write the failing tests**

Append to `tests/unit/inventory.test.js`:

```js
const DOUBLE_SALE = [
  { id: 'a', change: 1, created: '2020-01-01 00:00:00.000Z' },
  { id: 'b', change: -1, created: '2021-01-01 00:00:00.000Z' },
  { id: 'c', change: -1, created: '2021-01-01 00:00:01.000Z' },
  { id: 'd', change: 3, created: '2022-01-01 00:00:00.000Z' }
]

test('stock never dips below 0 at any step, so a later printed batch counts in full', () => {
  assert.equal(stockFromMovements(DOUBLE_SALE), 3)
})

test('movements are replayed in date order whatever order they arrive in', () => {
  assert.equal(stockFromMovements([...DOUBLE_SALE].reverse()), 3)
})

test('equal timestamps fall back to id order', () => {
  assert.equal(stockFromMovements([
    { id: 'b', change: 2, created: '2021-01-01 00:00:00.000Z' },
    { id: 'a', change: -1, created: '2021-01-01 00:00:00.000Z' }
  ]), 2)
})
```

Append to `tests/e2e/inventory.spec.js` (it already defines `keychain`, `card` and `loggedMovements`):

```js
test('printing after a double sale of the last item counts in full', async ({ page, api }) => {
  api.seed({ articles: [keychain({ stock: 1 })] })
  // Two devices sold the last one at the same moment
  api.db.stock_movements.push(
    { id: 'dbl00000000001a', collectionName: 'stock_movements', article: 'k1', change: -1, reason: 'sale', note: '', created: '2021-01-01 00:00:00.000Z' },
    { id: 'dbl00000000002a', collectionName: 'stock_movements', article: 'k1', change: -1, reason: 'sale', note: '', created: '2021-01-01 00:00:01.000Z' }
  )
  api.db.budget_tracket_catalog[0].stock = 0
  await gotoReady(page, '/catalog')
  await page.getByRole('button', { name: 'Manage' }).click()
  await card(page, 'Pikachu Keychain').click()
  const sheet = page.getByRole('dialog')
  await sheet.getByLabel('Add printed').fill('3')
  await sheet.getByRole('button', { name: 'Add', exact: true }).click()

  await expect(sheet.getByTestId('article-stock')).toHaveText('3')
  expect(api.db.budget_tracket_catalog[0].stock).toBe(3)
})
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npm run test:unit`
Expected: `stock never dips below 0 at any step…` fails with `2 !== 3`, and the reversed-order test fails with `3` vs whatever the plain sum gives (`2`).

Run: `npx playwright test tests/e2e/inventory.spec.js -g "double sale"`
Expected: FAIL. `article-stock` shows `2`.

- [ ] **Step 3: Implement**

In `utils/inventory.js`, replace `stockFromMovements` with:

```js
// Replayed in date order (id breaks ties) and floored at every step: a printed batch after an oversell counts in full
const byCreated = (a, b) =>
  String(a.created ?? '').localeCompare(String(b.created ?? '')) || String(a.id ?? '').localeCompare(String(b.id ?? ''))

export const stockFromMovements = movements =>
  [...movements].sort(byCreated).reduce((stock, movement) => Math.max(0, stock + Number(movement.change)), 0)
```

In `composables/useInventory.js` `recomputeStock`, change the `getFullList` options to:

```js
      filter: pb.filter('article = {:id}', { id: articleId }),
      sort: 'created,id',
      fields: 'id,change,created'
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npm run test:unit` → `fail 0`.
Run: `npx playwright test tests/e2e/inventory.spec.js tests/e2e/articles.spec.js` → all pass.

- [ ] **Step 5: Commit**

```bash
git add utils/inventory.js composables/useInventory.js tests/unit/inventory.test.js tests/e2e/inventory.spec.js
git commit -m "Floor stock at every movement so printed batches count in full"
```

---

### Task 3: `deals` collection in the migration

**Files:**
- Modify: `scripts/lib/pb-plan.mjs`, `scripts/pb-migrate.mjs`, `tests/unit/pb-plan.test.js`

**Interfaces:**
- Produces in `pb-plan.mjs`:
  - `DEAL_SEED`: an array of `{ name, type, categoryNames: string[], min_qty, price }`.
  - `planDealSeed(existingDeals, categories) → { create: DealRecord[], skipped: Array<{ name, reason }> }`
    - `categories` is `[{ id, name }]`; `existingDeals` is `[{ categories: string[] }]`;
    - a `DealRecord` is `{ name, type, categories: string[], min_qty, price }`.
  - `planSchema` creates `deals` when it is missing; `rulesFor` gains `deals`; `simulate` resolves `@<name>` relation targets in created collections.

- [ ] **Step 1: Write the failing tests**

In `tests/unit/pb-plan.test.js`:

1. Add `DEAL_SEED` and `planDealSeed` to the import list.
2. In 'plans the new collections, article fields and optional price', change the expected ops to:

```js
  assert.deepEqual(opKeys(ops), [
    'createCollection:categories',
    'createCollection:stock_movements',
    'createCollection:deals',
    `addFields:${ARTICLES}`,
    `updateField:${ARTICLES}.price`
  ])
  assert.deepEqual(ops[3].fields.map(field => field.name), ['category', 'stock', 'low_stock_threshold'])
```

3. In 'rules pin the owner record id, close sign-up first, and apply only once', change the expected ops to:

```js
  assert.deepEqual(opKeys(ops), [
    'setRules:users',
    'setRules:categories',
    'setRules:deals',
    'setRules:stock_movements',
    `setRules:${ARTICLES}`,
    'setRules:budget_tracker_transactions'
  ])
```

4. Append:

```js
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
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npm run test:unit`
Expected: FAIL. `DEAL_SEED` and `planDealSeed` are not exported, and the op lists lack `deals`.

- [ ] **Step 3: Implement the planner**

In `scripts/lib/pb-plan.mjs`:

1. Give `relation` a `maxSelect` parameter:

```js
const relation = (name, collectionId, required = false, maxSelect = 1) =>
  ({ name, type: 'relation', required, presentable: false, options: { collectionId, cascadeDelete: false, minSelect: null, maxSelect, displayFields: null } })
```

2. After `CATEGORY_SEED`, add:

```js
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
```

3. In `rulesFor`, after the `categories` entry, add:

```js
    deals: { listRule: '', viewRule: '', createRule: O, updateRule: O, deleteRule: O },
```

4. In `planSchema`, directly after the `stock_movements` block, add:

```js
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
```

5. In `simulate`, in the `createCollection` branch, resolve relation targets:

```js
      result.push({ id: `sim_${op.name}`, ...structuredClone(op.body), schema: op.body.schema.map(field => ({ id: `sim_${op.name}_${field.name}`, ...resolveField(field, result) })) })
```

- [ ] **Step 4: Wire the CLI**

In `scripts/pb-migrate.mjs`:

1. Add `DEAL_SEED` and `planDealSeed` to the import list.
2. In `applyOp`, resolve relation targets for created collections. Replace `if (op.op === 'createCollection') return api('POST', '/collections', op.body)` with:

```js
  if (op.op === 'createCollection') {
    return api('POST', '/collections', { ...op.body, schema: op.body.schema.map(field => resolveField(field, collections)) })
  }
```

3. In `writeSnapshot`, add `'deals'` to the `ours` set.
4. In `migrateSchema`, directly after the `Categories to add` / `Categories: all present` log, add the dry-run report:

```js
  const existingDeals = byName(collections, 'deals') ? await listRecords('deals') : []
  // Dry run: categories that will be seeded count as present
  const plannedCategories = [...existing, ...seed.map(item => ({ id: `new:${item.name}`, name: item.name }))]
  const dealPlan = planDealSeed(existingDeals, plannedCategories)
  console.log(dealPlan.create.length ? `Deals to add: ${dealPlan.create.map(deal => deal.name).join(', ')}` : 'Deals: nothing to add')
  dealPlan.skipped.forEach(item => console.log(`  - skip ${item.name}: ${item.reason}`))
```

5. In the apply path, directly after `const categories = await listRecords('categories')`, add:

```js
  const { create: dealsToCreate } = planDealSeed(await listRecords('deals'), categories)
  for (const deal of dealsToCreate) await api('POST', '/collections/deals/records', deal)
```

6. Update the file's header comment to mention deals (`schema + seed (categories, deals) + category mapping`).

- [ ] **Step 5: Run the tests to verify they pass**

Run: `npm run test:unit`
Expected: `fail 0`, with the 6 new `pb-plan` tests passing.

Run: `env -u POCKETBASE_ADMIN_TOKEN -u POCKETBASE_ADMIN_EMAIL -u POCKETBASE_ADMIN_PASSWORD node scripts/pb-migrate.mjs; echo "exit $?"`, but only if `test -f .env` fails (no `.env`).
Expected: the credentials message and `exit 1`, with no network call. If `.env` exists, skip this check.

- [ ] **Step 6: Commit**

```bash
git add scripts/lib/pb-plan.mjs scripts/pb-migrate.mjs tests/unit/pb-plan.test.js
git commit -m "Create and seed the deals collection in the migration"
```

---

### Task 4: Deal pricing in the catalog cart

**Files:**
- Modify: `tests/e2e/fake-pocketbase.js` (`deals` collection), `tests/e2e/fixtures.js` (`seed({ deals })`)
- Create: `composables/useDeals.js`
- Modify: `pages/catalog.vue`, `components/CartPanel.vue`
- Create: `tests/e2e/deals.spec.js`

**Interfaces:**
- Consumes (Task 1): `priceCart`, `describeDeal` and `dealForCategory`.
- Produces:
  - `useDeals() → { listDeals(), createDeal(fields), updateDeal(id, fields), deleteDeal(id) }`, with `listDeals` sorted by name.
  - `CartPanel` takes a new prop, `applied: AppliedDeal[]` (default `[]`).
  - `api.seed({ categories?, articles?, deals? })`.

- [ ] **Step 1: Teach the fake about deals**

In `tests/e2e/fake-pocketbase.js`:
- add `'deals'` to `COLLECTIONS`;
- add `deals: {}` to `DEFAULTS`.

In `tests/e2e/fixtures.js` `seed`:
- change the signature to `seed ({ categories = SAMPLE_CATEGORIES, articles = [], deals = [] } = {})`;
- after the categories push, add `fake.db.deals.push(...structuredClone(deals))`.

- [ ] **Step 2: Write the failing tests**

`tests/e2e/deals.spec.js`:

```js
import { test, expect, gotoReady } from './fixtures.js'

export const DEAL_CATEGORIES = [
  { id: 'cat-keychain', name: 'Keychain', base_price: 4, sort_order: 0 },
  { id: 'cat-figure', name: 'Big Figure', base_price: 30, sort_order: 1 },
  { id: 'cat-pokeball', name: 'Pokeball', base_price: 30, sort_order: 2 },
  { id: 'cat-coaster', name: 'Coaster', base_price: 8, sort_order: 3 },
  { id: 'cat-bookmark', name: 'Bookmark', base_price: 5, sort_order: 4 }
]

export const DEALS = [
  { id: 'deal-keychain00', name: 'Keychain 2 for 7', type: 'bundle', categories: ['cat-keychain'], min_qty: 2, price: 7 },
  { id: 'deal-bigitems00', name: 'Big items', type: 'group', categories: ['cat-figure', 'cat-pokeball'], min_qty: 2, price: 25 }
]

const ARTICLES = [
  { id: 'k1', name: 'Pikachu Keychain', category: 'cat-keychain' },
  { id: 'f1', name: 'Glurak Figure', category: 'cat-figure' },
  { id: 'p1', name: 'Master Ball', category: 'cat-pokeball' },
  { id: 'p2', name: 'Golden Pokeball', category: 'cat-pokeball', price: 45 }
]

const card = (page, name) => page.locator('h3', { hasText: name })
const isCompact = page => page.viewportSize().width < 1024
const cart = page => (isCompact(page) ? page.getByRole('dialog', { name: 'Cart' }) : page.locator('aside'))

const addToCart = async (page, name, times = 1) => {
  for (let i = 0; i < times; i++) await card(page, name).click()
}

const openCart = async (page) => {
  if (isCompact(page)) await page.getByRole('button', { name: /View cart/ }).click()
}

test.describe('cart deals', () => {
  test.beforeEach(async ({ page, api }) => {
    api.seed({ categories: DEAL_CATEGORIES, articles: ARTICLES, deals: DEALS })
    await api.mockTransactions()
    await gotoReady(page, '/catalog')
  })

  test('cards show the deal their article belongs to', async ({ page }) => {
    await expect(page.locator('article', { hasText: 'Pikachu Keychain' })).toContainText('2 for 7,00')
    await expect(page.locator('article', { hasText: 'Glurak Figure' })).toContainText('25,00 € each from 2')
    await expect(page.locator('article', { hasText: 'Golden Pokeball' })).not.toContainText('each from')
  })

  test('three keychains cost one pair plus a single', async ({ page, api }) => {
    await addToCart(page, 'Pikachu Keychain', 3)
    await openCart(page)
    await expect(cart(page).getByRole('list', { name: 'Deals applied' })).toContainText('Keychain 2 for 7')
    await expect(cart(page).getByTestId('cart-total')).toContainText('11,00')
    await cart(page).getByRole('button', { name: 'Add to Balance' }).click()

    await expect.poll(() => api.posted.length).toBe(1)
    expect(api.posted[0].amount).toBe(11)
    expect(api.posted[0].description).toContain('Deals: Keychain 2 for 7')
  })

  test('mixed big items unlock the group price', async ({ page, api }) => {
    await addToCart(page, 'Glurak Figure')
    await addToCart(page, 'Master Ball')
    await openCart(page)
    await expect(cart(page).getByTestId('cart-total')).toContainText('50,00')
    await cart(page).getByRole('button', { name: 'Add to Balance' }).click()
    await expect.poll(() => api.posted.length).toBe(1)
    expect(api.posted[0].amount).toBe(50)
  })

  test('an overridden article neither gets nor unlocks a deal', async ({ page }) => {
    await addToCart(page, 'Master Ball')
    await addToCart(page, 'Golden Pokeball')
    await openCart(page)
    await expect(cart(page).getByTestId('cart-total')).toContainText('75,00')
    await expect(cart(page).getByRole('list', { name: 'Deals applied' })).toHaveCount(0)
  })
})
```

- [ ] **Step 3: Run the tests to verify they fail**

Run: `npx playwright test tests/e2e/deals.spec.js`
Expected: FAIL. There is no deal hint, no `Deals applied` list and no `cart-total` test id, and the totals are undiscounted (12,00 instead of 11,00).

- [ ] **Step 4: Add the data access**

`composables/useDeals.js`:

```js
import { usePocketBase } from './usePocketBase'

const DEALS = 'deals'

export const useDeals = () => {
  const pb = usePocketBase()

  const listDeals = () => pb.collection(DEALS).getFullList({ sort: 'name' })
  const createDeal = fields => pb.collection(DEALS).create(fields)
  const updateDeal = (id, fields) => pb.collection(DEALS).update(id, fields)
  const deleteDeal = id => pb.collection(DEALS).delete(id)

  return { listDeals, createDeal, updateDeal, deleteDeal }
}
```

- [ ] **Step 5: Show deals in the cart panel**

In `components/CartPanel.vue`:
1. On the total paragraph `<p class="text-2xl font-semibold tabular-nums text-ink">{{ formatCurrency(total) }}</p>`, add `data-testid="cart-total"`.
2. Directly after the closing `</ul>` of the items list (before the empty-cart `<div v-else …>`), add:

```vue
    <ul v-if="applied.length" class="space-y-1 rounded-lg bg-accent/10 px-3 py-2 text-sm" aria-label="Deals applied">
      <li v-for="deal in applied" :key="deal.dealId" class="flex items-center justify-between gap-3">
        <span class="min-w-0 truncate text-ink">{{ deal.name }}</span>
        <span class="shrink-0 font-medium tabular-nums text-accent">−{{ formatCurrency(deal.saving) }}</span>
      </li>
    </ul>
```

3. In `defineProps`, after `priceOf`, add a comma and `applied: { type: Array, default: () => [] }`.

- [ ] **Step 6: Price the catalog cart with deals**

In `pages/catalog.vue`:

1. Imports. Add these after the `useCategories` import:

```js
import { useDeals } from '~/composables/useDeals'
```

and these after the `effectivePrice` import:

```js
import { priceCart, describeDeal, dealForCategory } from '~/utils/deals'
```

2. After `const { listCategories } = useCategories()`, add `const { listDeals } = useDeals()`. After `const categories = ref([])`, add `const deals = ref([])`.

3. In `fetchProducts`, replace the `Promise.all` line and the assignments with:

```js
    const [articles, categoryList, dealList] = await Promise.all([listActive(), listCategories(), listDeals()])
    products.value = articles.map(item => ({ ...item, quantity: 0 }))
    categories.value = categoryList
    deals.value = dealList
```

4. Replace the `totalAmount` computed with:

```js
// Cart lines in the shape priceCart expects; an article's own price (> 0) is an override that skips deals
const cartLines = computed(() => selectedProducts.value.map(product => ({
  articleId: product.id,
  name: product.name,
  quantity: product.quantity,
  categoryId: product.category,
  basePrice: product.expand?.category?.base_price ?? 0,
  override: Number(product.price) > 0 ? Number(product.price) : 0
})))

const pricedCart = computed(() => priceCart(cartLines.value, deals.value))
const totalAmount = computed(() => pricedCart.value.total)

// Card hint: only regular (non-override) articles take part in deals
const dealHint = (product) => {
  if (Number(product.price) > 0) return ''
  const deal = dealForCategory(deals.value, product.category)
  return deal ? describeDeal(deal) : ''
}
```

5. In `submitToBalance`, replace the line `addTransaction({` together with its `description` line with:

```js
  const dealNote = pricedCart.value.applied.length
    ? `\nDeals: ${pricedCart.value.applied.map(deal => `${deal.name} (−${formatCurrency(deal.saving)})`).join(', ')}`
    : ''

  addTransaction({
    description: `3D Printing Products:\n${productNames}${dealNote}`,
```

The `amount: total` line stays. `total` is still `totalAmount.value`, which is now deal-priced.

6. Template:
   - On both `<CartPanel …>` usages, add `:applied="pricedCart.applied"` after `:price-of="priceOf"`.
   - In the product card, directly after the stock badge `<span …>{{ stockLabel(product) }}</span>`, add:

```vue
              <span v-if="dealHint(product)" class="self-start rounded-full bg-accent/10 px-2 py-0.5 text-xs font-medium text-accent">
                {{ dealHint(product) }}
              </span>
```

- [ ] **Step 7: Run the tests to verify they pass**

Run: `npx playwright test tests/e2e/deals.spec.js tests/e2e/catalog.spec.js tests/e2e/inventory.spec.js`
Expected: all pass on both projects.

Run: `npx playwright test` (full) and `npm run test:unit`.
Expected: `0 failed`, `fail 0`.

- [ ] **Step 8: Commit**

```bash
git add tests/e2e/fake-pocketbase.js tests/e2e/fixtures.js composables/useDeals.js components/CartPanel.vue pages/catalog.vue tests/e2e/deals.spec.js
git commit -m "Price the catalog cart with deals and show applied savings"
```

---

### Task 5: Deals screen in Settings

**Files:**
- Create: `components/DealManager.vue`
- Modify: `pages/settings.vue`, `components/CategoryManager.vue`, `composables/useCategories.js`
- Modify: `tests/e2e/deals.spec.js` (append), `tests/e2e/categories.spec.js` (append), `tests/e2e/mobile.spec.js`

**Interfaces:**
- Consumes:
  - from Task 4: `useDeals`;
  - from Task 1: `describeDeal`, `priceCart` and `isValidDeal`;
  - from sub-project 1: `useCategories().listCategories`, plus `BottomSheet`, `BaseCard`, `BaseButton` and `SegmentedControl`.
- Produces:
  - Settings section id `deals`.
  - `useCategories().deleteCategory` throws `Error` with `deal: { name }` when a deal references the category.

- [ ] **Step 1: Write the failing tests**

Append to `tests/e2e/deals.spec.js`:

```js
test.describe('managing deals', () => {
  const editor = page => page.getByRole('dialog')
  const dealList = page => page.getByRole('list', { name: 'Deals' })

  test.beforeEach(async ({ page, api }) => {
    api.seed({ categories: DEAL_CATEGORIES, articles: [], deals: DEALS })
    await gotoReady(page, '/settings#deals')
  })

  test('lists deals with their terms and categories', async ({ page }) => {
    await expect(dealList(page)).toContainText('Keychain 2 for 7')
    await expect(dealList(page)).toContainText('2 for 7,00')
    await expect(dealList(page)).toContainText('Big Figure, Pokeball')
  })

  test('creating an "N for X" deal shows a live example', async ({ page, api }) => {
    await page.getByRole('button', { name: 'Add deal' }).click()
    await editor(page).getByLabel('Name').fill('Coaster 2 for 15')
    await editor(page).getByLabel('Coaster').check()
    await editor(page).getByLabel('Number of items (N)').fill('2')
    await editor(page).getByLabel('Price', { exact: true }).fill('15')
    await expect(editor(page).getByTestId('deal-example')).toContainText('3 items')
    await expect(editor(page).getByTestId('deal-example')).toContainText('23,00')
    await editor(page).getByRole('button', { name: 'Save' }).click()

    await expect(dealList(page)).toContainText('Coaster 2 for 15')
    expect(api.db.deals.find(deal => deal.name === 'Coaster 2 for 15'))
      .toMatchObject({ type: 'bundle', categories: ['cat-coaster'], min_qty: 2, price: 15 })
  })

  test('a category can only be in one deal', async ({ page, api }) => {
    await page.getByRole('button', { name: 'Add deal' }).click()
    await editor(page).getByLabel('Name').fill('Second keychain deal')
    await editor(page).getByLabel('Keychain').check()
    await editor(page).getByLabel('Number of items (N)').fill('3')
    await editor(page).getByLabel('Price', { exact: true }).fill('10')
    await editor(page).getByRole('button', { name: 'Save' }).click()
    await expect(editor(page).getByRole('alert')).toHaveText('Keychain is already in the deal "Keychain 2 for 7"')
    expect(api.db.deals).toHaveLength(2)
  })

  test('an "N for X" deal needs exactly one category', async ({ page }) => {
    await page.getByRole('button', { name: 'Add deal' }).click()
    await editor(page).getByLabel('Name').fill('Paper goods')
    await editor(page).getByLabel('Coaster').check()
    await editor(page).getByLabel('Bookmark').check()
    await editor(page).getByLabel('Number of items (N)').fill('2')
    await editor(page).getByLabel('Price', { exact: true }).fill('12')
    await editor(page).getByRole('button', { name: 'Save' }).click()
    await expect(editor(page).getByRole('alert')).toHaveText('Choose exactly one category for an "N for X €" deal')
  })

  test('a group deal can span categories', async ({ page, api }) => {
    await page.getByRole('button', { name: 'Add deal' }).click()
    await editor(page).getByLabel('Name').fill('Paper goods')
    await editor(page).getByRole('radio', { name: 'Each X € from N' }).click()
    await editor(page).getByLabel('Coaster').check()
    await editor(page).getByLabel('Bookmark').check()
    await editor(page).getByLabel('Number of items (N)').fill('2')
    await editor(page).getByLabel('Price', { exact: true }).fill('4')
    await editor(page).getByRole('button', { name: 'Save' }).click()
    await expect(dealList(page)).toContainText('Paper goods')
    expect(api.db.deals.find(deal => deal.name === 'Paper goods'))
      .toMatchObject({ type: 'group', categories: ['cat-coaster', 'cat-bookmark'], min_qty: 2, price: 4 })
  })

  test('editing a deal price keeps its categories', async ({ page, api }) => {
    await page.getByRole('button', { name: 'Edit Big items' }).click()
    await editor(page).getByLabel('Price', { exact: true }).fill('24')
    await editor(page).getByRole('button', { name: 'Save' }).click()
    await expect(dealList(page)).toContainText('24,00')
    expect(api.db.deals.find(deal => deal.name === 'Big items')).toMatchObject({ price: 24, categories: ['cat-figure', 'cat-pokeball'] })
  })

  test('deleting a deal', async ({ page, api }) => {
    await page.getByRole('button', { name: 'Edit Keychain 2 for 7' }).click()
    await editor(page).getByRole('button', { name: 'Delete deal' }).click()
    await editor(page).getByRole('button', { name: 'Delete', exact: true }).click()
    await expect(dealList(page)).not.toContainText('Keychain 2 for 7')
    expect(api.db.deals.map(deal => deal.name)).toEqual(['Big items'])
  })

  test('validation names the missing piece', async ({ page }) => {
    await page.getByRole('button', { name: 'Add deal' }).click()
    await editor(page).getByRole('button', { name: 'Save' }).click()
    await expect(editor(page).getByRole('alert')).toHaveText('Enter a name')
    await editor(page).getByLabel('Name').fill('Nothing')
    await editor(page).getByRole('button', { name: 'Save' }).click()
    await expect(editor(page).getByRole('alert')).toHaveText('Choose a category')
    await editor(page).getByLabel('Coaster').check()
    await editor(page).getByLabel('Number of items (N)').fill('1')
    await editor(page).getByRole('button', { name: 'Save' }).click()
    await expect(editor(page).getByRole('alert')).toHaveText('N must be a whole number of 2 or more')
    await editor(page).getByLabel('Number of items (N)').fill('2')
    await editor(page).getByLabel('Price', { exact: true }).fill('0')
    await editor(page).getByRole('button', { name: 'Save' }).click()
    await expect(editor(page).getByRole('alert')).toHaveText('Price must be above 0')
  })
})
```

Append to `tests/e2e/categories.spec.js`, inside the existing `describe('categories', …)` block (its `beforeEach` seeds `SAMPLE_CATEGORIES` and opens `/settings#categories`):

```js
  test('a category used by a deal names the deal when deleting', async ({ page, api }) => {
    api.db.deals.push({ id: 'deal-coasters00', name: 'Coaster 2 for 15', type: 'bundle', categories: ['cat-coaster'], min_qty: 2, price: 15 })
    await page.getByRole('button', { name: 'Edit Coaster' }).click()
    await editor(page).getByRole('button', { name: 'Delete category' }).click()
    await editor(page).getByRole('button', { name: 'Delete', exact: true }).click()
    await expect(editor(page).getByRole('alert')).toHaveText('Remove Coaster from the deal "Coaster 2 for 15" first')
    expect(api.db.categories.map(category => category.name)).toContain('Coaster')
  })
```

In `tests/e2e/mobile.spec.js`, add `'/settings#deals'` to `PAGES`, after `'/settings#categories'`.

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx playwright test tests/e2e/deals.spec.js -g "managing deals" tests/e2e/categories.spec.js`
Expected: the 'managing deals' tests FAIL (there is no Deals section). The new categories test FAILS, because the fake has no relation guard for deals yet, so the category is deleted and no alert names the deal.

- [ ] **Step 3: Make the fake honour the deals relation**

In `tests/e2e/fake-pocketbase.js`, in the DELETE branch, extend the categories guard so it also refuses when a deal references the category:

```js
      if (name === 'categories' && (db.budget_tracket_catalog.some(article => article.category === id) || db.deals.some(deal => deal.categories.includes(id)))) {
```

- [ ] **Step 4: Check deals before deleting a category**

In `composables/useCategories.js`:
- add `import { useDeals } from './useDeals'`;
- in `deleteCategory`, after the active-articles check and before the delete call, add:

```js
    const deal = (await listDeals()).find(item => item.categories.includes(id))
    if (deal) throw Object.assign(new Error('Category in a deal'), { deal })
```

Destructure `const { listDeals } = useDeals()` next to `const pb = usePocketBase()`.

In `components/CategoryManager.vue` `remove()`, add a branch before `else if (err.status === 400)`:

```js
    } else if (err.deal) {
      error.value = `Remove ${editing.value.name} from the deal "${err.deal.name}" first`
```

- [ ] **Step 5: Create `components/DealManager.vue`**

```vue
<template>
  <BaseCard title="Deals" subtitle="Cart prices for several items" icon="cash" flush>
    <template #actions>
      <BaseButton variant="ghost" icon="plus" aria-label="Add deal" @click="openEditor(null)">Add</BaseButton>
    </template>

    <p v-if="loadError" class="px-4 py-6 text-sm text-expense md:px-5">{{ loadError }}</p>
    <p v-else-if="!deals.length" class="px-4 py-6 text-sm text-ink-muted md:px-5">No deals yet</p>
    <ul v-else class="divide-y divide-line" aria-label="Deals">
      <li v-for="deal in deals" :key="deal.id">
        <button
          type="button"
          class="flex min-h-[56px] w-full items-center gap-3 px-4 py-2 text-left hover:bg-muted md:px-5"
          :aria-label="`Edit ${deal.name}`"
          @click="openEditor(deal)"
        >
          <span class="min-w-0 flex-1">
            <span class="block truncate text-sm font-medium text-ink">{{ deal.name }}</span>
            <span class="block truncate text-xs text-ink-muted">{{ categoryNames(deal) }}</span>
          </span>
          <span class="shrink-0 text-sm tabular-nums text-ink-muted">{{ describeDeal(deal) }}</span>
        </button>
      </li>
    </ul>

    <BottomSheet v-model:open="isEditorOpen" :title="editing ? 'Edit deal' : 'New deal'">
      <form class="space-y-4" novalidate @submit.prevent="save">
        <p v-if="error" role="alert" class="rounded-lg bg-expense/10 px-3 py-2 text-sm text-expense">{{ error }}</p>

        <div>
          <label for="deal-name" class="label">Name</label>
          <input id="deal-name" v-model="form.name" type="text" class="input" autocomplete="off">
        </div>

        <div>
          <p class="label">Type</p>
          <SegmentedControl v-model="form.type" label="Deal type" :options="TYPE_OPTIONS" />
        </div>

        <fieldset>
          <legend class="label">Categories</legend>
          <div class="divide-y divide-line rounded-lg border border-line">
            <label v-for="category in categories" :key="category.id" class="flex min-h-[44px] cursor-pointer items-center gap-3 px-3">
              <input v-model="form.categories" type="checkbox" :value="category.id" class="h-5 w-5 rounded border-line text-accent focus:ring-accent/30">
              <span class="min-w-0 flex-1 truncate text-sm text-ink">{{ category.name }}</span>
              <span class="shrink-0 text-xs tabular-nums text-ink-muted">{{ formatCurrency(category.base_price) }}</span>
            </label>
          </div>
        </fieldset>

        <div class="grid grid-cols-2 gap-3">
          <div>
            <label for="deal-qty" class="label">Number of items (N)</label>
            <input id="deal-qty" v-model="form.minQty" type="text" inputmode="numeric" class="input" placeholder="2">
          </div>
          <div>
            <label for="deal-price" class="label">Price</label>
            <input id="deal-price" v-model="form.price" type="text" inputmode="decimal" class="input" placeholder="0.00">
            <p class="hint">{{ form.type === 'bundle' ? 'For all N items together' : 'Per item' }}</p>
          </div>
        </div>

        <p v-if="example" class="rounded-lg bg-muted px-3 py-2 text-sm text-ink" data-testid="deal-example">{{ example }}</p>

        <BaseButton type="submit" size="lg" block :loading="saving">Save</BaseButton>
      </form>

      <div v-if="editing" class="mt-6 border-t border-line pt-5">
        <BaseButton v-if="!confirmingDelete" variant="ghost" block icon="trash" @click="confirmingDelete = true">Delete deal</BaseButton>
        <div v-else class="space-y-3">
          <p class="text-sm text-ink-muted">Delete “{{ editing.name }}”? Carts stop using it straight away.</p>
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
import { ref, computed, onMounted } from 'vue'
import { useDeals } from '~/composables/useDeals'
import { useCategories } from '~/composables/useCategories'
import { formatCurrency } from '~/utils/currency'
import { describeDeal, isValidDeal, priceCart } from '~/utils/deals'

const TYPE_OPTIONS = [
  { value: 'bundle', label: 'N for X €' },
  { value: 'group', label: 'Each X € from N' }
]

const { listDeals, createDeal, updateDeal, deleteDeal } = useDeals()
const { listCategories } = useCategories()

const deals = ref([])
const categories = ref([])
const loadError = ref('')
const isEditorOpen = ref(false)
const editing = ref(null)
const form = ref({ name: '', type: 'bundle', categories: [], minQty: '2', price: '' })
const error = ref('')
const saving = ref(false)
const deleting = ref(false)
const confirmingDelete = ref(false)

const load = async () => {
  try {
    const [dealList, categoryList] = await Promise.all([listDeals(), listCategories()])
    deals.value = dealList
    categories.value = categoryList
    loadError.value = ''
  } catch (err) {
    loadError.value = 'Could not load deals. Check your connection and try again.'
  }
}

onMounted(load)

const categoryName = id => categories.value.find(category => category.id === id)?.name ?? 'Unknown'
const categoryNames = deal => deal.categories.map(categoryName).join(', ')

const openEditor = (deal) => {
  editing.value = deal
  form.value = deal
    ? { name: deal.name, type: deal.type, categories: [...deal.categories], minQty: String(deal.min_qty), price: String(deal.price) }
    : { name: '', type: 'bundle', categories: [], minQty: '2', price: '' }
  error.value = ''
  confirmingDelete.value = false
  isEditorOpen.value = true
}

const parseNumber = value => Number(String(value).trim().replace(',', '.'))

const draft = computed(() => ({
  id: editing.value?.id ?? 'draft',
  name: form.value.name.trim(),
  type: form.value.type,
  categories: form.value.categories,
  min_qty: parseNumber(form.value.minQty),
  price: parseNumber(form.value.price)
}))

// One worked example so the owner can sanity-check the deal before saving
const example = computed(() => {
  if (!isValidDeal(draft.value)) return ''
  const first = categories.value.find(category => category.id === draft.value.categories[0])
  if (!first) return ''
  const quantity = draft.value.type === 'bundle' ? draft.value.min_qty + 1 : draft.value.min_qty
  const { total } = priceCart([{ articleId: 'example', name: first.name, quantity, categoryId: first.id, basePrice: first.base_price, override: 0 }], [draft.value])
  return `${quantity} items → ${formatCurrency(total)}`
})

const validate = () => {
  const deal = draft.value
  if (!deal.name) return 'Enter a name'
  if (!deal.categories.length) return 'Choose a category'
  if (deal.type === 'bundle' && deal.categories.length !== 1) return 'Choose exactly one category for an "N for X €" deal'
  if (!Number.isInteger(deal.min_qty) || deal.min_qty < 2) return 'N must be a whole number of 2 or more'
  if (!(deal.price > 0)) return 'Price must be above 0'
  // One deal per category; the deal being edited may keep its own categories
  for (const id of deal.categories) {
    const other = deals.value.find(item => item.id !== editing.value?.id && item.categories.includes(id))
    if (other) return `${categoryName(id)} is already in the deal "${other.name}"`
  }
  return ''
}

const save = async () => {
  error.value = validate()
  if (error.value) return
  saving.value = true
  const { name, type, categories: chosen, min_qty: minQty, price } = draft.value
  const fields = { name, type, categories: chosen, min_qty: minQty, price }
  try {
    if (editing.value) await updateDeal(editing.value.id, fields)
    else await createDeal(fields)
    await load()
    isEditorOpen.value = false
  } catch (err) {
    error.value = 'Could not save the deal. Check your connection and try again.'
  } finally {
    saving.value = false
  }
}

const remove = async () => {
  deleting.value = true
  try {
    await deleteDeal(editing.value.id)
    await load()
    isEditorOpen.value = false
  } catch (err) {
    error.value = 'Could not delete the deal. Check your connection and try again.'
    confirmingDelete.value = false
  } finally {
    deleting.value = false
  }
}
</script>
```

- [ ] **Step 6: Add the Settings section**

In `pages/settings.vue`:
1. In `SETTINGS_CATEGORIES`, after the `categories` entry, add:

```js
  { id: 'deals', name: 'Deals', description: 'Cart prices for several items', icon: 'cash' },
```

2. Directly after `<CategoryManager v-if="activeCategory === 'categories'" />`, add:

```vue
        <DealManager v-if="activeCategory === 'deals'" />
```

- [ ] **Step 7: Run the tests to verify they pass**

Run: `npx playwright test tests/e2e/deals.spec.js tests/e2e/categories.spec.js tests/e2e/settings.spec.js tests/e2e/mobile.spec.js`
Expected: all pass on both projects. The 375px sweep now covers `/settings#deals`.

Run: `npm run test:unit && npx playwright test`
Expected: `fail 0` and `0 failed`.

- [ ] **Step 8: Commit**

```bash
git add components/DealManager.vue pages/settings.vue components/CategoryManager.vue composables/useCategories.js tests/e2e/fake-pocketbase.js tests/e2e/deals.spec.js tests/e2e/categories.spec.js tests/e2e/mobile.spec.js
git commit -m "Manage deals in Settings and name the deal that blocks a category delete"
```
