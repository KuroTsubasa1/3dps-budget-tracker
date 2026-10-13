# Multi-article Commissions and Navigation Tabs Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** The owner taps articles into the cart and turns them into one commission with several lines (one agreed price, one print-board card, one income on Delivered), and Commissions and the Print board get their own navigation tabs, with a More sheet on phones.

**Architecture:**
- Pure line rules live in `utils/commissions.js` (Task 1 adds them; Task 3 switches `incomeFor` and `validateCommission` to lines together with the form): `itemsOf` (reads `items`, or a legacy `article` × `quantity` as one line), `summaryOf`, `incomeFor`, `validateCommission`, `addLine`, `setLineQuantity`, `removeLine` and `suggestedPriceFor` (the existing `priceCart` over every line). `buildBoard` in `utils/printBoard.js` gives each commission card its `lines`. All of it is unit-tested with `node:test`.
- The migration adds a `json` field `items` to `commissions`, makes `article` and `quantity` optional, and converts legacy commissions to one-line `items` with the pure `planCommissionItems`, run by `--apply` after the schema ops.
- `CommissionSheet` edits a line list (stepper, remove, `Add article`), prices it with `suggestedPriceFor`, and saves only `items`. The catalog cart's new `Commission` button hands its lines to `/commissions` through `useState('commissionDraft')` (wrapped in `composables/useCommissionDraft.js`), which the page consumes once.
- `NAV_ITEMS` gains Commissions and Print board and a `phone: 'tab' | 'more'` flag. `AppBottomNav` renders four tabs plus `More`, a `BottomSheet` of `ListRow` links. The Catalog header's Commissions / Print board buttons and the per-card Commission buttons go away.

**Tech Stack:** Nuxt 3.21 / Vue 3.5 `<script setup>`, Tailwind tokens, PocketBase 0.22 with `pocketbase@0.21.5`, `node:test`, Playwright against the in-memory fake PocketBase.

**Spec:** `docs/superpowers/specs/2026-10-14-multi-article-commissions-design.md`

## Global Constraints

- **Data model (`commissions`):**
  - `items`: new `json` field, `{ type: 'json', options: { maxSize: 2000000 } }`, not required in the database, required in the app. Shape `[{ article: <id>, name: <string>, quantity: <int ≥ 1> }]`.
  - `article` stays a relation and `quantity` stays a number; both become **not required**. New commissions leave them empty (not sent on create); edits never send them.
  - `name` is copied from the article when the line is added. The app shows the current article name when the article is in the active list, and the copied name otherwise.
  - Rules are unchanged (owner only). Commissions never touch stock.
- **Legacy read:** a commission without a non-empty `items` array but with `article` is one line `{ article, name, quantity }`. The name comes from `expand.article.name`, else the `articles` lookup, else `Unknown article`. Neither gives `[]`. PocketBase returns an empty json field as `null`.
- **Pricing:** `priceCart(lines, deals)` from `utils/deals.js`, one cart line per item from the article's category base price and override. Lines whose article is not in the active list are left out of the suggestion. The suggestion follows the lines until the owner edits the price.
- **Migration:**
  - `planSchema` adds `json('items')` to an existing `commissions` (in the same `addFields:commissions` op as a missing `ready_at`), then one `updateField` op per field for `article` and `quantity` while they are still required.
  - A fresh install creates `commissions` with `items` and with `article` / `quantity` optional.
  - `planCommissionItems(commissions, articles)` is pure. `--apply` runs its patches after the schema ops. Already converted commissions are skipped.
  - Schema writes keep `MIGRATION_GAP_MS = 1500` (every `applyOp` waits it). Record patches are not spaced.
- **Draft:** `useState('commissionDraft')` holds `[{ article, name, quantity }]`. `/commissions` reads it once after its data loads and clears it. `+ New commission` always starts with no lines.
- **Navigation:** `NAV_ITEMS` order Dashboard · Catalog · Commissions · Print board · Reports · Business Card · Settings. Phone tabs: Dashboard, Catalog, Commissions, Print board, plus `More` (icon `dots`). More holds Reports, Business Card, Settings, and is highlighted (`text-accent`, `aria-current="page"`) on `/reports`, `/business-card` and `/settings`. The side nav lists all seven.
- **Strings (verbatim from the spec):**
  - cart button `Commission` (icon `clipboard`), under the cart's checkout button (`Add to Balance`), disabled when the cart is empty
  - form: stepper group label `Quantity of <name>`, remove button `Remove <name>`, select `Add article`
  - validation, in this order: `Enter the customer's name`, `Enter a valid email address`, `Add at least one article`, `Enter an address for shipping`, `Quantity must be a whole number of 1 or more`, `Agreed price must be above 0`
  - income `Commission: <name> × <qty>, <name> × <qty> (<customer>)`, where ` × <qty>` is always written
  - list summary `Pikachu Keychain × 2, Totoro` (` × <qty>` only above 1); more than two lines → first two plus ` +<n> more`
  - detail view and print-board card lines `<name> × <qty>`
  - `Unknown article`
  - nav: `{ to: '/commissions', label: 'Commissions', shortLabel: 'Commissions', icon: 'clipboard' }`, `{ to: '/print-board', label: 'Print board', shortLabel: 'Print', icon: 'printer' }`; sheet title `More`
- **Removed:** the per-card `Commission <name>` buttons, the catalog's `CommissionSheet`, the Catalog header `Commissions` and `Print board` buttons. The Dashboard links (`N open commissions`, `N to print`) stay.
- **Rollout (owner, not this plan):** `npm run pb:migrate -- --apply` must run before this app is deployed. Before it, creating a commission fails (`article` is still required).
- **Conventions:**
  - semantic colour tokens (`surface`, `card`, `muted`, `line`, `ink`, `ink-muted`, `accent`, `income`, `expense`), no raw gray/blue classes, no `darkMode` ternaries;
  - 44px tap targets; every page and sheet works at 375px with no horizontal scroll;
  - `gotoReady` in e2e;
  - 2-space indent, single quotes, no semicolons; imports ordered Vue, composables, utilities.
- **Never:**
  - stop the `nuxt dev` server on :3000 (if new Tailwind classes do not apply, `touch tailwind.config.js`);
  - contact pocket.lasseharm.space;
  - run `pb:migrate` in any form, with or without flags;
  - read `.env`.
- **Git:** only `git add <files you changed>` and `git commit`. NEVER `git stash`, `reset`, `checkout`, `restore`, `clean`, `rebase` or `merge`.

## Review Focus

1. **A legacy record whose `items` comes back as `null`** (PocketBase's empty json field) or `[]` must read as its one `article` × `quantity` line everywhere (list, detail, form, income, print board), not as an empty commission. *Pinned in Task 1: "itemsOf reads a legacy commission as one line".*
2. **Editing a legacy commission** must save it as one `items` line, keep its agreed price, and never send `article` or `quantity` (they stay as they were). *Pinned in Task 3: "editing a legacy commission keeps the price and its article, and saves it as a line".*
3. **A line whose article was archived** keeps its copied name, is not offered again in `Add article`, and is left out of the price suggestion instead of pricing at 0 or breaking it. *Pinned in Task 1: "the suggested price runs every line through the deals", and Task 3: "a commission for an archived article can still be edited".*
4. **The cart draft is used once:** leaving `/commissions` and coming back does not reopen the form, and `+ New commission` afterwards starts with no lines. *Pinned in Task 4: "the cart lines open the form only once".*
5. **Long article names in the form at 375px** wrap inside the line; the sheet has no horizontal scroll and every stepper, remove button and select stays ≥ 44px. *Pinned in Task 3: "the commission form fits at 375px with long lines".*

## Working setup

- A `nuxt dev` server serves this checkout on :3000, and Playwright reuses it. The first run after edits may hit cold-compile timeouts; re-run once before investigating.
- Unit tests: `npm run test:unit` (89 tests pass before Task 1). e2e: `npx playwright test <files>` (projects `chromium` at 1280px and `mobile` on a Pixel 7, 412px wide).
- e2e uses the fake PocketBase (`tests/e2e/fake-pocketbase.js`) through the `api` fixture (`tests/e2e/fixtures.js`). Seeded records are pushed as given (no `DEFAULTS`), so a seeded commission without `items` is a legacy record. Records the app creates get `DEFAULTS`.
- Both navs carry `aria-label="Primary"`; the hidden one is skipped by role queries, so `page.getByRole('navigation', { name: 'Primary' })` is the bottom bar on phones and the side rail at 1280px.

## File map

| File | Responsibility | Task |
|---|---|---|
| `utils/commissions.js`, `tests/unit/commissions.test.js` | lines, summary, line helpers, price suggestion (1); income and validation over lines (3) | 1, 3 |
| `utils/printBoard.js`, `tests/unit/printBoard.test.js` | `lines` on commission cards | 1 |
| `scripts/lib/pb-plan.mjs`, `scripts/pb-migrate.mjs`, `tests/unit/pb-plan.test.js` | `items`, optional `article` / `quantity`, data conversion | 2 |
| `tests/e2e/fake-pocketbase.js` | `items: []` default | 3 |
| `components/QuantityStepper.vue` | optional group label | 3 |
| `components/CommissionSheet.vue` | line list form, detail lines, multi-line income | 3 |
| `pages/commissions.vue` | `summaryOf` rows (3), draft consumption (4) | 3, 4 |
| `pages/print-board.vue` | card lines | 3 |
| `pages/catalog.vue` | `presetItems` (3), cart Commission and removals (4), header buttons removed (5) | 3, 4, 5 |
| `tests/e2e/commissions.spec.js` | multi-line form and delivery (3), cart entry (4), Commissions tab (5) | 3, 4, 5 |
| `tests/e2e/print-board.spec.js` | multi-line card (3), Print board tab (5) | 3, 5 |
| `tests/e2e/mobile.spec.js` | form at 375px (3), More sheet at 375px (5) | 3, 5 |
| `composables/useCommissionDraft.js`, `components/CartPanel.vue` | one-time draft, cart button | 4 |
| `utils/navigation.js`, `tests/unit/navigation.test.js`, `utils/icons.js` | items, phone split, `dots` | 5 |
| `components/ListRow.vue`, `components/AppBottomNav.vue` | link rows, tabs and More sheet | 5 |
| `tests/e2e/shell.spec.js` | navigation tests | 5 |

`composables/useCommissions.js` needs no change: it keeps `expand: 'article'`, which the legacy read uses, and it already passes whatever fields the sheet sends. `components/AppSideNav.vue` needs no change: it renders every `NAV_ITEMS` entry.

---

### Task 1: Commission lines in the pure rules

**Files:**
- Modify: `utils/commissions.js` (new exports only; `incomeFor` and `validateCommission` change in Task 3, together with the form that calls them)
- Modify: `tests/unit/commissions.test.js`
- Modify: `utils/printBoard.js` (commission cards)
- Modify: `tests/unit/printBoard.test.js`

**Interfaces:**
- Consumes: `priceCart(lines, deals)` from `utils/deals.js` (lines `{ articleId, name, quantity, categoryId, basePrice, override }`, returns `{ total, … }`).
- Produces (all in `utils/commissions.js`):
  - `UNKNOWN_ARTICLE` = `'Unknown article'`
  - `itemsOf(commission, articles = [])` → `[{ article, name, quantity }]`. Saved lines get the active article's current name when it is in `articles`, else their copied name.
  - `summaryOf(commission, articles = [])` → string (`''` for no lines)
  - `addLine(items, article)` → new array (`article` is an article record `{ id, name }`; a duplicate adds 1 to that line)
  - `setLineQuantity(items, index, quantity)` → new array, quantity clamped to ≥ 1
  - `removeLine(items, index)` → new array
  - `suggestedPriceFor(items, articles, deals = [])` → number (euros)
  - a private `lineText(line)` → `'<name> × <quantity>'`, which Task 3's `incomeFor` reuses
- Produces (in `utils/printBoard.js`): commission cards are `{ kind: 'commission', commission, lines }`, with `lines = itemsOf(commission, articles)`. `pages/print-board.vue` ignores `lines` until Task 3, so the app is unchanged after this task.

- [ ] **Step 1: Write the failing tests**

In `tests/unit/commissions.test.js`:

1. Replace the import block (lines 3-14) with:

```js
import {
  NEXT,
  PREVIOUS,
  NEXT_ACTION,
  isFinal,
  canCancel,
  transitionPatch,
  dueForAnonymising,
  anonymisedPatch,
  UNKNOWN_ARTICLE,
  itemsOf,
  summaryOf,
  incomeFor,
  validateCommission,
  addLine,
  setLineQuantity,
  removeLine,
  suggestedPriceFor
} from '../../utils/commissions.js'
```

2. Directly after `const NOW = new Date('2026-10-13T12:00:00.000Z')`, add:

```js
const ARTICLES = [
  { id: 'k1', name: 'Pikachu Keychain', category: 'cat-keychain', price: 0, expand: { category: { base_price: 4 } } },
  { id: 't1', name: 'Totoro', category: 'cat-mini', price: 0, expand: { category: { base_price: 8 } } }
]
const DEALS = [{ id: 'd1', name: 'Keychain 2 for 7', type: 'bundle', categories: ['cat-keychain'], min_qty: 2, price: 7 }]
const TWO_LINES = [{ article: 'k1', name: 'Pikachu Keychain', quantity: 2 }, { article: 't1', name: 'Totoro', quantity: 1 }]
```

3. Append:

```js
test('itemsOf uses the saved lines, with the current name of an active article', () => {
  const items = [{ article: 'k1', name: 'Old Pikachu', quantity: 2 }, { article: 'gone', name: 'Retired Dino', quantity: 1 }]
  assert.deepEqual(itemsOf({ items, article: 'f1', quantity: 9 }, ARTICLES), [
    { article: 'k1', name: 'Pikachu Keychain', quantity: 2 },
    { article: 'gone', name: 'Retired Dino', quantity: 1 }
  ])
  assert.deepEqual(itemsOf({ items }), items)
})

test('itemsOf reads a legacy commission as one line', () => {
  const legacy = { article: 'k1', quantity: 3 }
  assert.equal(UNKNOWN_ARTICLE, 'Unknown article')
  assert.deepEqual(itemsOf({ ...legacy, expand: { article: { name: 'From expand' } } }, ARTICLES), [{ article: 'k1', name: 'From expand', quantity: 3 }])
  assert.deepEqual(itemsOf(legacy, ARTICLES), [{ article: 'k1', name: 'Pikachu Keychain', quantity: 3 }])
  assert.deepEqual(itemsOf({ ...legacy, article: 'gone' }, ARTICLES), [{ article: 'gone', name: 'Unknown article', quantity: 3 }])
  // PocketBase returns an empty json field as null; an empty list counts as no items too
  assert.deepEqual(itemsOf({ ...legacy, items: null }, ARTICLES), [{ article: 'k1', name: 'Pikachu Keychain', quantity: 3 }])
  assert.deepEqual(itemsOf({ ...legacy, items: [] }, ARTICLES), [{ article: 'k1', name: 'Pikachu Keychain', quantity: 3 }])
})

test('itemsOf returns no lines without items or an article', () => {
  assert.deepEqual(itemsOf({ items: [], article: '' }), [])
  assert.deepEqual(itemsOf({ items: null }), [])
  assert.deepEqual(itemsOf({}), [])
})

test('summaryOf writes × only above 1 and folds more than two lines', () => {
  const line = (name, quantity) => ({ article: name, name, quantity })
  assert.equal(summaryOf({ items: TWO_LINES }), 'Pikachu Keychain × 2, Totoro')
  assert.equal(summaryOf({ items: [line('Totoro', 1)] }), 'Totoro')
  assert.equal(summaryOf({ items: [line('A', 1), line('B', 3), line('C', 1)] }), 'A, B × 3 +1 more')
  assert.equal(summaryOf({ items: [line('A', 1), line('B', 3), line('C', 1), line('D', 2)] }), 'A, B × 3 +2 more')
  assert.equal(summaryOf({ article: 'f1', quantity: 1, expand: { article: { name: 'Glurak Figure' } } }), 'Glurak Figure')
  assert.equal(summaryOf({}), '')
})

test('addLine adds a new article at 1 and merges a duplicate', () => {
  const once = addLine([], ARTICLES[0])
  assert.deepEqual(once, [{ article: 'k1', name: 'Pikachu Keychain', quantity: 1 }])
  const twice = addLine(once, ARTICLES[0])
  assert.deepEqual(twice, [{ article: 'k1', name: 'Pikachu Keychain', quantity: 2 }])
  assert.deepEqual(addLine(twice, ARTICLES[1]), TWO_LINES)
  assert.deepEqual(once, [{ article: 'k1', name: 'Pikachu Keychain', quantity: 1 }], 'the input is not changed')
})

test('setLineQuantity stays at 1 or more and removeLine drops one line', () => {
  assert.deepEqual(setLineQuantity(TWO_LINES, 0, 3).map(line => line.quantity), [3, 1])
  assert.deepEqual(setLineQuantity(TWO_LINES, 1, 0).map(line => line.quantity), [2, 1])
  assert.deepEqual(setLineQuantity(TWO_LINES, 5, 4), TWO_LINES)
  assert.deepEqual(removeLine(TWO_LINES, 0), [TWO_LINES[1]])
  assert.deepEqual(removeLine(removeLine(TWO_LINES, 0), 0), [])
  assert.equal(TWO_LINES.length, 2, 'the input is not changed')
})

test('the suggested price runs every line through the deals', () => {
  assert.equal(suggestedPriceFor(TWO_LINES, ARTICLES, DEALS), 15)
  assert.equal(suggestedPriceFor(TWO_LINES, ARTICLES, []), 16)
  // A line whose article is no longer active has no price to suggest
  assert.equal(suggestedPriceFor([...TWO_LINES, { article: 'gone', name: 'Retired Dino', quantity: 1 }], ARTICLES, DEALS), 15)
  assert.equal(suggestedPriceFor([], ARTICLES, DEALS), 0)
})
```

In `tests/unit/printBoard.test.js`:

1. In 'To print holds active low-stock articles with a threshold, then open commissions', replace

```js
  assert.deepEqual(board.toPrint[2], { kind: 'commission', commission: commission() })
```

with

```js
  assert.deepEqual(board.toPrint[2], { kind: 'commission', commission: commission(), lines: [] })
```

2. In 'an article with a printing job leaves To print and shows under Printing', replace

```js
    { kind: 'commission', commission: commission({ status: 'printing' }) }
```

with

```js
    { kind: 'commission', commission: commission({ status: 'printing' }), lines: [] }
```

3. Append:

```js
test('commission cards carry their lines, a legacy record as one line', () => {
  const items = [{ article: 'a1', name: 'Old name', quantity: 2 }, { article: 't1', name: 'Totoro', quantity: 1 }]
  const board = buildBoard({
    articles: [article({ stock: 50 })],
    commissions: [
      commission({ items }),
      commission({ id: 'legacy', article: 'f1', quantity: 3, expand: { article: { name: 'Glurak Figure' } }, created: '2026-10-02 10:00:00.000Z' })
    ],
    now: NOW
  })
  assert.deepEqual(board.toPrint.map(card => card.lines), [
    [{ article: 'a1', name: 'Pikachu Keychain', quantity: 2 }, { article: 't1', name: 'Totoro', quantity: 1 }],
    [{ article: 'f1', name: 'Glurak Figure', quantity: 3 }]
  ])
})
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npm run test:unit`
Expected: FAIL. `commissions.test.js` fails to load with `SyntaxError: The requested module '../../utils/commissions.js' does not provide an export named 'UNKNOWN_ARTICLE'`. In `printBoard.test.js` the two edited tests and 'commission cards carry their lines, a legacy record as one line' fail (no `lines`). `deals`, `inventory`, `pb-plan` and `pricing` pass.

- [ ] **Step 3: Implement the line rules**

In `utils/commissions.js`:

1. Add as the first import, directly after the comment on line 1:

```js
import { priceCart } from './deals.js'
```

2. Directly before `export const incomeFor = (commission, articleName) => ({`, add:

```js
export const UNKNOWN_ARTICLE = 'Unknown article'

const nameIn = (articles, id) => articles.find(article => article.id === id)?.name

// A commission's lines. New records keep them in `items`; records from before multi-article commissions
// (or before the data conversion) have one `article` × `quantity`, read here as a single line.
// A saved line shows its article's current name while the article is active, else the name copied when it was added.
export function itemsOf (commission, articles = []) {
  if (Array.isArray(commission?.items) && commission.items.length) {
    return commission.items.map(line => ({ ...line, name: nameIn(articles, line.article) ?? line.name ?? UNKNOWN_ARTICLE }))
  }
  if (!commission?.article) return []
  const name = commission.expand?.article?.name ?? nameIn(articles, commission.article) ?? UNKNOWN_ARTICLE
  return [{ article: commission.article, name, quantity: Number(commission.quantity) }]
}

const lineText = line => `${line.name} × ${line.quantity}`

// List rows: "× n" only above 1; more than two lines show the first two and "+n more"
export function summaryOf (commission, articles = []) {
  const lines = itemsOf(commission, articles)
  const shown = lines.slice(0, 2).map(line => (Number(line.quantity) > 1 ? lineText(line) : line.name)).join(', ')
  return lines.length > 2 ? `${shown} +${lines.length - 2} more` : shown
}

// Form helpers: each returns a new array, so the form's list is replaced, never changed in place
export function addLine (items, article) {
  if (items.some(line => line.article === article.id)) {
    return items.map(line => (line.article === article.id ? { ...line, quantity: Number(line.quantity) + 1 } : line))
  }
  return [...items, { article: article.id, name: article.name, quantity: 1 }]
}

export const setLineQuantity = (items, index, quantity) =>
  items.map((line, i) => (i === index ? { ...line, quantity: Math.max(1, quantity) } : line))

export const removeLine = (items, index) => items.filter((line, i) => i !== index)

// Deal-aware price for the lines, as the cart would charge it. A line whose article is not in
// `articles` (archived since) has no current price and is left out.
export function suggestedPriceFor (items, articles, deals = []) {
  const cartLines = items.flatMap((line) => {
    const article = articles.find(item => item.id === line.article)
    if (!article) return []
    return [{
      articleId: article.id,
      name: article.name,
      quantity: Number(line.quantity),
      categoryId: article.category,
      basePrice: article.expand?.category?.base_price ?? 0,
      override: Number(article.price) > 0 ? Number(article.price) : 0
    }]
  })
  return priceCart(cartLines, deals).total
}
```

In `utils/printBoard.js`:

1. Directly after the comment on line 1, add:

```js
import { itemsOf } from './commissions.js'
```

2. Replace

```js
  const commissionCard = commission => ({ kind: 'commission', commission })
```

with

```js
  // A commission card lists every line; a legacy single-article record reads as one line
  const commissionCard = commission => ({ kind: 'commission', commission, lines: itemsOf(commission, articles) })
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npm run test:unit`
Expected: `tests 97`, `pass 97`, `fail 0` (7 new commission tests, 1 new board test).

Run: `npx playwright test`
Expected: `0 failed`. Nothing in the app reads the new exports or `lines` yet.

- [ ] **Step 5: Commit**

```bash
git add utils/commissions.js tests/unit/commissions.test.js utils/printBoard.js tests/unit/printBoard.test.js
git commit -m "Read commission lines from items, with a legacy fallback, in the pure rules"
```

---

### Task 2: `items` and the data conversion in the migration

**Files:**
- Modify: `scripts/lib/pb-plan.mjs`, `scripts/pb-migrate.mjs`, `tests/unit/pb-plan.test.js`

**Interfaces:**
- Consumes: nothing from Task 1 (the script stays independent of `utils/`).
- Produces:
  - `planSchema`: a fresh `commissions` body has `json('items')` after `address`, and `article` / `quantity` not required (`quantity` keeps `min: 1, noDecimal: true`). For an existing `commissions`: one `addFields:commissions` op with the missing `ready_at` and/or `items`, then `updateField:commissions.article` and `updateField:commissions.quantity` (`patch: { required: false }`) for each still-required field.
  - `planCommissionItems(commissions, articles)` → `[{ id, patch: { items: [{ article, name, quantity }] } }]` for every commission without a non-empty `items` array that has an `article`.
  - `--apply` patches each planned commission after the schema ops; the dry run prints how many would be converted.

- [ ] **Step 1: Write the failing tests**

In `tests/unit/pb-plan.test.js`:

1. Add `planCommissionItems` to the import list, after `planDealSeed`:

```js
  planDealSeed,
  planCommissionItems
} from '../../scripts/lib/pb-plan.mjs'
```

2. Append:

```js
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
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npm run test:unit`
Expected: FAIL. `pb-plan.test.js` fails to load with `SyntaxError: The requested module '../../scripts/lib/pb-plan.mjs' does not provide an export named 'planCommissionItems'`. Every other suite passes.

- [ ] **Step 3: Implement the plan**

In `scripts/lib/pb-plan.mjs`:

1. After the `date` helper, add:

```js
const json = name =>
  ({ name, type: 'json', required: false, presentable: false, options: { maxSize: 2000000 } })
```

2. In the `commissions` create body, replace

```js
          text('address'),
          relation('article', articles.id, true),
          number('quantity', { required: true, min: 1, noDecimal: true }),
```

with

```js
          text('address'),
          // Lines of a multi-article commission; article/quantity remain for records from before them
          json('items'),
          relation('article', articles.id),
          number('quantity', { min: 1, noDecimal: true }),
```

3. Replace

```js
  } else if (!findField(commissions, 'ready_at')) {
    // Servers migrated before the print board need the date behind "Done today"
    ops.push({ op: 'addFields', collection: 'commissions', fields: [date('ready_at')] })
  }
```

with

```js
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
```

4. After `planRequireCategory`, add:

```js
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
```

In `scripts/pb-migrate.mjs`:

1. Replace lines 1-3 with:

```js
// PocketBase 0.22 migration for categories, deals, stock, commissions (with items), print jobs and owner-only rules.
//   npm run pb:migrate                 dry run: prints the plan, writes scripts/category-mapping.json
//   npm run pb:migrate -- --apply      schema + seed (categories, deals) + category mapping + commission items (old rules stay)
```

2. Add `planCommissionItems,` to the import list after `planRules,`.

3. Replace the `listRecords` line with (the admin list is paged at 500, and a conversion must see every commission):

```js
const listRecords = async (collection) => {
  const items = []
  for (let page = 1; ; page++) {
    const result = await api('GET', `/collections/${collection}/records?perPage=500&page=${page}`)
    items.push(...result.items)
    if (page >= result.totalPages) return items
  }
}
```

4. In `migrateSchema`, directly after the `for (const entry of Object.values(mapping)) …` line, add:

```js
  const legacyCommissions = planCommissionItems(byName(collections, 'commissions') ? await listRecords('commissions') : [], articles)
  console.log(legacyCommissions.length
    ? `Commissions to convert to items: ${legacyCommissions.length}`
    : 'Commissions: all converted to items')
```

5. Replace

```js
  for (const op of ops) await applyOp(op)
```

with

```js
  for (const op of ops) await applyOp(op)
  // After the schema ops, items exists. Planned again from fresh records, so a re-run skips converted ones.
  const converting = planCommissionItems(await listRecords('commissions'), articles)
  for (const { id, patch } of converting) await api('PATCH', `/collections/commissions/records/${id}`, patch)
  if (converting.length) console.log(`Converted ${converting.length} commissions to items`)
```

Do NOT run `npm run pb:migrate` in any form.

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npm run test:unit`
Expected: `tests 102`, `pass 102`, `fail 0`. The existing 'a server migrated for commissions gains ready_at, print_jobs and target_stock exactly once' still passes: its fixture comes from a fresh plan, which now already has `items` and the optional fields.

Run: `node --check scripts/pb-migrate.mjs`
Expected: no output, exit code 0.

Run (reads only the local snapshot of production; no network):

```bash
node --input-type=module -e "import { readFileSync } from 'node:fs'; import { planSchema, describeOp } from './scripts/lib/pb-plan.mjs'; planSchema(JSON.parse(readFileSync('pocketbase/schema.json', 'utf8'))).forEach(op => console.log(describeOp(op)))"
```

Expected exactly:

```
add to "commissions": items
change "commissions.article": {"required":false}
change "commissions.quantity": {"required":false}
```

Run: `npx playwright test`
Expected: `0 failed` (the app is untouched).

- [ ] **Step 5: Commit**

```bash
git add scripts/lib/pb-plan.mjs scripts/pb-migrate.mjs tests/unit/pb-plan.test.js
git commit -m "Add commission items to the migration and convert legacy commissions"
```

---

### Task 3: Several articles in one commission

**Files:**
- Modify: `utils/commissions.js` (`incomeFor`, `validateCommission`), `tests/unit/commissions.test.js`
- Modify: `tests/e2e/fake-pocketbase.js` (`DEFAULTS.commissions`)
- Modify: `components/QuantityStepper.vue`
- Replace: `components/CommissionSheet.vue`
- Modify: `pages/commissions.vue` (row subtitle)
- Modify: `pages/print-board.vue` (commission card lines)
- Modify: `pages/catalog.vue` (`presetArticleId` → `presetItems`)
- Modify: `tests/e2e/commissions.spec.js`, `tests/e2e/print-board.spec.js`, `tests/e2e/mobile.spec.js`

**Interfaces:**
- Consumes from Task 1: `itemsOf`, `summaryOf`, `addLine`, `setLineQuantity`, `removeLine`, `suggestedPriceFor`, the private `lineText`; commission cards' `lines`.
- Produces:
  - `incomeFor(commission, articles = [])` → `{ description, amount }` (the second parameter is now the articles list, not a name).
  - `validateCommission(form)` → message or `''`, with `form` = `{ customerName, email, fulfilment, address, items, price, anonymised? }`; `items` replaces `article` / `quantity`.
  - `QuantityStepper` prop `label` (default `''`). When set, the stepper is `role="group"` with that `aria-label`.
  - `CommissionSheet` prop `presetItems` (Array of `{ article, name, quantity }`, default `[]`) replaces `presetArticleId`. Saving sends `items` (with names), never `article` / `quantity`.
  - Form DOM: the lines are a `<ul aria-label="Articles">`; each line has a stepper group `Quantity of <name>` and a button `Remove <name>`; the select is labelled `Add article` (placeholder `Choose an article`) and resets after each pick.
  - The fake creates commissions with `items: []`.

Existing tests changed in this task (they use the single `Article` select or `Quantity` field, `presetArticleId` through the catalog, or the old `incomeFor` / `validateCommission` shape):
- `tests/unit/commissions.test.js`: 'delivery income names the article, quantity and customer' (replaced), 'a complete commission is valid' (through the new `VALID`), 'validation names the first problem in a fixed order', 'an anonymised commission skips the customer data checks but keeps the rest', 'quantity and price accept plain numbers only'.
- `commissions.spec.js`: 'a new commission pre-fills the deal price and saves' (rewritten), 'the price stops following the suggestion once edited' (replaced by 'stepping and removing lines updates the price until it is edited'), 'saving while offline says so and keeps the form open', 'the address is only asked for, and required, when shipping', 'validation names the problem', 'editing keeps the agreed price' (rewritten), 'an email the server rejects shows the email message and keeps the form open', 'a commission for an archived article can still be edited', 'a catalog card starts a commission for that article', 'the Commission button does not add the article to the cart'.

- [ ] **Step 1: The fake creates commissions with items**

In `tests/e2e/fake-pocketbase.js`, replace the `commissions` entry of `DEFAULTS` with:

```js
  commissions: { notes: '', address: '', items: [], delivered_at: '', cancelled_at: '', anonymised_at: '', ready_at: '' },
```

- [ ] **Step 2: Write the failing unit tests for income and validation**

In `tests/unit/commissions.test.js`:

1. Directly after the `TWO_LINES` constant (added in Task 1), add:

```js
const QUANTITY = 'Quantity must be a whole number of 1 or more'
const PRICE = 'Agreed price must be above 0'
```

2. Replace the whole test 'delivery income names the article, quantity and customer' with:

```js
test('delivery income names every line with its quantity, and the customer', () => {
  assert.deepEqual(
    incomeFor({ items: TWO_LINES, customer_name: 'Ash Ketchum', agreed_price: 15 }),
    { description: 'Commission: Pikachu Keychain × 2, Totoro × 1 (Ash Ketchum)', amount: 15 }
  )
  assert.deepEqual(
    incomeFor({ article: 'f1', quantity: 1, expand: { article: { name: 'Glurak Figure' } }, customer_name: 'Ash Ketchum', agreed_price: 30 }),
    { description: 'Commission: Glurak Figure × 1 (Ash Ketchum)', amount: 30 }
  )
})
```

3. Replace the line `const VALID = { customerName: 'Misty', email: 'misty@example.com', article: 'k1', fulfilment: 'pickup', address: '', quantity: '2', price: '7,00' }` with:

```js
const LINE = { article: 'k1', name: 'Pikachu Keychain', quantity: 2 }
const VALID = { customerName: 'Misty', email: 'misty@example.com', items: [LINE], fulfilment: 'pickup', address: '', price: '7,00' }
const withQuantity = quantity => ({ ...VALID, items: [{ ...LINE, quantity }] })
```

4. Replace the body of 'validation names the first problem in a fixed order' with:

```js
  assert.equal(validateCommission({ ...VALID, customerName: '  ' }), "Enter the customer's name")
  assert.equal(validateCommission({ ...VALID, email: 'nope' }), 'Enter a valid email address')
  assert.equal(validateCommission({ ...VALID, items: [] }), 'Add at least one article')
  assert.equal(validateCommission({ ...VALID, fulfilment: 'shipping', address: ' ' }), 'Enter an address for shipping')
  assert.equal(validateCommission(withQuantity(0)), QUANTITY)
  assert.equal(validateCommission(withQuantity('1.5')), QUANTITY)
  assert.equal(validateCommission({ ...VALID, price: '0' }), PRICE)
  assert.equal(validateCommission({ ...VALID, price: '' }), PRICE)
  // The order holds: an empty list comes after the email and before the address, quantity and price
  assert.equal(validateCommission({ ...VALID, email: 'nope', items: [] }), 'Enter a valid email address')
  assert.equal(validateCommission({ ...VALID, items: [], fulfilment: 'shipping', address: '', price: '' }), 'Add at least one article')
```

5. Replace the body of 'an anonymised commission skips the customer data checks but keeps the rest' with:

```js
  const anonymised = { ...VALID, anonymised: true, customerName: '', email: '', fulfilment: 'shipping', address: '' }
  assert.equal(validateCommission(anonymised), '')
  assert.equal(validateCommission({ ...anonymised, items: [{ ...LINE, quantity: 0 }] }), QUANTITY)
  assert.equal(validateCommission({ ...anonymised, items: [] }), 'Add at least one article')
```

6. Replace the whole test 'quantity and price accept plain numbers only' with:

```js
test('quantity and price accept plain numbers only', () => {
  assert.equal(validateCommission(withQuantity('1e0')), QUANTITY)
  assert.equal(validateCommission(withQuantity('Infinity')), QUANTITY)
  assert.equal(validateCommission(withQuantity('0x10')), QUANTITY)
  assert.equal(validateCommission(withQuantity(' 3 ')), '')
  assert.equal(validateCommission({ ...VALID, price: '1e1' }), PRICE)
  assert.equal(validateCommission({ ...VALID, price: 'Infinity' }), PRICE)
  assert.equal(validateCommission({ ...VALID, price: '1,234' }), PRICE)
  assert.equal(validateCommission({ ...VALID, price: '-5' }), PRICE)
  assert.equal(validateCommission({ ...VALID, price: '7.5' }), '')
  assert.equal(validateCommission({ ...VALID, price: ' 12 ' }), '')
})
```

7. Append:

```js
test('a bad quantity on any line is refused', () => {
  assert.equal(validateCommission({ ...VALID, items: [LINE, { article: 't1', name: 'Totoro', quantity: 0 }] }), QUANTITY)
  assert.equal(validateCommission({ ...VALID, items: [LINE, { article: 't1', name: 'Totoro', quantity: 2.5 }] }), QUANTITY)
  assert.equal(validateCommission({ ...VALID, items: [LINE, { article: 't1', name: 'Totoro', quantity: 1 }] }), '')
})
```

- [ ] **Step 3: Write the failing e2e tests**

In `tests/e2e/commissions.spec.js`:

1. Replace `COMMISSION_CATEGORIES` and `COMMISSION_ARTICLES` with:

```js
export const COMMISSION_CATEGORIES = [
  { id: 'cat-keychain', name: 'Keychain', base_price: 4, sort_order: 0 },
  { id: 'cat-figure', name: 'Big Figure', base_price: 30, sort_order: 1 },
  { id: 'cat-mini', name: 'Mini Figure', base_price: 8, sort_order: 2 }
]
```

```js
export const COMMISSION_ARTICLES = [
  { id: 'k1', name: 'Pikachu Keychain', category: 'cat-keychain' },
  { id: 'f1', name: 'Glurak Figure', category: 'cat-figure' },
  { id: 't1', name: 'Totoro', category: 'cat-mini' }
]
```

2. Directly after `const sheet = page => page.getByRole('dialog')`, add:

```js
const addArticle = (page, name) => sheet(page).getByLabel('Add article').selectOption({ label: name })
// A form line is found by its quantity stepper, a group labelled "Quantity of <name>"
const line = (page, name) => sheet(page).getByRole('group', { name: `Quantity of ${name}` })
```

3. Directly after the `commission` factory, add:

```js
const TWO_LINES = [{ article: 'k1', name: 'Pikachu Keychain', quantity: 2 }, { article: 't1', name: 'Totoro', quantity: 1 }]
```

4. Replace the whole test 'a new commission pre-fills the deal price and saves' with:

```js
  test('a new commission pre-fills the deal price and saves its lines', async ({ page, api }) => {
    seedWith(api)
    await gotoReady(page, '/commissions')
    await page.getByRole('button', { name: '+ New commission' }).click()
    await sheet(page).getByLabel('Customer name').fill('Misty')
    await sheet(page).getByLabel('Email').fill('misty@example.com')
    await addArticle(page, 'Pikachu Keychain')
    await addArticle(page, 'Pikachu Keychain')
    await expect(line(page, 'Pikachu Keychain')).toHaveText('2')
    await addArticle(page, 'Totoro')
    await expect(sheet(page).getByLabel('Agreed price')).toHaveValue('15,00')
    await sheet(page).getByLabel('Notes').fill('Shiny colours')
    await sheet(page).getByRole('button', { name: 'Create commission' }).click()

    await expect(page.getByText('Commission created')).toBeVisible()
    expect(api.db.commissions[0]).toMatchObject({
      customer_name: 'Misty', customer_email: 'misty@example.com', fulfilment: 'pickup', address: '',
      items: TWO_LINES, agreed_price: 15, notes: 'Shiny colours', status: 'open'
    })
    const created = api.requests.find(request => request.method === 'POST' && request.path.endsWith('/commissions/records')).body
    expect(created).not.toHaveProperty('article')
    expect(created).not.toHaveProperty('quantity')
    await expect(page.getByRole('button', { name: /Misty/ })).toContainText('Pikachu Keychain × 2, Totoro · Pickup')
  })
```

5. Replace the whole test 'the price stops following the suggestion once edited' with:

```js
  test('stepping and removing lines updates the price until it is edited', async ({ page, api }) => {
    seedWith(api)
    await gotoReady(page, '/commissions')
    await page.getByRole('button', { name: '+ New commission' }).click()
    const price = sheet(page).getByLabel('Agreed price')
    await addArticle(page, 'Pikachu Keychain')
    await expect(price).toHaveValue('4,00')
    await addArticle(page, 'Glurak Figure')
    await expect(price).toHaveValue('34,00')
    await line(page, 'Pikachu Keychain').getByRole('button', { name: 'Add one Pikachu Keychain' }).click()
    await expect(line(page, 'Pikachu Keychain')).toHaveText('2')
    await expect(price).toHaveValue('37,00')
    await sheet(page).getByRole('button', { name: 'Remove Glurak Figure', exact: true }).click()
    await expect(line(page, 'Glurak Figure')).toHaveCount(0)
    await expect(price).toHaveValue('7,00')
    // The stepper never goes below 1
    await line(page, 'Pikachu Keychain').getByRole('button', { name: 'Remove one Pikachu Keychain' }).click()
    await line(page, 'Pikachu Keychain').getByRole('button', { name: 'Remove one Pikachu Keychain' }).click()
    await expect(line(page, 'Pikachu Keychain')).toHaveText('1')
    await expect(price).toHaveValue('4,00')
    await price.fill('9,50')
    await addArticle(page, 'Glurak Figure')
    await expect(price).toHaveValue('9,50')
  })
```

6. In 'saving while offline says so and keeps the form open', 'the address is only asked for, and required, when shipping' and 'an email the server rejects shows the email message and keeps the form open', replace the line

```js
    await sheet(page).getByLabel('Article').selectOption({ label: 'Glurak Figure' })
```

with

```js
    await addArticle(page, 'Glurak Figure')
```

7. Replace the whole test 'validation names the problem' with:

```js
  test('validation names the problem', async ({ page, api }) => {
    seedWith(api)
    await gotoReady(page, '/commissions')
    await page.getByRole('button', { name: '+ New commission' }).click()
    const save = () => sheet(page).getByRole('button', { name: 'Create commission' }).click()
    const alert = sheet(page).getByRole('alert')
    await save()
    await expect(alert).toHaveText("Enter the customer's name")
    await sheet(page).getByLabel('Customer name').fill('Misty')
    await sheet(page).getByLabel('Email').fill('nope')
    await save()
    await expect(alert).toHaveText('Enter a valid email address')
    await sheet(page).getByLabel('Email').fill('misty@example.com')
    await save()
    await expect(alert).toHaveText('Add at least one article')
    await addArticle(page, 'Glurak Figure')
    await sheet(page).getByRole('button', { name: 'Remove Glurak Figure', exact: true }).click()
    await save()
    await expect(alert).toHaveText('Add at least one article')
    await addArticle(page, 'Glurak Figure')
    await sheet(page).getByLabel('Agreed price').fill('0')
    await save()
    await expect(alert).toHaveText('Agreed price must be above 0')
    expect(api.db.commissions).toHaveLength(0)
  })
```

8. Replace the whole test 'editing keeps the agreed price' with:

```js
  test('editing a legacy commission keeps the price and its article, and saves it as a line', async ({ page, api }) => {
    seedWith(api, [commission({ article: 'k1', quantity: 2, agreed_price: 6.5 })])
    await gotoReady(page, '/commissions')
    await expect(page.getByRole('button', { name: /Ash Ketchum/ })).toContainText('Pikachu Keychain × 2 · Pickup')
    await page.getByRole('button', { name: /Ash Ketchum/ }).click()
    await expect(sheet(page)).toContainText('Pikachu Keychain × 2')
    await sheet(page).getByRole('button', { name: 'Edit' }).click()
    await expect(line(page, 'Pikachu Keychain')).toHaveText('2')
    await expect(sheet(page).getByLabel('Agreed price')).toHaveValue('6,50')
    await sheet(page).getByLabel('Notes').fill('Gold paint')
    await sheet(page).getByRole('button', { name: 'Save changes' }).click()
    await expect.poll(() => api.db.commissions[0].notes).toBe('Gold paint')
    expect(api.db.commissions[0]).toMatchObject({
      agreed_price: 6.5,
      article: 'k1',
      quantity: 2,
      items: [{ article: 'k1', name: 'Pikachu Keychain', quantity: 2 }]
    })
    const update = api.requests.filter(request => request.method === 'PATCH' && request.path.endsWith('/commissions/records/c1')).at(-1).body
    expect(update).not.toHaveProperty('article')
    expect(update).not.toHaveProperty('quantity')
  })
```

9. Replace the whole test 'a commission for an archived article can still be edited' with:

```js
  test('a commission for an archived article can still be edited', async ({ page, api }) => {
    api.seed({
      categories: COMMISSION_CATEGORIES,
      articles: [...COMMISSION_ARTICLES, { id: 'old1', name: 'Retired Dino', category: 'cat-figure', active: false }],
      commissions: [commission({ article: 'old1' })]
    })
    await gotoReady(page, '/commissions')
    await page.getByRole('button', { name: /Ash Ketchum/ }).click()
    await expect(sheet(page)).toContainText('Retired Dino × 1')
    await sheet(page).getByRole('button', { name: 'Edit' }).click()
    await expect(line(page, 'Retired Dino')).toHaveText('1')
    await expect(sheet(page).getByLabel('Add article').locator('option', { hasText: 'Retired Dino' })).toHaveCount(0)
    await sheet(page).getByLabel('Notes').fill('Still the dino')
    await sheet(page).getByRole('button', { name: 'Save changes' }).click()
    await expect.poll(() => api.db.commissions[0].notes).toBe('Still the dino')
    expect(api.db.commissions[0]).toMatchObject({ article: 'old1', items: [{ article: 'old1', name: 'Retired Dino', quantity: 1 }] })
    await expect(sheet(page).getByRole('alert')).toHaveCount(0)
  })
```

10. Inside `test.describe('the commissions page', …)`, after 'customer data can be deleted on request', add:

```js
  test('a multi-line commission lists its lines and books one income naming them', async ({ page, api }) => {
    seedWith(api, [commission({ article: '', quantity: 0, items: TWO_LINES, agreed_price: 15, status: 'ready' })])
    await api.mockTransactions()
    await gotoReady(page, '/commissions')
    await page.getByRole('group', { name: 'Commission status' }).getByRole('button', { name: /Ready/ }).click()
    const row = page.getByRole('button', { name: /Ash Ketchum/ })
    await expect(row).toContainText('Pikachu Keychain × 2, Totoro · Pickup')
    await row.click()
    await expect(sheet(page)).toContainText('Pikachu Keychain × 2')
    await expect(sheet(page)).toContainText('Totoro × 1')
    await sheet(page).getByRole('button', { name: 'Mark delivered' }).click()

    await expect.poll(() => api.posted.length).toBe(1)
    expect(api.posted[0]).toMatchObject({ amount: 15, description: 'Commission: Pikachu Keychain × 2, Totoro × 1 (Ash Ketchum)' })
    expect(api.db.commissions[0].status).toBe('delivered')
    await expect(page.getByText(/added to balance/)).toBeVisible()
    expect(api.posted).toHaveLength(1)
  })

  test('a row folds more than two lines into "+n more"', async ({ page, api }) => {
    seedWith(api, [commission({ article: '', quantity: 0, items: [...TWO_LINES, { article: 'f1', name: 'Glurak Figure', quantity: 1 }] })])
    await gotoReady(page, '/commissions')
    await expect(page.getByRole('button', { name: /Ash Ketchum/ })).toContainText('Pikachu Keychain × 2, Totoro +1 more · Pickup')
  })
```

11. In `test.describe('entry points', …)`, replace the whole test 'a catalog card starts a commission for that article' with:

```js
  test('a catalog card starts a commission for that article', async ({ page, api }) => {
    seedWith(api)
    await gotoReady(page, '/catalog')
    await page.getByRole('button', { name: 'Commission Pikachu Keychain' }).click()
    await expect(line(page, 'Pikachu Keychain')).toHaveText('1')
    await expect(sheet(page).getByLabel('Agreed price')).toHaveValue('4,00')
    await sheet(page).getByLabel('Customer name').fill('Misty')
    await sheet(page).getByLabel('Email').fill('misty@example.com')
    await sheet(page).getByRole('button', { name: 'Create commission' }).click()
    await expect(page.getByText('Commission created')).toBeVisible()
    expect(api.db.commissions[0]).toMatchObject({ items: [{ article: 'k1', name: 'Pikachu Keychain', quantity: 1 }], agreed_price: 4 })
  })
```

12. In 'the Commission button does not add the article to the cart', replace

```js
    await expect(sheet(page).getByLabel('Article')).toHaveValue('k1')
```

with

```js
    await expect(line(page, 'Pikachu Keychain')).toHaveText('1')
```

In `tests/e2e/print-board.spec.js`, inside `test.describe('the print board', …)`, after 'a commission card follows its own status and never touches stock', add:

```js
  test('a multi-line commission card lists every line', async ({ page, api }) => {
    const items = [{ article: 'k1', name: 'Pikachu Keychain', quantity: 2 }, { article: 'f1', name: 'Glurak Figure', quantity: 1 }]
    seedBoard(api, { commissions: [commission({ article: '', quantity: 0, items })] })
    await gotoReady(page, '/print-board')
    const card = (await openColumn(page, 'To print')).getByRole('article', { name: COMMISSION_CARD })
    await expect(card.getByRole('listitem')).toHaveText(['Pikachu Keychain × 2', 'Glurak Figure × 1'])
    await card.getByRole('button', { name: 'Start' }).click()
    await expect.poll(() => api.db.commissions[0].status).toBe('printing')
    const printing = await openColumn(page, 'Printing')
    await expect(printing.getByRole('article', { name: COMMISSION_CARD }).getByRole('listitem')).toHaveText(['Pikachu Keychain × 2', 'Glurak Figure × 1'])
    expect(loggedMovements(api)).toHaveLength(0)
  })
```

In `tests/e2e/mobile.spec.js`, inside `test.describe('phone layout sweep', …)`, after 'the print board fits at 375px with long cards', add:

```js
  test('the commission form fits at 375px with long lines', async ({ page, api }) => {
    api.seed({ articles: longProducts })
    await gotoReady(page, '/commissions')
    await page.getByRole('button', { name: '+ New commission' }).click()
    const dialog = page.getByRole('dialog')
    await dialog.getByLabel('Add article').selectOption({ label: longProducts[0].name })
    await dialog.getByLabel('Add article').selectOption({ label: 'Phone Stand' })
    await expect(dialog.getByRole('group', { name: `Quantity of ${longProducts[0].name}` })).toBeVisible()
    const scrollWidth = await page.evaluate(() => document.documentElement.scrollWidth)
    expect(scrollWidth).toBeLessThanOrEqual(page.viewportSize().width)
    expect(await dialog.evaluate(el => el.scrollWidth > el.clientWidth)).toBe(false)
    expect(await smallTargets(page)).toEqual([])
  })
```

- [ ] **Step 4: Run the tests to verify they fail**

Run: `npm run test:unit`
Expected: FAIL. In `commissions.test.js`, 'delivery income names every line with its quantity, and the customer', 'a complete commission is valid', 'validation names the first problem in a fixed order', 'an anonymised commission skips the customer data checks but keeps the rest', 'quantity and price accept plain numbers only' and 'a bad quantity on any line is refused' fail (`incomeFor` still takes a name; `validateCommission` still asks for `Choose an article`). Every other test passes.

Run: `npx playwright test tests/e2e/commissions.spec.js tests/e2e/print-board.spec.js tests/e2e/mobile.spec.js`
Expected: FAIL. Every test that uses `Add article`, a `Quantity of …` group or a `Remove <name>` button times out (the form still has the single `Article` select); the multi-line delivery and `+1 more` tests fail on the row text (`Unknown article × 0`); the print-board multi-line card has no list items. Untouched tests (lifecycle, anonymising, dashboard links, the 375px sweep) pass.

- [ ] **Step 5: Income and validation take lines**

In `utils/commissions.js`:

1. Replace the whole `incomeFor` export (`export const incomeFor = (commission, articleName) => ({ … })`) with:

```js
// The income always writes "× n", so the booked description reads the same whatever the quantity
export const incomeFor = (commission, articles = []) => ({
  description: `Commission: ${itemsOf(commission, articles).map(lineText).join(', ')} (${commission.customer_name})`,
  amount: Number(commission.agreed_price)
})
```

2. Replace the whole `validateCommission` function with:

```js
const isWholeAtLeastOne = value => /^\d+$/.test(String(value ?? '').trim()) && Number(String(value).trim()) >= 1

export function validateCommission (form) {
  // An anonymised commission has no customer data left to require
  if (!form.anonymised) {
    if (!String(form.customerName ?? '').trim()) return "Enter the customer's name"
    if (!EMAIL.test(String(form.email ?? '').trim())) return 'Enter a valid email address'
  }
  const items = Array.isArray(form.items) ? form.items : []
  if (!items.length) return 'Add at least one article'
  if (!form.anonymised && form.fulfilment === 'shipping' && !String(form.address ?? '').trim()) return 'Enter an address for shipping'
  if (!items.every(line => isWholeAtLeastOne(line.quantity))) return 'Quantity must be a whole number of 1 or more'
  const priceText = String(form.price ?? '').trim()
  if (!/^\d+([.,]\d{1,2})?$/.test(priceText) || !(parseNumber(priceText) > 0)) return 'Agreed price must be above 0'
  return ''
}
```

Run: `npm run test:unit`
Expected: `tests 103`, `pass 103`, `fail 0`.

- [ ] **Step 6: A labelled stepper**

Replace `components/QuantityStepper.vue` with:

```vue
<template>
  <div
    class="flex shrink-0 items-center rounded-lg border border-line bg-card"
    :role="label ? 'group' : undefined"
    :aria-label="label || undefined"
  >
    <button
      type="button"
      class="flex h-11 w-11 items-center justify-center text-ink-muted hover:text-ink"
      :aria-label="`Remove one ${name}`"
      @click.stop="$emit('decrement')"
    >
      <AppIcon name="minus" class="h-4 w-4" />
    </button>
    <span class="w-6 text-center text-sm font-semibold tabular-nums text-ink">{{ quantity }}</span>
    <button
      type="button"
      class="flex h-11 w-11 items-center justify-center text-ink-muted hover:text-ink"
      :aria-label="`Add one ${name}`"
      @click.stop="$emit('increment')"
    >
      <AppIcon name="plus" class="h-4 w-4" />
    </button>
  </div>
</template>

<script setup>
defineProps({
  quantity: { type: Number, required: true },
  name: { type: String, required: true },
  // Names the whole stepper (a group) where several sit together, e.g. "Quantity of <name>"
  label: { type: String, default: '' }
})
defineEmits(['increment', 'decrement'])
</script>
```

- [ ] **Step 7: The commission sheet**

Replace `components/CommissionSheet.vue` with:

```vue
<template>
  <BottomSheet :open="open" :title="title" @update:open="$emit('update:open', $event)">
    <form v-if="mode === 'form'" class="space-y-4" novalidate @submit.prevent="save">
      <p v-if="error" role="alert" class="rounded-lg bg-expense/10 px-3 py-2 text-sm text-expense">{{ error }}</p>
      <p v-if="anonymised" class="rounded-lg bg-muted px-3 py-2 text-sm text-ink-muted">Customer data deleted</p>
      <template v-else>
        <div>
          <label for="commission-name" class="label">Customer name</label>
          <input id="commission-name" v-model="form.customerName" type="text" class="input" autocomplete="off">
        </div>
        <div>
          <label for="commission-email" class="label">Email</label>
          <input id="commission-email" v-model="form.email" type="email" inputmode="email" class="input" autocomplete="off">
        </div>
        <div>
          <p class="label">Delivery</p>
          <SegmentedControl v-model="form.fulfilment" label="Delivery" :options="FULFILMENT_OPTIONS" />
        </div>
        <div v-if="form.fulfilment === 'shipping'">
          <label for="commission-address" class="label">Address</label>
          <textarea id="commission-address" v-model="form.address" rows="3" class="input py-2" />
        </div>
      </template>
      <ul v-if="form.items.length" class="divide-y divide-line rounded-lg border border-line" aria-label="Articles">
        <li v-for="(line, index) in form.items" :key="line.article" class="flex items-center gap-2 py-2 pl-3 pr-1">
          <p class="min-w-0 flex-1 break-words text-sm font-medium text-ink">{{ line.name }}</p>
          <QuantityStepper
            :quantity="Number(line.quantity)"
            :name="line.name"
            :label="`Quantity of ${line.name}`"
            @increment="form.items = setLineQuantity(form.items, index, Number(line.quantity) + 1)"
            @decrement="form.items = setLineQuantity(form.items, index, Number(line.quantity) - 1)"
          />
          <button
            type="button"
            class="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg text-ink-muted hover:bg-muted hover:text-expense"
            :aria-label="`Remove ${line.name}`"
            @click="form.items = removeLine(form.items, index)"
          >
            <AppIcon name="trash" class="h-4 w-4" />
          </button>
        </li>
      </ul>
      <div>
        <label for="commission-add-article" class="label">Add article</label>
        <select id="commission-add-article" class="input pr-9" @change="onAddArticle">
          <option value="" disabled selected>Choose an article</option>
          <option v-for="article in articles" :key="article.id" :value="article.id">{{ article.name }}</option>
        </select>
      </div>
      <div>
        <label for="commission-price" class="label">Agreed price</label>
        <input id="commission-price" v-model="form.price" type="text" inputmode="decimal" class="input" @input="priceTouched = true">
      </div>
      <div>
        <label for="commission-notes" class="label">Notes <span class="font-normal text-ink-muted">(optional)</span></label>
        <textarea id="commission-notes" v-model="form.notes" rows="2" class="input py-2" placeholder="Colour, size, engraving…" />
      </div>
      <div class="space-y-2">
        <BaseButton type="submit" size="lg" block :loading="busy">{{ commission ? 'Save changes' : 'Create commission' }}</BaseButton>
        <BaseButton v-if="commission" variant="secondary" block :disabled="busy" @click="cancelEdit">Cancel</BaseButton>
      </div>
    </form>

    <div v-else-if="commission" class="space-y-5">
      <p v-if="error" role="alert" class="rounded-lg bg-expense/10 px-3 py-2 text-sm text-expense">{{ error }}</p>

      <ol class="grid grid-cols-4 gap-1 text-center text-xs" aria-label="Progress">
        <li
          v-for="step in STEPS"
          :key="step"
          class="rounded-md px-1 py-2 font-medium"
          :class="stepClass(step)"
          :aria-current="commission.status === step ? 'step' : undefined"
        >
          {{ STATUS_LABEL[step] }}
        </li>
      </ol>
      <p v-if="commission.status === 'cancelled'" class="rounded-lg bg-muted px-3 py-2 text-sm text-ink-muted">Cancelled</p>

      <dl class="space-y-2 text-sm">
        <div class="flex justify-between gap-3"><dt class="text-ink-muted">Customer</dt><dd class="text-right font-medium text-ink">{{ customerLabel }}</dd></div>
        <div v-if="commission.customer_email" class="flex justify-between gap-3"><dt class="text-ink-muted">Email</dt><dd class="min-w-0 break-all text-right text-ink">{{ commission.customer_email }}</dd></div>
        <div class="flex justify-between gap-3"><dt class="text-ink-muted">Delivery</dt><dd class="text-right text-ink">{{ commission.fulfilment === 'shipping' ? 'Shipping' : 'Pickup' }}</dd></div>
        <div v-if="commission.fulfilment === 'shipping'" class="flex justify-between gap-3"><dt class="text-ink-muted">Address</dt><dd class="whitespace-pre-line text-right text-ink">{{ commission.address }}</dd></div>
        <div class="flex justify-between gap-3">
          <dt class="text-ink-muted">Articles</dt>
          <dd class="min-w-0 text-right text-ink">
            <ul>
              <li v-for="(line, index) in lines" :key="index" class="break-words">{{ line.name }} × {{ line.quantity }}</li>
            </ul>
          </dd>
        </div>
        <div class="flex justify-between gap-3"><dt class="text-ink-muted">Agreed price</dt><dd class="text-right font-semibold tabular-nums text-ink">{{ formatCurrency(Number(commission.agreed_price)) }}</dd></div>
        <div v-if="commission.notes" class="flex justify-between gap-3"><dt class="text-ink-muted">Notes</dt><dd class="whitespace-pre-line text-right text-ink">{{ commission.notes }}</dd></div>
      </dl>

      <div class="space-y-2">
        <BaseButton v-if="NEXT[commission.status]" size="lg" block :loading="busy" @click="move(NEXT[commission.status])">
          {{ NEXT_ACTION[commission.status] }}
        </BaseButton>
        <BaseButton v-if="PREVIOUS[commission.status]" variant="secondary" block :disabled="busy" @click="move(PREVIOUS[commission.status])">
          Back to {{ STATUS_LABEL[PREVIOUS[commission.status]] }}
        </BaseButton>
        <BaseButton v-if="!isFinal(commission.status)" variant="secondary" block :disabled="busy" @click="startEdit">Edit</BaseButton>
      </div>

      <div v-if="canCancel(commission.status)" class="border-t border-line pt-4">
        <BaseButton v-if="confirming !== 'cancel'" variant="ghost" block :disabled="busy" @click="confirming = 'cancel'">Cancel commission</BaseButton>
        <div v-else class="space-y-3">
          <p class="text-sm text-ink-muted">Cancel this commission? It moves to Done and can't be reopened.</p>
          <div class="grid grid-cols-2 gap-2">
            <BaseButton variant="secondary" @click="confirming = ''">Keep it</BaseButton>
            <BaseButton variant="danger" :loading="busy" @click="move('cancelled')">Yes, cancel</BaseButton>
          </div>
        </div>
      </div>

      <div v-if="!commission.anonymised_at" class="border-t border-line pt-4">
        <BaseButton v-if="confirming !== 'delete'" variant="ghost" block icon="trash" :disabled="busy" @click="confirming = 'delete'">Delete customer data</BaseButton>
        <div v-else class="space-y-3">
          <p class="text-sm text-ink-muted">Remove the name, email and address for good? The article, price and status stay.</p>
          <div class="grid grid-cols-2 gap-2">
            <BaseButton variant="secondary" @click="confirming = ''">Keep data</BaseButton>
            <BaseButton variant="danger" :loading="busy" @click="deleteData">Delete data</BaseButton>
          </div>
        </div>
      </div>
    </div>
  </BottomSheet>
</template>

<script setup>
import { ref, computed, watch } from 'vue'
import { useCommissions } from '~/composables/useCommissions'
import { useTransactions } from '~/composables/useTransactions'
import { useToast } from '~/composables/useToast'
import { formatCurrency } from '~/utils/currency'
import {
  STATUS_LABEL,
  NEXT,
  PREVIOUS,
  NEXT_ACTION,
  isFinal,
  canCancel,
  transitionPatch,
  itemsOf,
  incomeFor,
  validateCommission,
  addLine,
  setLineQuantity,
  removeLine,
  suggestedPriceFor
} from '~/utils/commissions'

const props = defineProps({
  open: { type: Boolean, default: false },
  commission: { type: Object, default: null },
  articles: { type: Array, required: true },
  deals: { type: Array, default: () => [] },
  // Lines a new commission starts with ([{ article, name, quantity }]); copied, never changed in place
  presetItems: { type: Array, default: () => [] }
})
const emit = defineEmits(['update:open', 'saved', 'changed'])

const STEPS = ['open', 'printing', 'ready', 'delivered']
const FULFILMENT_OPTIONS = [
  { value: 'pickup', label: 'Pickup' },
  { value: 'shipping', label: 'Shipping' }
]

const { getCommission, createCommission, updateCommission, anonymise } = useCommissions()
const { addTransaction } = useTransactions()
const { toast } = useToast()

const mode = ref('view')
const form = ref({ items: [] })
const priceTouched = ref(false)
const error = ref('')
const busy = ref(false)
const confirming = ref('')

const toPriceText = amount => (Number(amount) > 0 ? Number(amount).toFixed(2).replace('.', ',') : '')
const parseNumber = value => Number(String(value).trim().replace(',', '.'))
const copyLines = lines => lines.map(line => ({ article: line.article, name: line.name, quantity: Number(line.quantity) }))

const blankForm = () => ({ customerName: '', email: '', fulfilment: 'pickup', address: '', items: copyLines(props.presetItems), price: '', notes: '' })
const formFrom = commission => ({
  customerName: commission.customer_name,
  email: commission.customer_email,
  fulfilment: commission.fulfilment,
  address: commission.address,
  // A legacy record (article × quantity) becomes its one line here and is saved as items
  items: copyLines(itemsOf(commission, props.articles)),
  price: toPriceText(commission.agreed_price),
  notes: commission.notes
})

const title = computed(() => {
  if (mode.value === 'form') return props.commission ? 'Edit commission' : 'New commission'
  return 'Commission'
})

const articleById = id => props.articles.find(article => article.id === id)
const lines = computed(() => (props.commission ? itemsOf(props.commission, props.articles) : []))
const anonymised = computed(() => !!props.commission?.anonymised_at)
const customerLabel = computed(() => (props.commission?.anonymised_at ? 'Anonymised' : props.commission?.customer_name))

// Deal-aware suggestion over every line; it follows the lines until the price is edited
const suggestedPrice = computed(() => suggestedPriceFor(form.value.items ?? [], props.articles, props.deals))

watch(suggestedPrice, (price) => {
  if (mode.value === 'form' && !priceTouched.value) form.value.price = toPriceText(price)
}, { immediate: true })

// Fresh state every time the sheet opens: a new commission starts in the form, an existing one in the read view
watch(() => props.open, (isOpen) => {
  if (!isOpen) return
  error.value = ''
  confirming.value = ''
  if (props.commission) {
    mode.value = 'view'
  } else {
    mode.value = 'form'
    form.value = blankForm()
    priceTouched.value = false
    // Re-opening with the same lines leaves suggestedPrice unchanged, so its watcher would not fire
    form.value.price = toPriceText(suggestedPrice.value)
  }
}, { immediate: true })

// The select is an action, not a value: it adds the chosen article (or one more of it) and resets
const onAddArticle = (event) => {
  const article = articleById(event.target.value)
  if (article) form.value.items = addLine(form.value.items, article)
  event.target.value = ''
}

const stepClass = (step) => {
  const reached = STEPS.indexOf(props.commission.status) >= STEPS.indexOf(step)
  return reached ? 'bg-accent/10 text-accent' : 'bg-muted text-ink-muted'
}

const isOffline = err => (typeof navigator !== 'undefined' && !navigator.onLine) || err?.status === 0
const failMessage = (err, fallback) => (isOffline(err) ? "You're offline — commissions need a connection" : fallback)

const startEdit = () => {
  form.value = formFrom(props.commission)
  priceTouched.value = true
  error.value = ''
  mode.value = 'form'
}

const cancelEdit = () => {
  error.value = ''
  mode.value = 'view'
}

const save = async () => {
  if (busy.value) return
  error.value = validateCommission({ ...form.value, anonymised: anonymised.value })
  if (error.value) return
  busy.value = true
  const shipping = form.value.fulfilment === 'shipping'
  // Anonymised records keep their wiped customer fields untouched
  const customer = anonymised.value
    ? {}
    : {
        customer_name: form.value.customerName.trim(),
        customer_email: form.value.email.trim(),
        fulfilment: form.value.fulfilment,
        address: shipping ? form.value.address.trim() : ''
      }
  // article / quantity belong to records from before items: left untouched on edit, empty on create
  const fields = {
    ...customer,
    items: copyLines(form.value.items),
    agreed_price: parseNumber(form.value.price),
    notes: form.value.notes.trim()
  }
  try {
    if (props.commission) {
      const record = await updateCommission(props.commission.id, fields)
      emit('changed', record)
      mode.value = 'view'
    } else {
      const record = await createCommission(fields)
      emit('saved', record)
      emit('update:open', false)
      toast('Commission created')
    }
  } catch (err) {
    // PocketBase 0.22 reports field errors under response.data.<field>
    error.value = err?.status === 400 && err.response?.data?.customer_email
      ? 'Enter a valid email address'
      : failMessage(err, 'Could not save the commission. Try again.')
  } finally {
    busy.value = false
  }
}

// The commission is updated first; income is only booked once the server has accepted "delivered"
const bookDelivery = (record) => {
  emit('changed', record)
  const income = incomeFor(record, props.articles)
  addTransaction({ ...income, date: new Date().toISOString().split('T')[0] })
  toast(`Delivered — ${formatCurrency(income.amount)} added to balance`)
}

const move = async (target) => {
  if (busy.value) return
  busy.value = true
  error.value = ''
  const delivering = target === 'delivered'
  let patchSent = false
  try {
    let current = props.commission
    if (delivering) {
      // A second device may have delivered it already: never book from a stale screen
      current = await getCommission(props.commission.id)
      if (current.status !== props.commission.status) {
        emit('changed', current)
        error.value = 'This commission was already updated — check its status'
        return
      }
    }
    patchSent = true
    const record = await updateCommission(props.commission.id, transitionPatch(current, target))
    patchSent = false
    confirming.value = ''
    if (delivering) bookDelivery(record)
    else emit('changed', record)
  } catch (err) {
    // The reply may have been lost after the server accepted "delivered": confirm before giving up
    const landed = delivering && patchSent ? await getCommission(props.commission.id).catch(() => null) : null
    if (landed?.status === 'delivered') {
      confirming.value = ''
      bookDelivery(landed)
    } else {
      error.value = failMessage(err, 'Could not update the commission. Check your connection and try again.')
    }
  } finally {
    busy.value = false
  }
}

const deleteData = async () => {
  if (busy.value) return
  busy.value = true
  error.value = ''
  try {
    const record = await anonymise(props.commission.id)
    confirming.value = ''
    emit('changed', record)
  } catch (err) {
    error.value = failMessage(err, 'Could not delete the customer data. Try again.')
  } finally {
    busy.value = false
  }
}
</script>
```

- [ ] **Step 8: Commission rows, print-board cards and the catalog's preset**

In `pages/commissions.vue`:

1. Replace

```vue
        :subtitle="`${item.expand?.article?.name ?? 'Unknown article'} × ${item.quantity} · ${item.fulfilment === 'shipping' ? 'Ship' : 'Pickup'}`"
```

with

```vue
        :subtitle="subtitleOf(item)"
```

2. Replace `import { isFinal } from '~/utils/commissions'` with `import { isFinal, summaryOf } from '~/utils/commissions'`.

3. Directly after the `visible` computed, add:

```js
// The customer is the row title; the subtitle is the line summary and the delivery
const subtitleOf = item =>
  [summaryOf(item, articles.value), item.fulfilment === 'shipping' ? 'Ship' : 'Pickup'].filter(Boolean).join(' · ')
```

In `pages/print-board.vue`:

1. Replace

```vue
            <p class="break-words text-xs text-ink-muted">{{ detailOf(card) }}</p>
```

with

```vue
            <p v-if="card.kind !== 'commission'" class="break-words text-xs text-ink-muted">{{ detailOf(card) }}</p>
            <ul v-else class="text-xs text-ink-muted">
              <li v-for="(line, index) in card.lines" :key="index" class="break-words">{{ line.name }} × {{ line.quantity }}</li>
            </ul>
```

2. Replace the whole `detailOf` function with:

```js
const detailOf = card => (card.kind === 'stock'
  ? `${Number(card.article.stock) || 0} left · target ${targetFor(card.article)}`
  : `Stock print × ${card.job.quantity}`)
```

In `pages/catalog.vue` (the per-card button stays until Task 4; it now hands over one line):

1. In the `<CommissionSheet …>` element, replace `:preset-article-id="commissionArticleId"` with `:preset-items="commissionItems"`.

2. Replace

```js
const isCommissionOpen = ref(false)
const commissionArticleId = ref('')

const openCommission = (product) => {
  commissionArticleId.value = product.id
  isCommissionOpen.value = true
}
```

with

```js
const isCommissionOpen = ref(false)
const commissionItems = ref([])

const openCommission = (product) => {
  commissionItems.value = [{ article: product.id, name: product.name, quantity: 1 }]
  isCommissionOpen.value = true
}
```

- [ ] **Step 9: Run the tests to verify they pass**

Run: `npx playwright test tests/e2e/commissions.spec.js tests/e2e/print-board.spec.js tests/e2e/mobile.spec.js`
Expected: all pass on both projects (`mobile.spec.js` runs on `mobile` only).

Run: `npm run test:unit && npx playwright test`
Expected: `fail 0` (103 unit tests) and `0 failed`.

- [ ] **Step 10: Commit**

```bash
git add utils/commissions.js tests/unit/commissions.test.js tests/e2e/fake-pocketbase.js components/QuantityStepper.vue components/CommissionSheet.vue pages/commissions.vue pages/print-board.vue pages/catalog.vue tests/e2e/commissions.spec.js tests/e2e/print-board.spec.js tests/e2e/mobile.spec.js
git commit -m "Let a commission hold several articles"
```

---

### Task 4: The cart becomes a commission

**Files:**
- Create: `composables/useCommissionDraft.js`
- Modify: `components/CartPanel.vue`
- Modify: `pages/catalog.vue` (cart button, per-card buttons and `CommissionSheet` removed)
- Modify: `pages/commissions.vue` (draft consumption)
- Modify: `tests/e2e/commissions.spec.js`

**Interfaces:**
- Consumes from Task 3: `CommissionSheet` prop `presetItems`; the `line` and `TWO_LINES` helpers in `commissions.spec.js` (same file).
- Produces:
  - `useCommissionDraft() → { setDraft(lines), takeDraft() }` over `useState('commissionDraft', () => [])`. `takeDraft` returns the lines and clears the state.
  - `CartPanel` emits `commission` from a secondary `Commission` button (icon `clipboard`), disabled when the cart is empty.
  - `/commissions` opens the new-commission form with the draft lines once its data has loaded.

Existing tests changed in this task (they use the per-card `Commission <name>` button): in `commissions.spec.js` 'entry points', 'a catalog card starts a commission for that article' (replaced by 'the cart becomes a new commission with every line and the deal price'), 'manage mode hides the Commission buttons' (removed) and 'the Commission button does not add the article to the cart' (removed). 'visitors cannot reach commissions' stays as it is.

- [ ] **Step 1: Write the failing tests**

In `tests/e2e/commissions.spec.js`:

1. Directly after the `line` helper, add:

```js
const card = (page, name) => page.locator('h3', { hasText: name })
const isCompact = page => page.viewportSize().width < 1024
const addToCart = async (page, name, times = 1) => {
  for (let i = 0; i < times; i++) await card(page, name).click()
}
// Below lg the cart is a sheet behind the "View cart" bar
const openCart = async (page) => {
  if (isCompact(page)) await page.getByRole('button', { name: /View cart/ }).click()
}
```

2. In `test.describe('entry points', …)`, delete the tests 'a catalog card starts a commission for that article', 'manage mode hides the Commission buttons' and 'the Commission button does not add the article to the cart', and add as the first tests of that block:

```js
  test('the cart becomes a new commission with every line and the deal price', async ({ page, api }) => {
    seedWith(api)
    await gotoReady(page, '/catalog')
    await expect(page.getByRole('button', { name: /^Commission / })).toHaveCount(0)
    await addToCart(page, 'Pikachu Keychain', 2)
    await addToCart(page, 'Totoro')
    await openCart(page)
    await page.getByRole('button', { name: 'Commission', exact: true }).click()
    await page.waitForURL(url => url.pathname === '/commissions')

    const form = page.getByRole('dialog', { name: 'New commission' })
    await expect(line(page, 'Pikachu Keychain')).toHaveText('2')
    await expect(line(page, 'Totoro')).toHaveText('1')
    await expect(form.getByLabel('Agreed price')).toHaveValue('15,00')
    await form.getByLabel('Customer name').fill('Misty')
    await form.getByLabel('Email').fill('misty@example.com')
    await form.getByRole('button', { name: 'Create commission' }).click()
    await expect(page.getByText('Commission created')).toBeVisible()
    expect(api.db.commissions).toHaveLength(1)
    expect(api.db.commissions[0]).toMatchObject({ items: TWO_LINES, agreed_price: 15, status: 'open' })
    expect(api.db.stock_movements.filter(movement => movement.note !== 'opening stock')).toHaveLength(0)
  })

  test('the cart lines open the form only once', async ({ page, api }) => {
    seedWith(api)
    await gotoReady(page, '/catalog')
    await addToCart(page, 'Totoro')
    await openCart(page)
    await page.getByRole('button', { name: 'Commission', exact: true }).click()
    await expect(line(page, 'Totoro')).toHaveText('1')
    await page.keyboard.press('Escape')
    await expect(sheet(page)).toHaveCount(0)

    // Away and back inside the app (no reload): the draft has been used up
    await page.getByRole('navigation', { name: 'Primary' }).getByRole('link', { name: 'Dashboard', exact: true }).click()
    await page.waitForURL(url => url.pathname === '/')
    await page.goBack()
    await page.waitForURL(url => url.pathname === '/commissions')
    await expect(page.getByText('No commissions here')).toBeVisible()
    await expect(sheet(page)).toHaveCount(0)

    // A commission started by hand begins with no lines
    await page.getByRole('button', { name: '+ New commission' }).click()
    await expect(sheet(page).getByRole('group', { name: /^Quantity of / })).toHaveCount(0)
    await expect(sheet(page).getByLabel('Agreed price')).toHaveValue('')
  })

  test('an empty cart cannot become a commission', async ({ page, api }) => {
    seedWith(api)
    await gotoReady(page, '/catalog')
    test.skip(isCompact(page), 'The phone cart only opens once it holds something')
    await expect(page.getByRole('button', { name: 'Commission', exact: true })).toBeDisabled()
  })
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx playwright test tests/e2e/commissions.spec.js`
Expected: FAIL. 'the cart becomes a new commission…' fails first on `/^Commission /` (the per-card buttons still exist); the other two time out looking for the `Commission` cart button. Every other test passes.

- [ ] **Step 3: The one-time draft**

`composables/useCommissionDraft.js`:

```js
// Cart lines handed from the catalog to the Commissions page. It is a one-time hand-over, not a saved cart:
// the page takes it once, so leaving and coming back (or a reload) does not reopen the form.
export const useCommissionDraft = () => {
  const draft = useState('commissionDraft', () => [])

  const setDraft = (lines) => {
    draft.value = lines.map(line => ({ article: line.article, name: line.name, quantity: Number(line.quantity) }))
  }

  const takeDraft = () => {
    const lines = draft.value
    draft.value = []
    return lines
  }

  return { setDraft, takeDraft }
}
```

- [ ] **Step 4: The cart button**

In `components/CartPanel.vue`:

1. Replace

```vue
    <BaseButton size="lg" block icon="cash" :disabled="!items.length" @click="$emit('submit')">
      Add to Balance
    </BaseButton>
```

with

```vue
    <div class="space-y-2">
      <BaseButton size="lg" block icon="cash" :disabled="!items.length" @click="$emit('submit')">
        Add to Balance
      </BaseButton>
      <BaseButton variant="secondary" block icon="clipboard" :disabled="!items.length" @click="$emit('commission')">
        Commission
      </BaseButton>
    </div>
```

2. Replace `defineEmits(['increment', 'decrement', 'remove', 'submit'])` with `defineEmits(['increment', 'decrement', 'remove', 'submit', 'commission'])`.

The cart only renders for the owner (both `CartPanel` uses in `pages/catalog.vue` sit behind `isOwner`), so the button is owner-only without a prop.

- [ ] **Step 5: The catalog hands its cart over**

In `pages/catalog.vue`:

1. Delete the per-card Commission button (inside `<template v-if="isOwner && !managing">`):

```vue
                  <button
                    type="button"
                    class="flex h-11 w-11 items-center justify-center rounded-lg bg-muted text-ink-muted hover:text-ink"
                    :aria-label="`Commission ${product.name}`"
                    @click.stop="openCommission(product)"
                  >
                    <AppIcon name="clipboard" class="h-5 w-5" />
                  </button>
```

2. Delete the whole `<CommissionSheet v-if="isOwner" … />` element.

3. On both `<CartPanel …>` elements, add `@commission="startCommission"` after `@submit="submitToBalance"`.

4. Add `import { useCommissionDraft } from '~/composables/useCommissionDraft'` after the `useToast` import.

5. Replace

```js
const isCommissionOpen = ref(false)
const commissionItems = ref([])

const openCommission = (product) => {
  commissionItems.value = [{ article: product.id, name: product.name, quantity: 1 }]
  isCommissionOpen.value = true
}
```

with

```js
const { setDraft } = useCommissionDraft()

// The cart's lines travel to the Commissions page once; the cart itself stays page-local and empties on leaving
const startCommission = () => {
  if (selectedProducts.value.length === 0) return
  setDraft(selectedProducts.value.map(product => ({ article: product.id, name: product.name, quantity: product.quantity })))
  isCartOpen.value = false
  navigateTo('/commissions')
}
```

- [ ] **Step 6: The Commissions page takes the draft**

In `pages/commissions.vue`:

1. In the `<CommissionSheet …>` element, add `:preset-items="presetItems"` after `:deals="deals"`.

2. Add `import { useCommissionDraft } from '~/composables/useCommissionDraft'` after the `useToast` import.

3. After `const { toast } = useToast()`, add `const { takeDraft } = useCommissionDraft()`.

4. After `const selected = ref(null)`, add `const presetItems = ref([])`.

5. In `load`, replace

```js
    if (failed.length) toast('Some customer data could not be anonymised — it will be retried next time', { tone: 'warning', duration: 6000 })
```

with

```js
    if (failed.length) toast('Some customer data could not be anonymised — it will be retried next time', { tone: 'warning', duration: 6000 })
    openDraft()
```

6. Replace

```js
const openNew = () => {
  selected.value = null
  sheetOpen.value = true
}
```

with

```js
// Cart lines from the catalog open the new-commission form once, after the articles and deals are loaded
// (so the price suggestion has them). A failed load keeps the draft for Try Again.
const openDraft = () => {
  const lines = takeDraft()
  if (!lines.length) return
  presetItems.value = lines
  selected.value = null
  sheetOpen.value = true
}

const openNew = () => {
  presetItems.value = []
  selected.value = null
  sheetOpen.value = true
}
```

- [ ] **Step 7: Run the tests to verify they pass**

Run: `npx playwright test tests/e2e/commissions.spec.js tests/e2e/catalog.spec.js tests/e2e/deals.spec.js tests/e2e/inventory.spec.js tests/e2e/mobile.spec.js`
Expected: all pass on both projects ('an empty cart cannot become a commission' is skipped on `mobile`). Checkout (`Add to Balance`) is unchanged.

Run: `npm run test:unit && npx playwright test`
Expected: `fail 0` and `0 failed`.

- [ ] **Step 8: Commit**

```bash
git add composables/useCommissionDraft.js components/CartPanel.vue pages/catalog.vue pages/commissions.vue tests/e2e/commissions.spec.js
git commit -m "Turn the cart into a commission"
```

---

### Task 5: Commissions and Print tabs, and More on phones

**Files:**
- Modify: `utils/navigation.js`, `utils/icons.js`
- Create: `tests/unit/navigation.test.js`
- Modify: `components/ListRow.vue`, `components/AppBottomNav.vue`
- Modify: `pages/catalog.vue` (header buttons removed)
- Modify: `tests/e2e/shell.spec.js`, `tests/e2e/commissions.spec.js`, `tests/e2e/print-board.spec.js`, `tests/e2e/mobile.spec.js`

**Interfaces:**
- Consumes: nothing from earlier tasks.
- Produces:
  - `NAV_ITEMS` (seven entries, each with `phone: 'tab' | 'more'`), `PHONE_TABS`, `MORE_ITEMS`, `isActivePath(path, to)` (unchanged), `isMoreActive(path)` from `utils/navigation.js`.
  - Icon `dots`.
  - `ListRow` prop `to` (String, default `''`): when set, the row is a `NuxtLink` with the chevron.
  - Bottom bar: four tab links (accessible names = `label`, visible text = `shortLabel`) and a `More` button with `aria-current="page"` on More pages; a `BottomSheet` titled `More` with three links.

Existing tests changed in this task (they use the 5-tab bottom nav or the Catalog header buttons):
- `shell.spec.js`: 'primary navigation reaches every page and marks it current', 'tab bar links are comfortable tap targets' (renamed 'the tab bar shows five comfortable tap targets'), 'dark mode stays on while moving between tabs'.
- `commissions.spec.js`: 'the catalog header links to the commissions page' (replaced by 'the Commissions tab opens the commissions page').
- `print-board.spec.js`: 'the catalog header opens the print board' (replaced by 'the Print board tab opens the board'); the 'visitors see no print board button' block (replaced by 'the catalog header').

- [ ] **Step 1: Write the failing tests**

`tests/unit/navigation.test.js`:

```js
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { NAV_ITEMS, PHONE_TABS, MORE_ITEMS, isActivePath, isMoreActive } from '../../utils/navigation.js'

test('the menu has seven entries in order, four phone tabs and three under More', () => {
  assert.deepEqual(NAV_ITEMS.map(item => item.label), ['Dashboard', 'Catalog', 'Commissions', 'Print board', 'Reports', 'Business Card', 'Settings'])
  assert.deepEqual(PHONE_TABS.map(item => item.shortLabel), ['Home', 'Catalog', 'Commissions', 'Print'])
  assert.deepEqual(MORE_ITEMS.map(item => item.to), ['/reports', '/business-card', '/settings'])
  assert.deepEqual(NAV_ITEMS.slice(2, 4), [
    { to: '/commissions', label: 'Commissions', shortLabel: 'Commissions', icon: 'clipboard', phone: 'tab' },
    { to: '/print-board', label: 'Print board', shortLabel: 'Print', icon: 'printer', phone: 'tab' }
  ])
})

test('More is active on its own pages only', () => {
  for (const path of ['/reports', '/business-card', '/settings']) assert.equal(isMoreActive(path), true, path)
  for (const path of ['/', '/catalog', '/commissions', '/print-board', '/login']) assert.equal(isMoreActive(path), false, path)
  assert.equal(isActivePath('/', '/'), true)
  assert.equal(isActivePath('/catalog', '/'), false)
})
```

In `tests/e2e/shell.spec.js`:

1. After the `TRANSACTIONS_KEY` constant, add:

```js
// Phones reach Reports, Business Card and Settings through the More sheet; the side rail lists every page.
// Returns the control that should now be marked current.
const goTo = async (page, item) => {
  const nav = page.getByRole('navigation', { name: 'Primary' })
  const more = nav.getByRole('button', { name: 'More', exact: true })
  if (item.phone === 'more' && await more.isVisible()) {
    await more.click()
    await page.getByRole('dialog', { name: 'More' }).getByRole('link', { name: item.label, exact: true }).click()
    await page.waitForURL(url => url.pathname === item.to)
    await expect(page.getByRole('dialog', { name: 'More' })).toHaveCount(0)
    return more
  }
  const link = nav.getByRole('link', { name: item.label, exact: true })
  await link.click()
  await page.waitForURL(url => url.pathname === item.to)
  return link
}
```

2. Replace the whole test 'primary navigation reaches every page and marks it current' with:

```js
  test('primary navigation reaches every page and marks it current', async ({ page, api }) => {
    await api.mockCatalog()
    await gotoReady(page, '/business-card')
    await expect(page.getByRole('navigation', { name: 'Primary' })).toHaveCount(1)

    for (const item of NAV_ITEMS) {
      const current = await goTo(page, item)
      await expect(current).toHaveAttribute('aria-current', 'page')
    }
  })
```

3. Replace the whole test 'tab bar links are comfortable tap targets' with:

```js
  test('the tab bar shows five comfortable tap targets', async ({ page, isMobile }) => {
    test.skip(!isMobile, 'Tab bar is phone-only')
    await gotoReady(page, '/business-card')
    const nav = page.getByRole('navigation', { name: 'Primary' })
    const targets = nav.locator('a[href], button')
    await expect(targets).toHaveCount(5)
    await expect(nav.getByRole('link')).toHaveText(['Home', 'Catalog', 'Commissions', 'Print'])
    await expect(nav.getByRole('button', { name: 'More', exact: true })).toBeVisible()
    for (const target of await targets.all()) {
      const box = await target.boundingBox()
      expect(box.height).toBeGreaterThanOrEqual(44)
      expect(box.width).toBeGreaterThanOrEqual(44)
    }
  })

  test('More opens the other pages and is highlighted on them', async ({ page, api, isMobile }) => {
    test.skip(!isMobile, 'More is phone-only')
    await api.mockCatalog()
    await gotoReady(page, '/catalog')
    const nav = page.getByRole('navigation', { name: 'Primary' })
    const more = nav.getByRole('button', { name: 'More', exact: true })
    await expect(more).not.toHaveAttribute('aria-current', 'page')
    await more.click()
    const sheet = page.getByRole('dialog', { name: 'More' })
    await expect(sheet.getByRole('link')).toHaveText(['Reports', 'Business Card', 'Settings'])
    await sheet.getByRole('link', { name: 'Settings', exact: true }).click()
    await page.waitForURL(url => url.pathname === '/settings')
    await expect(sheet).toHaveCount(0)
    await expect(more).toHaveAttribute('aria-current', 'page')

    for (const path of ['/reports', '/business-card']) {
      await gotoReady(page, path)
      await expect(more).toHaveAttribute('aria-current', 'page')
    }
    await gotoReady(page, '/commissions')
    await expect(more).not.toHaveAttribute('aria-current', 'page')
    await expect(nav.getByRole('link', { name: 'Commissions', exact: true })).toHaveAttribute('aria-current', 'page')
  })

  test('the side nav lists all seven pages', async ({ page, isMobile }) => {
    test.skip(isMobile, 'The side nav is for larger screens')
    await gotoReady(page, '/business-card')
    const nav = page.getByRole('navigation', { name: 'Primary' })
    const links = nav.getByRole('link')
    await expect(links).toHaveCount(7)
    const labels = ['Dashboard', 'Catalog', 'Commissions', 'Print board', 'Reports', 'Business Card', 'Settings']
    for (const [index, label] of labels.entries()) await expect(links.nth(index)).toHaveAccessibleName(label)
    await expect(nav.getByRole('button', { name: 'More', exact: true })).toHaveCount(0)
  })
```

4. In 'dark mode stays on while moving between tabs', replace

```js
    for (const item of NAV_ITEMS) {
      await nav.getByRole('link', { name: item.label, exact: true }).click()
      await page.waitForURL(url => url.pathname === item.to)
      await expect(html).toHaveClass(/dark/)
    }
```

with

```js
    await expect(nav).toHaveCount(1)
    for (const item of NAV_ITEMS) {
      await goTo(page, item)
      await expect(html).toHaveClass(/dark/)
    }
```

In `tests/e2e/commissions.spec.js`, replace the whole test 'the catalog header links to the commissions page' with:

```js
  test('the Commissions tab opens the commissions page', async ({ page, api }) => {
    seedWith(api)
    await gotoReady(page, '/catalog')
    await page.getByRole('navigation', { name: 'Primary' }).getByRole('link', { name: 'Commissions', exact: true }).click()
    await page.waitForURL(url => url.pathname === '/commissions')
  })
```

In `tests/e2e/print-board.spec.js`:

1. Replace the whole test 'the catalog header opens the print board' with:

```js
  test('the Print board tab opens the board', async ({ page, api }) => {
    seedBoard(api)
    await gotoReady(page, '/catalog')
    await page.getByRole('navigation', { name: 'Primary' }).getByRole('link', { name: 'Print board', exact: true }).click()
    await page.waitForURL(url => url.pathname === '/print-board')
  })
```

2. Replace the whole `test.describe('visitors see no print board button', …)` block with:

```js
test.describe('the catalog header', () => {
  test('has no Commissions or Print board buttons: the tabs replace them', async ({ page, api }) => {
    seedBoard(api)
    await gotoReady(page, '/catalog')
    await expect(page.getByRole('button', { name: 'Manage' })).toBeVisible()
    await expect(page.getByRole('button', { name: 'Print board', exact: true })).toHaveCount(0)
    await expect(page.getByRole('button', { name: 'Commissions', exact: true })).toHaveCount(0)
  })
})
```

In `tests/e2e/mobile.spec.js`, inside `test.describe('phone layout sweep', …)`, after 'the commission form fits at 375px with long lines', add:

```js
  test('the More sheet fits at 375px with 44px targets', async ({ page, api }) => {
    await api.mockCatalog()
    await gotoReady(page, '/')
    await page.getByRole('navigation', { name: 'Primary' }).getByRole('button', { name: 'More', exact: true }).click()
    await expect(page.getByRole('dialog', { name: 'More' })).toBeVisible()
    const scrollWidth = await page.evaluate(() => document.documentElement.scrollWidth)
    expect(scrollWidth).toBeLessThanOrEqual(page.viewportSize().width)
    expect(await smallTargets(page)).toEqual([])
  })
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npm run test:unit`
Expected: FAIL. `navigation.test.js` fails to load with `SyntaxError: The requested module '../../utils/navigation.js' does not provide an export named 'MORE_ITEMS'`. Every other suite passes.

Run: `npx playwright test tests/e2e/shell.spec.js tests/e2e/commissions.spec.js tests/e2e/print-board.spec.js tests/e2e/mobile.spec.js`
Expected: FAIL. There is no Commissions or Print board link and no More button; the catalog header still has both buttons. The 375px sweep and the rest pass.

- [ ] **Step 3: Navigation data and the `dots` icon**

Replace `utils/navigation.js` with:

```js
// Every page in menu order. On phones the 'tab' items are the bottom bar and the 'more' items sit in the More sheet;
// larger screens list all of them in the side nav.
export const NAV_ITEMS = [
  { to: '/', label: 'Dashboard', shortLabel: 'Home', icon: 'home', phone: 'tab' },
  { to: '/catalog', label: 'Catalog', shortLabel: 'Catalog', icon: 'bag', phone: 'tab' },
  { to: '/commissions', label: 'Commissions', shortLabel: 'Commissions', icon: 'clipboard', phone: 'tab' },
  { to: '/print-board', label: 'Print board', shortLabel: 'Print', icon: 'printer', phone: 'tab' },
  { to: '/reports', label: 'Reports', shortLabel: 'Reports', icon: 'chart', phone: 'more' },
  { to: '/business-card', label: 'Business Card', shortLabel: 'Card', icon: 'id-card', phone: 'more' },
  { to: '/settings', label: 'Settings', shortLabel: 'Settings', icon: 'cog', phone: 'more' }
]

export const PHONE_TABS = NAV_ITEMS.filter(item => item.phone === 'tab')
export const MORE_ITEMS = NAV_ITEMS.filter(item => item.phone === 'more')

export const isActivePath = (path, to) =>
  to === '/' ? path === '/' : path === to || path.startsWith(`${to}/`)

export const isMoreActive = path => MORE_ITEMS.some(item => isActivePath(path, item.to))
```

In `utils/icons.js`, after the `'chevron-down'` entry, add:

```js
  dots: 'M5 12h.01M12 12h.01M19 12h.01M6 12a1 1 0 11-2 0 1 1 0 012 0zm7 0a1 1 0 11-2 0 1 1 0 012 0zm7 0a1 1 0 11-2 0 1 1 0 012 0z',
```

- [ ] **Step 4: Link rows**

Replace `components/ListRow.vue` with:

```vue
<template>
  <component
    :is="to ? NuxtLink : clickable ? 'button' : 'div'"
    :to="to || undefined"
    :type="!to && clickable ? 'button' : undefined"
    class="flex min-h-[56px] w-full items-center gap-3 px-4 py-3 text-left md:px-5"
    :class="{ 'transition-colors hover:bg-muted focus:outline-none focus-visible:bg-muted': interactive }"
  >
    <div v-if="icon" class="flex h-10 w-10 shrink-0 items-center justify-center rounded-full" :class="iconClass">
      <AppIcon :name="icon" class="h-5 w-5" />
    </div>
    <div class="min-w-0 flex-1">
      <p class="truncate text-sm font-medium text-ink">{{ title }}</p>
      <p v-if="subtitle" class="truncate text-xs text-ink-muted">{{ subtitle }}</p>
    </div>
    <slot name="trailing" />
    <AppIcon v-if="interactive" name="chevron-right" class="h-4 w-4 shrink-0 text-ink-muted" />
  </component>
</template>

<script setup>
import { computed } from 'vue'
import { NuxtLink } from '#components'

const props = defineProps({
  title: { type: String, required: true },
  subtitle: { type: String, default: '' },
  icon: { type: String, default: '' },
  iconClass: { type: String, default: 'bg-muted text-ink-muted' },
  clickable: { type: Boolean, default: false },
  // A route turns the row into a link
  to: { type: String, default: '' }
})

const interactive = computed(() => props.clickable || !!props.to)
</script>
```

- [ ] **Step 5: Tabs and the More sheet**

Replace `components/AppBottomNav.vue` with:

```vue
<template>
  <nav class="fixed inset-x-0 bottom-0 z-40 border-t border-line bg-card pb-safe md:hidden print:hidden" aria-label="Primary">
    <ul class="grid grid-cols-5">
      <li v-for="item in PHONE_TABS" :key="item.to">
        <NuxtLink
          :to="item.to"
          :aria-label="item.label"
          :class="[TAB_CLASS, isActivePath(route.path, item.to) ? 'text-accent' : 'text-ink-muted']"
        >
          <AppIcon :name="item.icon" class="h-6 w-6" />
          <span class="max-w-full truncate px-1">{{ item.shortLabel }}</span>
        </NuxtLink>
      </li>
      <li>
        <button
          type="button"
          :class="[TAB_CLASS, 'w-full', moreActive ? 'text-accent' : 'text-ink-muted']"
          :aria-current="moreActive ? 'page' : undefined"
          aria-haspopup="dialog"
          :aria-expanded="moreOpen"
          @click="moreOpen = true"
        >
          <AppIcon name="dots" class="h-6 w-6" />
          More
        </button>
      </li>
    </ul>

    <BottomSheet v-model:open="moreOpen" title="More">
      <ul class="-mx-4 divide-y divide-line md:-mx-6">
        <li v-for="item in MORE_ITEMS" :key="item.to">
          <ListRow
            :to="item.to"
            :title="item.label"
            :icon="item.icon"
            :icon-class="isActivePath(route.path, item.to) ? 'bg-accent/10 text-accent' : 'bg-muted text-ink-muted'"
          />
        </li>
      </ul>
    </BottomSheet>
  </nav>
</template>

<script setup>
import { ref, computed, watch } from 'vue'
import { PHONE_TABS, MORE_ITEMS, isActivePath, isMoreActive } from '~/utils/navigation'

const TAB_CLASS = 'flex h-16 flex-col items-center justify-center gap-1 text-[11px] font-medium transition-colors'

const route = useRoute()
const moreOpen = ref(false)
// More stands in for Reports, Business Card and Settings, so it lights up on those pages
const moreActive = computed(() => isMoreActive(route.path))

// Picking a page in the sheet (or any other navigation) closes it
watch(() => route.path, () => { moreOpen.value = false })
</script>
```

`components/AppSideNav.vue` is unchanged: it already renders every `NAV_ITEMS` entry, now seven in the new order.

- [ ] **Step 6: The tabs replace the Catalog header buttons**

In `pages/catalog.vue`, replace

```vue
          <template v-if="isOwner" #actions>
            <BaseButton variant="secondary" icon="clipboard" @click="navigateTo('/commissions')">
              <span class="sr-only sm:not-sr-only">Commissions</span>
            </BaseButton>
            <BaseButton variant="secondary" icon="printer" @click="navigateTo('/print-board')">
              <span class="sr-only sm:not-sr-only">Print board</span>
            </BaseButton>
            <BaseButton :variant="managing ? 'primary' : 'secondary'" icon="cog" :aria-pressed="managing" @click="managing = !managing">
```

with

```vue
          <template v-if="isOwner" #actions>
            <BaseButton :variant="managing ? 'primary' : 'secondary'" icon="cog" :aria-pressed="managing" @click="managing = !managing">
```

If the new classes (`max-w-full`, `-mx-4`, `md:-mx-6`) do not apply in the dev server, run `touch tailwind.config.js`; never restart the server.

- [ ] **Step 7: Run the tests to verify they pass**

Run: `npm run test:unit`
Expected: `tests 105`, `pass 105`, `fail 0`.

Run: `npx playwright test tests/e2e/shell.spec.js tests/e2e/commissions.spec.js tests/e2e/print-board.spec.js tests/e2e/mobile.spec.js tests/e2e/dashboard.spec.js tests/e2e/inventory.spec.js tests/e2e/auth.spec.js tests/e2e/navigation.spec.js`
Expected: all pass on both projects. The 375px sweep and tap-target tests cover the five-tab bar on every page.

Run: `npx playwright test`
Expected: `0 failed`.

- [ ] **Step 8: Commit**

```bash
git add utils/navigation.js utils/icons.js tests/unit/navigation.test.js components/ListRow.vue components/AppBottomNav.vue pages/catalog.vue tests/e2e/shell.spec.js tests/e2e/commissions.spec.js tests/e2e/print-board.spec.js tests/e2e/mobile.spec.js
git commit -m "Add Commissions and Print tabs with a More sheet on phones"
```

---

## Self-review

**Spec coverage**
- Criterion 1 (cart → commission, `15,00`): Task 4 'the cart becomes a new commission with every line and the deal price'.
- Criterion 2 (stepper min 1, remove, `Add article`, merge, price follows until edited): Task 1 `addLine` / `setLineQuantity` / `suggestedPriceFor` tests; Task 3 'a new commission pre-fills the deal price and saves its lines' and 'stepping and removing lines updates the price until it is edited'.
- Criterion 3 (`Add at least one article`, order kept): Task 3 unit validation tests and e2e 'validation names the problem'.
- Criterion 4 (one income, multi-line description): Task 3 unit 'delivery income names every line with its quantity, and the customer' and e2e 'a multi-line commission lists its lines and books one income naming them'.
- Criterion 5 (row summary, `+n more`): Task 1 `summaryOf` test; Task 3 row assertions and 'a row folds more than two lines into "+n more"'.
- Criterion 6 (detail lists every line): Task 3 multi-line, legacy-edit and archived tests.
- Criterion 7 (one print-board card listing all lines, Start/Done/Back unchanged): Task 1 board test; Task 3 'a multi-line commission card lists every line'; the existing commission card tests still pass.
- Criterion 8 (legacy read everywhere): Task 1 `itemsOf` legacy tests; Task 3 'editing a legacy commission…', the unchanged 'a commission moves from open to delivered and books its income' (legacy `Glurak Figure × 1`), and the existing print-board commission card test.
- Criterion 9 (five tabs, More highlight and navigation, 44px, 375px): Task 5 shell tests and 'the More sheet fits at 375px with 44px targets'; the existing 375px sweep.
- Criterion 10 (migration, idempotent): Task 2 tests and the snapshot cross-check.
- Removals: per-card buttons and catalog `CommissionSheet` (Task 4), header buttons (Task 5, so the tabs exist before the buttons go). Dashboard links untouched.
- The spec's "Checkout" is the cart's `Add to Balance` button; `Commission` sits directly under it.

**Type consistency**
- `incomeFor(commission, articles)` and `validateCommission({ …, items })` change in Task 3, the same commit as their only caller, `CommissionSheet`, so every task ends with the whole e2e suite green.
- `presetItems` lines `{ article, name, quantity }` match `setDraft` / `takeDraft` (Task 4), `addLine` and `itemsOf` (Task 1), and `planCommissionItems` patches (Task 2).
- Commission cards `{ kind: 'commission', commission, lines }` (Task 1) are rendered from `card.lines` (Task 3).
- `PHONE_TABS`, `MORE_ITEMS`, `isMoreActive` (Task 5) are used only in `AppBottomNav` and the unit test; `NAV_ITEMS` entries keep `to`, `label`, `shortLabel`, `icon`, which `AppSideNav` and `shell.spec.js` read.

**Placeholders:** none; every code step carries its code, and every run step its command and expected result.
