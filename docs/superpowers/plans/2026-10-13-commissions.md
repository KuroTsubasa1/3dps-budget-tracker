# Commissions Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** The owner records made-to-order commissions at the stand, moves them Open → Printing → Ready → Delivered (or Cancelled), books income on delivery, and customer data is anonymised 6 months after completion.

**Architecture:**
- Pure lifecycle and validation rules live in `utils/commissions.js`, unit-tested with `node:test`.
- Data lives in an owner-only PocketBase `commissions` collection, created by the existing migration script.
- A `/commissions` page and a `CommissionSheet` (view and form) handle the work.
- Entry points: a Commission button on catalog cards, a header button in the Catalog, and a Dashboard card.
- Delivery books income through the existing `addTransaction` (offline-safe queue).

**Tech Stack:** Nuxt 3.21 / Vue 3.5 `<script setup>`, Tailwind tokens, PocketBase 0.22 with `pocketbase@0.21.5`, `node:test`, Playwright against the in-memory fake PocketBase.

**Spec:** `docs/superpowers/specs/2026-10-13-commissions-design.md`

## Global Constraints

- **Owner only:** every `commissions` rule is `ownerRule(ownerId)` after `--apply-rules`; the collection is created locked (all `null`). There is no public page.
- **Statuses:** `open`, `printing`, `ready`, `delivered`, `cancelled`.
  - Forward: open→printing→ready→delivered.
  - Back: printing→open, ready→printing.
  - Cancel from open, printing or ready.
  - `delivered` and `cancelled` are final.
- **Timestamps on final moves:** delivered sets `delivered_at`; cancelled sets `cancelled_at` (ISO strings).
- **Income on Delivered:** exactly one transaction via `addTransaction`:
  - `description`: `Commission: <article name> × <qty> (<customer name>)`
  - `amount`: `agreed_price`
  - `date`: today `YYYY-MM-DD`
  - The commission is patched first; if the patch fails, no income is booked.
- **No stock movements** for commissions.
- **Anonymising:**
  - The patch is `{ customer_name: '—', customer_email: '', address: '—', anonymised_at: <ISO> }`. `—` is U+2014.
  - It is due when the status is final, `anonymised_at` is empty, and `delivered_at`/`cancelled_at` is more than 6 calendar months before now.
  - It runs on every Commissions page load.
- **Validation messages**, checked in this order:
  1. `Enter the customer's name`
  2. `Enter a valid email address`
  3. `Choose an article`
  4. `Enter an address for shipping`
  5. `Quantity must be a whole number of 1 or more`
  6. `Agreed price must be above 0`
- **Offline save message:** `You're offline — commissions need a connection`.
- **Price pre-fill:** `priceCart` with the current deals, for quantity × article, formatted with a comma decimal (`7,00`). It stops updating once the owner edits the price.
- **Strings tests rely on:**
  - `Commission <article name>` (card button label)
  - `Commissions` (catalog header button and page title)
  - `+ New commission`, `Create commission`, `Save changes`
  - `Start printing`, `Mark ready`, `Mark delivered`, `Back to Open`, `Back to Printing`
  - `Cancel commission`, `Yes, cancel`, `Delete customer data`, `Delete data`
  - `Commission created`, `Anonymised`
  - `<N> open commission(s)` (Dashboard link)
  - status chips `Open`, `Printing`, `Ready`, `Done` with counts
  - field labels `Customer name`, `Email`, `Delivery`, `Address`, `Article`, `Quantity`, `Agreed price`, `Notes`
  - fulfilment radios `Pickup` and `Shipping`
- **Conventions:** semantic colour tokens, 44px tap targets, `BottomSheet`, `gotoReady`, 2-space indent, single quotes, no semicolons.
- **Never:**
  - stop the `nuxt dev` on :3000;
  - contact pocket.lasseharm.space;
  - run `pb:migrate` with credentials or flags;
  - read `.env`.

## Review Focus

1. **Marking Delivered when the update fails** (offline or server error) must book no income and leave the status unchanged. *Pinned in Task 3: "a failed delivery update books no income".*
2. **The 6-month boundary:** one day before it stays; one day after it is anonymised. *Pinned in Task 1: "anonymising is due only after six calendar months".*
3. **An anonymised commission is still listed** (as "Anonymised") and keeps its article, price and status. *Pinned in Task 3: "finished commissions older than six months lose their customer data on load".*
4. **Editing a commission keeps the agreed price** instead of re-pre-filling it from the deal price. *Pinned in Task 3: "editing keeps the agreed price".*
5. **A visitor (logged out)** sees no Commission buttons, and `/commissions` redirects to login. *Pinned in Task 4: "visitors cannot reach commissions".*

## Working setup

- A `nuxt dev` server serves this checkout on :3000, and Playwright reuses it. The first run after edits may hit cold-compile timeouts; re-run once before investigating.
- Unit tests: `npm run test:unit`. e2e: `npx playwright test <files>` (chromium and mobile).
- e2e uses the fake PocketBase (`tests/e2e/fake-pocketbase.js`) through the `api` fixture (`tests/e2e/fixtures.js`).

## File map

| File | Responsibility | Task |
|---|---|---|
| `utils/commissions.js`, `tests/unit/commissions.test.js` | lifecycle, anonymising, income text, validation | 1 |
| `scripts/lib/pb-plan.mjs`, `scripts/pb-migrate.mjs`, `tests/unit/pb-plan.test.js` | `commissions` collection and rules | 2 |
| `tests/e2e/fake-pocketbase.js`, `tests/e2e/fixtures.js` | `commissions` in the fake, `expand=article`, seed | 3 |
| `composables/useCommissions.js` | data access | 3 |
| `components/CommissionSheet.vue`, `pages/commissions.vue` | sheet (view and form) and page | 3 |
| `tests/e2e/commissions.spec.js` | e2e | 3, 4 |
| `pages/catalog.vue`, `pages/index.vue`, `tests/e2e/mobile.spec.js` | entry points | 4 |

---

### Task 1: Commission rules

**Files:**
- Create: `utils/commissions.js`
- Create: `tests/unit/commissions.test.js`

**Interfaces:**
- Produces:
  - constants: `STATUS_LABEL`, `NEXT`, `PREVIOUS`, `NEXT_ACTION`
  - `isFinal(status)`, `canCancel(status)`
  - `transitionPatch(commission, target, now = new Date())` → patch, or throws
  - `dueForAnonymising(commission, now = new Date())` → boolean
  - `anonymisedPatch(now = new Date())` → patch
  - `incomeFor(commission, articleName)` → `{ description, amount }`
  - `validateCommission(form)` → `''` or a message, where `form` is `{ customerName, email, article, fulfilment, address, quantity, price }` (strings or numbers)

- [ ] **Step 1: Write the failing tests**

`tests/unit/commissions.test.js`:

```js
import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  NEXT,
  PREVIOUS,
  NEXT_ACTION,
  isFinal,
  canCancel,
  transitionPatch,
  dueForAnonymising,
  anonymisedPatch,
  incomeFor,
  validateCommission
} from '../../utils/commissions.js'

const NOW = new Date('2026-10-13T12:00:00.000Z')

test('forward, back and cancel moves follow the lifecycle', () => {
  assert.deepEqual(NEXT, { open: 'printing', printing: 'ready', ready: 'delivered' })
  assert.deepEqual(PREVIOUS, { printing: 'open', ready: 'printing' })
  assert.deepEqual(NEXT_ACTION, { open: 'Start printing', printing: 'Mark ready', ready: 'Mark delivered' })
  assert.deepEqual(transitionPatch({ status: 'open' }, 'printing', NOW), { status: 'printing' })
  assert.deepEqual(transitionPatch({ status: 'ready' }, 'printing', NOW), { status: 'printing' })
  assert.deepEqual(transitionPatch({ status: 'printing' }, 'cancelled', NOW), { status: 'cancelled', cancelled_at: NOW.toISOString() })
  assert.deepEqual(transitionPatch({ status: 'ready' }, 'delivered', NOW), { status: 'delivered', delivered_at: NOW.toISOString() })
})

test('disallowed moves throw', () => {
  assert.throws(() => transitionPatch({ status: 'open' }, 'ready', NOW), /Cannot move a commission from open to ready/)
  assert.throws(() => transitionPatch({ status: 'open' }, 'delivered', NOW), /Cannot move/)
  assert.throws(() => transitionPatch({ status: 'delivered' }, 'ready', NOW), /Cannot move/)
  assert.throws(() => transitionPatch({ status: 'cancelled' }, 'open', NOW), /Cannot move/)
  assert.throws(() => transitionPatch({ status: 'delivered' }, 'cancelled', NOW), /Cannot move/)
})

test('final and cancellable statuses', () => {
  assert.deepEqual(['open', 'printing', 'ready', 'delivered', 'cancelled'].map(isFinal), [false, false, false, true, true])
  assert.deepEqual(['open', 'printing', 'ready', 'delivered', 'cancelled'].map(canCancel), [true, true, true, false, false])
})

test('anonymising is due only after six calendar months', () => {
  const delivered = at => ({ status: 'delivered', delivered_at: at, anonymised_at: '' })
  assert.equal(dueForAnonymising(delivered('2026-04-14 12:00:00.000Z'), NOW), false)
  assert.equal(dueForAnonymising(delivered('2026-04-12 12:00:00.000Z'), NOW), true)
  assert.equal(dueForAnonymising({ status: 'cancelled', cancelled_at: '2026-01-01T00:00:00.000Z', anonymised_at: '' }, NOW), true)
})

test('open, already anonymised or undated commissions are never due', () => {
  assert.equal(dueForAnonymising({ status: 'ready', delivered_at: '2020-01-01 00:00:00.000Z', anonymised_at: '' }, NOW), false)
  assert.equal(dueForAnonymising({ status: 'delivered', delivered_at: '2020-01-01 00:00:00.000Z', anonymised_at: '2020-08-01 00:00:00.000Z' }, NOW), false)
  assert.equal(dueForAnonymising({ status: 'delivered', delivered_at: '', anonymised_at: '' }, NOW), false)
})

test('the anonymised patch wipes name, email and address', () => {
  assert.deepEqual(anonymisedPatch(NOW), { customer_name: '—', customer_email: '', address: '—', anonymised_at: NOW.toISOString() })
})

test('delivery income names the article, quantity and customer', () => {
  assert.deepEqual(
    incomeFor({ quantity: 2, customer_name: 'Ash Ketchum', agreed_price: 7 }, 'Pikachu Keychain'),
    { description: 'Commission: Pikachu Keychain × 2 (Ash Ketchum)', amount: 7 }
  )
})

const VALID = { customerName: 'Misty', email: 'misty@example.com', article: 'k1', fulfilment: 'pickup', address: '', quantity: '2', price: '7,00' }

test('a complete commission is valid', () => {
  assert.equal(validateCommission(VALID), '')
  assert.equal(validateCommission({ ...VALID, fulfilment: 'shipping', address: 'Krete 8, Eutin' }), '')
})

test('validation names the first problem in a fixed order', () => {
  assert.equal(validateCommission({ ...VALID, customerName: '  ' }), "Enter the customer's name")
  assert.equal(validateCommission({ ...VALID, email: 'nope' }), 'Enter a valid email address')
  assert.equal(validateCommission({ ...VALID, article: '' }), 'Choose an article')
  assert.equal(validateCommission({ ...VALID, fulfilment: 'shipping', address: ' ' }), 'Enter an address for shipping')
  assert.equal(validateCommission({ ...VALID, quantity: '0' }), 'Quantity must be a whole number of 1 or more')
  assert.equal(validateCommission({ ...VALID, quantity: '1.5' }), 'Quantity must be a whole number of 1 or more')
  assert.equal(validateCommission({ ...VALID, price: '0' }), 'Agreed price must be above 0')
  assert.equal(validateCommission({ ...VALID, price: '' }), 'Agreed price must be above 0')
})
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npm run test:unit`
Expected: `commissions.test.js` fails with `Cannot find module '.../utils/commissions.js'`. Every other suite passes.

- [ ] **Step 3: Implement**

`utils/commissions.js`:

```js
// Commission lifecycle and privacy rules. See docs/superpowers/specs/2026-10-13-commissions-design.md
export const STATUS_LABEL = { open: 'Open', printing: 'Printing', ready: 'Ready', delivered: 'Delivered', cancelled: 'Cancelled' }
export const NEXT = { open: 'printing', printing: 'ready', ready: 'delivered' }
export const PREVIOUS = { printing: 'open', ready: 'printing' }
export const NEXT_ACTION = { open: 'Start printing', printing: 'Mark ready', ready: 'Mark delivered' }

const ANONYMISE_AFTER_MONTHS = 6

export const isFinal = status => status === 'delivered' || status === 'cancelled'
export const canCancel = status => status === 'open' || status === 'printing' || status === 'ready'

export function transitionPatch (commission, target, now = new Date()) {
  const from = commission.status
  const allowed = NEXT[from] === target || PREVIOUS[from] === target || (target === 'cancelled' && canCancel(from))
  if (!allowed) throw new Error(`Cannot move a commission from ${from} to ${target}`)
  if (target === 'delivered') return { status: target, delivered_at: now.toISOString() }
  if (target === 'cancelled') return { status: target, cancelled_at: now.toISOString() }
  return { status: target }
}

// PocketBase returns dates as "YYYY-MM-DD HH:MM:SS.sssZ"
const parseDate = value => new Date(String(value).replace(' ', 'T'))

export function dueForAnonymising (commission, now = new Date()) {
  if (!isFinal(commission.status) || commission.anonymised_at) return false
  const finished = commission.status === 'delivered' ? commission.delivered_at : commission.cancelled_at
  if (!finished) return false
  const cutoff = new Date(now)
  cutoff.setMonth(cutoff.getMonth() - ANONYMISE_AFTER_MONTHS)
  return parseDate(finished) < cutoff
}

// The email field type rejects '—', so the email is cleared instead
export const anonymisedPatch = (now = new Date()) =>
  ({ customer_name: '—', customer_email: '', address: '—', anonymised_at: now.toISOString() })

export const incomeFor = (commission, articleName) => ({
  description: `Commission: ${articleName} × ${commission.quantity} (${commission.customer_name})`,
  amount: Number(commission.agreed_price)
})

const parseNumber = value => Number(String(value).trim().replace(',', '.'))
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

export function validateCommission (form) {
  if (!String(form.customerName ?? '').trim()) return "Enter the customer's name"
  if (!EMAIL.test(String(form.email ?? '').trim())) return 'Enter a valid email address'
  if (!form.article) return 'Choose an article'
  if (form.fulfilment === 'shipping' && !String(form.address ?? '').trim()) return 'Enter an address for shipping'
  const quantity = parseNumber(form.quantity)
  if (!Number.isInteger(quantity) || quantity < 1) return 'Quantity must be a whole number of 1 or more'
  if (String(form.price ?? '').trim() === '' || !(parseNumber(form.price) > 0)) return 'Agreed price must be above 0'
  return ''
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npm run test:unit`
Expected: all pass, with 9 new tests and `fail 0`.

- [ ] **Step 5: Commit**

```bash
git add utils/commissions.js tests/unit/commissions.test.js
git commit -m "Add commission lifecycle, anonymising and validation rules"
```

---

### Task 2: `commissions` collection in the migration

**Files:**
- Modify: `scripts/lib/pb-plan.mjs`, `scripts/pb-migrate.mjs`, `tests/unit/pb-plan.test.js`

**Interfaces:**
- Produces:
  - `planSchema` creates `commissions` (locked) when it is missing.
  - `rulesFor` gains `commissions`, with every rule set to the owner rule, as the last key.

- [ ] **Step 1: Write the failing tests**

In `tests/unit/pb-plan.test.js`:

1. In 'plans the new collections, article fields and optional price', change the expected ops to:

```js
  assert.deepEqual(opKeys(ops), [
    'createCollection:categories',
    'createCollection:stock_movements',
    'createCollection:deals',
    'createCollection:commissions',
    `addFields:${ARTICLES}`,
    `updateField:${ARTICLES}.price`
  ])
  assert.deepEqual(ops[4].fields.map(field => field.name), ['category', 'stock', 'low_stock_threshold'])
```

2. In 'rules pin the owner record id, close sign-up first, and apply only once', append `'setRules:commissions'` as the last expected op (after `'setRules:budget_tracker_transactions'`).

3. Append:

```js
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
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npm run test:unit`
Expected: FAIL. There is no `createCollection:commissions` op and no `commissions` rules.

- [ ] **Step 3: Implement**

In `scripts/lib/pb-plan.mjs`:

1. Add two helpers next to the existing field helpers:

```js
const email = (name, required = false) =>
  ({ name, type: 'email', required, presentable: false, options: { exceptDomains: null, onlyDomains: null } })
const date = name =>
  ({ name, type: 'date', required: false, presentable: false, options: { min: '', max: '' } })
```

2. In `rulesFor`, add as the last key (after `[TRANSACTIONS]`):

```js
    commissions: { listRule: O, viewRule: O, createRule: O, updateRule: O, deleteRule: O }
```

(with a comma added after the `[TRANSACTIONS]` entry).

3. In `planSchema`, directly after the `deals` block, add:

```js
  if (!byName(collections, 'commissions')) {
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
          relation('article', articles.id, true),
          number('quantity', { required: true, min: 1, noDecimal: true }),
          number('agreed_price', { required: true, min: 0 }),
          text('notes'),
          select('status', ['open', 'printing', 'ready', 'delivered', 'cancelled'], true),
          date('delivered_at'),
          date('cancelled_at'),
          date('anonymised_at')
        ],
        indexes: [],
        ...LOCKED
      }
    })
  }
```

In `scripts/pb-migrate.mjs` `writeSnapshot`, add `'commissions'` to the `ours` set.

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npm run test:unit`
Expected: `fail 0`.

- [ ] **Step 5: Commit**

```bash
git add scripts/lib/pb-plan.mjs scripts/pb-migrate.mjs tests/unit/pb-plan.test.js
git commit -m "Create the owner-only commissions collection in the migration"
```

---

### Task 3: Commissions page and sheet

**Files:**
- Modify: `tests/e2e/fake-pocketbase.js`, `tests/e2e/fixtures.js`
- Create: `composables/useCommissions.js`, `components/CommissionSheet.vue`, `pages/commissions.vue`
- Create: `tests/e2e/commissions.spec.js`

**Interfaces:**
- Consumes:
  - from Task 1: everything in `utils/commissions.js`;
  - `priceCart` from `utils/deals.js`;
  - `useArticles().listActive`, `useDeals().listDeals`, `useTransactions().addTransaction` and `useToast().toast`.
- Produces:
  - `useCommissions() → { listCommissions(), createCommission(fields), updateCommission(id, fields), anonymise(id), anonymiseDue(list, now?) }`. Lists and writes expand `article`.
  - `<CommissionSheet v-model:open :commission="record|null" :articles :deals :preset-article-id="string" @saved="record" @changed="record">`
  - The fake supports `expand=article`, and `api.seed({ commissions })`.

- [ ] **Step 1: Teach the fake about commissions**

In `tests/e2e/fake-pocketbase.js`:
1. Add `'commissions'` to `COLLECTIONS` and to `OWNER_READ_ONLY`.
2. Add `commissions: { notes: '', address: '', delivered_at: '', cancelled_at: '', anonymised_at: '' }` to `DEFAULTS`.
3. Replace `withExpand` with a version that also expands `article`:

```js
  // Expand only the relations the app asks for: category (articles) and article (commissions)
  const EXPANDABLE = { category: 'categories', article: 'budget_tracket_catalog' }
  const withExpand = (record, expand) => {
    const fields = String(expand || '').split(',').map(field => field.trim()).filter(field => EXPANDABLE[field] && record[field])
    if (!fields.length) return record
    return { ...record, expand: Object.fromEntries(fields.map(field => [field, db[EXPANDABLE[field]].find(item => item.id === record[field])])) }
  }
```

In `tests/e2e/fixtures.js` `seed`:
- change the signature to `seed ({ categories = SAMPLE_CATEGORIES, articles = [], deals = [], commissions = [] } = {})`;
- after the deals push, add `fake.db.commissions.push(...structuredClone(commissions))`.

- [ ] **Step 2: Write the failing tests**

`tests/e2e/commissions.spec.js`:

```js
import { test, expect, gotoReady } from './fixtures.js'

export const COMMISSION_CATEGORIES = [
  { id: 'cat-keychain', name: 'Keychain', base_price: 4, sort_order: 0 },
  { id: 'cat-figure', name: 'Big Figure', base_price: 30, sort_order: 1 }
]
export const COMMISSION_DEALS = [
  { id: 'deal-keychain00', name: 'Keychain 2 for 7', type: 'bundle', categories: ['cat-keychain'], min_qty: 2, price: 7 }
]
export const COMMISSION_ARTICLES = [
  { id: 'k1', name: 'Pikachu Keychain', category: 'cat-keychain' },
  { id: 'f1', name: 'Glurak Figure', category: 'cat-figure' }
]

const sheet = page => page.getByRole('dialog')
const monthsAgo = (months) => {
  const date = new Date()
  date.setMonth(date.getMonth() - months)
  return date.toISOString().replace('T', ' ')
}
export const commission = overrides => ({
  id: 'c1',
  customer_name: 'Ash Ketchum',
  customer_email: 'ash@example.com',
  fulfilment: 'pickup',
  address: '',
  article: 'f1',
  quantity: 1,
  agreed_price: 30,
  notes: '',
  status: 'open',
  created: '2026-10-01 10:00:00.000Z',
  delivered_at: '',
  cancelled_at: '',
  anonymised_at: '',
  ...overrides
})

const seedWith = (api, commissions = []) =>
  api.seed({ categories: COMMISSION_CATEGORIES, articles: COMMISSION_ARTICLES, deals: COMMISSION_DEALS, commissions })

test.describe('the commissions page', () => {
  test('a new commission pre-fills the deal price and saves', async ({ page, api }) => {
    seedWith(api)
    await gotoReady(page, '/commissions')
    await page.getByRole('button', { name: '+ New commission' }).click()
    await sheet(page).getByLabel('Customer name').fill('Misty')
    await sheet(page).getByLabel('Email').fill('misty@example.com')
    await sheet(page).getByLabel('Article').selectOption({ label: 'Pikachu Keychain' })
    await sheet(page).getByLabel('Quantity').fill('2')
    await expect(sheet(page).getByLabel('Agreed price')).toHaveValue('7,00')
    await sheet(page).getByLabel('Notes').fill('Shiny colours')
    await sheet(page).getByRole('button', { name: 'Create commission' }).click()

    await expect(page.getByText('Commission created')).toBeVisible()
    expect(api.db.commissions[0]).toMatchObject({
      customer_name: 'Misty', customer_email: 'misty@example.com', fulfilment: 'pickup', address: '',
      article: 'k1', quantity: 2, agreed_price: 7, notes: 'Shiny colours', status: 'open'
    })
    await expect(page.getByRole('button', { name: /Misty/ })).toBeVisible()
  })

  test('the address is only asked for, and required, when shipping', async ({ page, api }) => {
    seedWith(api)
    await gotoReady(page, '/commissions')
    await page.getByRole('button', { name: '+ New commission' }).click()
    await sheet(page).getByLabel('Customer name').fill('Brock')
    await sheet(page).getByLabel('Email').fill('brock@example.com')
    await sheet(page).getByLabel('Article').selectOption({ label: 'Glurak Figure' })
    await expect(sheet(page).getByLabel('Address')).toHaveCount(0)
    await sheet(page).getByRole('radio', { name: 'Shipping' }).click()
    await sheet(page).getByRole('button', { name: 'Create commission' }).click()
    await expect(sheet(page).getByRole('alert')).toHaveText('Enter an address for shipping')
    await sheet(page).getByLabel('Address').fill('Pewter City Gym')
    await sheet(page).getByRole('button', { name: 'Create commission' }).click()
    await expect(sheet(page)).toHaveCount(0)
    expect(api.db.commissions[0]).toMatchObject({ fulfilment: 'shipping', address: 'Pewter City Gym', agreed_price: 30 })
  })

  test('validation names the problem', async ({ page, api }) => {
    seedWith(api)
    await gotoReady(page, '/commissions')
    await page.getByRole('button', { name: '+ New commission' }).click()
    const save = () => sheet(page).getByRole('button', { name: 'Create commission' }).click()
    await save()
    await expect(sheet(page).getByRole('alert')).toHaveText("Enter the customer's name")
    await sheet(page).getByLabel('Customer name').fill('Misty')
    await sheet(page).getByLabel('Email').fill('nope')
    await save()
    await expect(sheet(page).getByRole('alert')).toHaveText('Enter a valid email address')
    await sheet(page).getByLabel('Email').fill('misty@example.com')
    await save()
    await expect(sheet(page).getByRole('alert')).toHaveText('Choose an article')
    await sheet(page).getByLabel('Article').selectOption({ label: 'Glurak Figure' })
    await sheet(page).getByLabel('Quantity').fill('0')
    await save()
    await expect(sheet(page).getByRole('alert')).toHaveText('Quantity must be a whole number of 1 or more')
    await sheet(page).getByLabel('Quantity').fill('1')
    await sheet(page).getByLabel('Agreed price').fill('0')
    await save()
    await expect(sheet(page).getByRole('alert')).toHaveText('Agreed price must be above 0')
    expect(api.db.commissions).toHaveLength(0)
  })

  test('a commission moves from open to delivered and books its income', async ({ page, api }) => {
    seedWith(api, [commission()])
    await api.mockTransactions()
    await gotoReady(page, '/commissions')
    await page.getByRole('button', { name: /Ash Ketchum/ }).click()
    await sheet(page).getByRole('button', { name: 'Start printing' }).click()
    await expect.poll(() => api.db.commissions[0].status).toBe('printing')
    await sheet(page).getByRole('button', { name: 'Mark ready' }).click()
    await expect.poll(() => api.db.commissions[0].status).toBe('ready')
    await sheet(page).getByRole('button', { name: 'Mark delivered' }).click()

    await expect.poll(() => api.posted.length).toBe(1)
    expect(api.posted[0]).toMatchObject({ amount: 30, description: 'Commission: Glurak Figure × 1 (Ash Ketchum)' })
    expect(api.db.commissions[0].status).toBe('delivered')
    expect(api.db.commissions[0].delivered_at).toBeTruthy()
    await expect(page.getByText(/added to balance/)).toBeVisible()
  })

  test('a failed delivery update books no income', async ({ page, api }) => {
    seedWith(api, [commission({ status: 'ready' })])
    await api.mockTransactions()
    api.fail('commissions', 500)
    await gotoReady(page, '/commissions')
    await page.getByRole('button', { name: /Ash Ketchum/ }).click()
    await sheet(page).getByRole('button', { name: 'Mark delivered' }).click()
    await expect(sheet(page).getByRole('alert')).toBeVisible()
    expect(api.posted).toHaveLength(0)
    expect(api.db.commissions[0].status).toBe('ready')
  })

  test('a step back, a cancellation and the Done chip', async ({ page, api }) => {
    seedWith(api, [commission()])
    await gotoReady(page, '/commissions')
    await page.getByRole('button', { name: /Ash Ketchum/ }).click()
    await sheet(page).getByRole('button', { name: 'Start printing' }).click()
    await sheet(page).getByRole('button', { name: 'Back to Open' }).click()
    await expect.poll(() => api.db.commissions[0].status).toBe('open')
    await sheet(page).getByRole('button', { name: 'Cancel commission' }).click()
    await sheet(page).getByRole('button', { name: 'Yes, cancel' }).click()
    await expect.poll(() => api.db.commissions[0].status).toBe('cancelled')
    expect(api.db.commissions[0].cancelled_at).toBeTruthy()
    await page.keyboard.press('Escape')

    const chips = page.getByRole('group', { name: 'Commission status' })
    await expect(chips.getByRole('button', { name: /Done/ })).toContainText('1')
    await chips.getByRole('button', { name: /Done/ }).click()
    await expect(page.getByRole('button', { name: /Ash Ketchum/ })).toBeVisible()
  })

  test('editing keeps the agreed price', async ({ page, api }) => {
    seedWith(api, [commission({ article: 'k1', quantity: 2, agreed_price: 6.5 })])
    await gotoReady(page, '/commissions')
    await page.getByRole('button', { name: /Ash Ketchum/ }).click()
    await sheet(page).getByRole('button', { name: 'Edit' }).click()
    await expect(sheet(page).getByLabel('Agreed price')).toHaveValue('6,50')
    await sheet(page).getByLabel('Notes').fill('Gold paint')
    await sheet(page).getByRole('button', { name: 'Save changes' }).click()
    await expect.poll(() => api.db.commissions[0].notes).toBe('Gold paint')
    expect(api.db.commissions[0].agreed_price).toBe(6.5)
  })

  test('finished commissions older than six months lose their customer data on load', async ({ page, api }) => {
    seedWith(api, [
      commission({ id: 'old', customer_name: 'Old Customer', status: 'delivered', delivered_at: monthsAgo(7), address: 'Somewhere 1', fulfilment: 'shipping' }),
      commission({ id: 'new', customer_name: 'Recent Customer', status: 'delivered', delivered_at: monthsAgo(5) })
    ])
    await gotoReady(page, '/commissions')
    await expect.poll(() => api.db.commissions.find(c => c.id === 'old').anonymised_at).toBeTruthy()
    expect(api.db.commissions.find(c => c.id === 'old')).toMatchObject({ customer_name: '—', customer_email: '', address: '—', status: 'delivered', agreed_price: 30 })
    expect(api.db.commissions.find(c => c.id === 'new')).toMatchObject({ customer_name: 'Recent Customer', anonymised_at: '' })

    await page.getByRole('group', { name: 'Commission status' }).getByRole('button', { name: /Done/ }).click()
    await expect(page.getByRole('button', { name: /Anonymised/ })).toBeVisible()
  })

  test('customer data can be deleted on request', async ({ page, api }) => {
    seedWith(api, [commission()])
    await gotoReady(page, '/commissions')
    await page.getByRole('button', { name: /Ash Ketchum/ }).click()
    await sheet(page).getByRole('button', { name: 'Delete customer data' }).click()
    await sheet(page).getByRole('button', { name: 'Delete data' }).click()
    await expect.poll(() => api.db.commissions[0].customer_name).toBe('—')
    expect(api.db.commissions[0]).toMatchObject({ customer_email: '', status: 'open' })
    await expect(sheet(page).getByRole('button', { name: 'Delete customer data' })).toHaveCount(0)
  })
})
```

- [ ] **Step 3: Run the tests to verify they fail**

Run: `npx playwright test tests/e2e/commissions.spec.js`
Expected: FAIL. `/commissions` is a 404 page, so there is no `+ New commission` button.

- [ ] **Step 4: Data access**

`composables/useCommissions.js`:

```js
import { usePocketBase } from './usePocketBase'
import { anonymisedPatch, dueForAnonymising } from '~/utils/commissions'

const COMMISSIONS = 'commissions'

export const useCommissions = () => {
  const pb = usePocketBase()
  const withArticle = { expand: 'article' }

  const listCommissions = () => pb.collection(COMMISSIONS).getFullList({ expand: 'article', sort: '-created' })
  const createCommission = fields => pb.collection(COMMISSIONS).create({ ...fields, status: 'open' }, withArticle)
  const updateCommission = (id, fields) => pb.collection(COMMISSIONS).update(id, fields, withArticle)
  const anonymise = id => updateCommission(id, anonymisedPatch())

  // DSGVO: finished commissions keep their record but lose customer data after six months
  const anonymiseDue = async (list, now = new Date()) => {
    const due = list.filter(commission => dueForAnonymising(commission, now))
    for (const commission of due) await updateCommission(commission.id, anonymisedPatch(now))
    return due.map(commission => commission.id)
  }

  return { listCommissions, createCommission, updateCommission, anonymise, anonymiseDue }
}
```

- [ ] **Step 5: The sheet**

`components/CommissionSheet.vue`:

```vue
<template>
  <BottomSheet :open="open" :title="title" @update:open="$emit('update:open', $event)">
    <form v-if="mode === 'form'" class="space-y-4" novalidate @submit.prevent="save">
      <p v-if="error" role="alert" class="rounded-lg bg-expense/10 px-3 py-2 text-sm text-expense">{{ error }}</p>
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
      <div>
        <label for="commission-article" class="label">Article</label>
        <select id="commission-article" v-model="form.article" class="input pr-9">
          <option value="" disabled>Choose an article</option>
          <option v-for="article in articles" :key="article.id" :value="article.id">{{ article.name }}</option>
        </select>
      </div>
      <div class="grid grid-cols-2 gap-3">
        <div>
          <label for="commission-quantity" class="label">Quantity</label>
          <input id="commission-quantity" v-model="form.quantity" type="text" inputmode="numeric" class="input">
        </div>
        <div>
          <label for="commission-price" class="label">Agreed price</label>
          <input id="commission-price" v-model="form.price" type="text" inputmode="decimal" class="input" @input="priceTouched = true">
        </div>
      </div>
      <div>
        <label for="commission-notes" class="label">Notes <span class="font-normal text-ink-muted">(optional)</span></label>
        <textarea id="commission-notes" v-model="form.notes" rows="2" class="input py-2" placeholder="Colour, size, engraving…" />
      </div>
      <BaseButton type="submit" size="lg" block :loading="busy">{{ commission ? 'Save changes' : 'Create commission' }}</BaseButton>
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
        <div class="flex justify-between gap-3"><dt class="text-ink-muted">Article</dt><dd class="text-right text-ink">{{ articleName }} × {{ commission.quantity }}</dd></div>
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
        <BaseButton v-if="!isFinal(commission.status)" variant="secondary" block @click="startEdit">Edit</BaseButton>
      </div>

      <div v-if="canCancel(commission.status)" class="border-t border-line pt-4">
        <BaseButton v-if="confirming !== 'cancel'" variant="ghost" block @click="confirming = 'cancel'">Cancel commission</BaseButton>
        <div v-else class="space-y-3">
          <p class="text-sm text-ink-muted">Cancel this commission? It moves to Done and can't be reopened.</p>
          <div class="grid grid-cols-2 gap-2">
            <BaseButton variant="secondary" @click="confirming = ''">Keep it</BaseButton>
            <BaseButton variant="danger" :loading="busy" @click="move('cancelled')">Yes, cancel</BaseButton>
          </div>
        </div>
      </div>

      <div v-if="!commission.anonymised_at" class="border-t border-line pt-4">
        <BaseButton v-if="confirming !== 'delete'" variant="ghost" block icon="trash" @click="confirming = 'delete'">Delete customer data</BaseButton>
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
import { priceCart } from '~/utils/deals'
import {
  STATUS_LABEL,
  NEXT,
  PREVIOUS,
  NEXT_ACTION,
  isFinal,
  canCancel,
  transitionPatch,
  incomeFor,
  validateCommission
} from '~/utils/commissions'

const props = defineProps({
  open: { type: Boolean, default: false },
  commission: { type: Object, default: null },
  articles: { type: Array, required: true },
  deals: { type: Array, default: () => [] },
  presetArticleId: { type: String, default: '' }
})
const emit = defineEmits(['update:open', 'saved', 'changed'])

const STEPS = ['open', 'printing', 'ready', 'delivered']
const FULFILMENT_OPTIONS = [
  { value: 'pickup', label: 'Pickup' },
  { value: 'shipping', label: 'Shipping' }
]

const { createCommission, updateCommission, anonymise } = useCommissions()
const { addTransaction } = useTransactions()
const { toast } = useToast()

const mode = ref('view')
const form = ref({})
const priceTouched = ref(false)
const error = ref('')
const busy = ref(false)
const confirming = ref('')

const toPriceText = amount => (Number(amount) > 0 ? Number(amount).toFixed(2).replace('.', ',') : '')
const parseNumber = value => Number(String(value).trim().replace(',', '.'))

const blankForm = () => ({ customerName: '', email: '', fulfilment: 'pickup', address: '', article: props.presetArticleId, quantity: '1', price: '', notes: '' })
const formFrom = commission => ({
  customerName: commission.customer_name,
  email: commission.customer_email,
  fulfilment: commission.fulfilment,
  address: commission.address,
  article: commission.article,
  quantity: String(commission.quantity),
  price: toPriceText(commission.agreed_price),
  notes: commission.notes
})

const title = computed(() => {
  if (mode.value === 'form') return props.commission ? 'Edit commission' : 'New commission'
  return 'Commission'
})

const articleById = id => props.articles.find(article => article.id === id)
const articleName = computed(() => props.commission?.expand?.article?.name ?? articleById(props.commission?.article)?.name ?? 'Unknown article')
const customerLabel = computed(() => (props.commission?.anonymised_at ? 'Anonymised' : props.commission?.customer_name))

// Deal-aware suggestion for the chosen article and quantity
const suggestedPrice = computed(() => {
  const article = articleById(form.value.article)
  const quantity = parseNumber(form.value.quantity)
  if (!article || !Number.isInteger(quantity) || quantity < 1) return 0
  return priceCart([{
    articleId: article.id,
    name: article.name,
    quantity,
    categoryId: article.category,
    basePrice: article.expand?.category?.base_price ?? 0,
    override: Number(article.price) > 0 ? Number(article.price) : 0
  }], props.deals).total
})

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
    // Re-opening for the same article leaves suggestedPrice unchanged, so its watcher would not fire
    form.value.price = toPriceText(suggestedPrice.value)
  }
}, { immediate: true })

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

const save = async () => {
  error.value = validateCommission(form.value)
  if (error.value) return
  busy.value = true
  const shipping = form.value.fulfilment === 'shipping'
  const fields = {
    customer_name: form.value.customerName.trim(),
    customer_email: form.value.email.trim(),
    fulfilment: form.value.fulfilment,
    address: shipping ? form.value.address.trim() : '',
    article: form.value.article,
    quantity: parseNumber(form.value.quantity),
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
    error.value = failMessage(err, 'Could not save the commission. Try again.')
  } finally {
    busy.value = false
  }
}

// The commission is updated first; income is only booked once the server has accepted "delivered"
const move = async (target) => {
  busy.value = true
  error.value = ''
  try {
    const record = await updateCommission(props.commission.id, transitionPatch(props.commission, target))
    confirming.value = ''
    emit('changed', record)
    if (target === 'delivered') {
      const income = incomeFor(record, record.expand?.article?.name ?? articleName.value)
      addTransaction({ ...income, date: new Date().toISOString().split('T')[0] })
      toast(`Delivered — ${formatCurrency(income.amount)} added to balance`)
    }
  } catch (err) {
    error.value = failMessage(err, 'Could not update the commission. Check your connection and try again.')
  } finally {
    busy.value = false
  }
}

const deleteData = async () => {
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

- [ ] **Step 6: The page**

`pages/commissions.vue`:

```vue
<template>
  <div>
    <PageHeader title="Commissions" subtitle="Made-to-order prints">
      <template #actions>
        <BaseButton @click="openNew">+ New commission</BaseButton>
      </template>
    </PageHeader>

    <div class="no-scrollbar -mx-4 mb-4 flex gap-2 overflow-x-auto px-4 md:mx-0 md:flex-wrap md:px-0" role="group" aria-label="Commission status">
      <button
        v-for="tab in TABS"
        :key="tab.id"
        type="button"
        class="chip"
        :class="activeTab === tab.id ? 'chip-active' : 'chip-idle'"
        :aria-pressed="activeTab === tab.id"
        @click="activeTab = tab.id"
      >
        {{ tab.label }}
        <span class="tabular-nums">{{ counts[tab.id] }}</span>
      </button>
    </div>

    <div v-if="loading" class="card flex h-32 items-center justify-center text-sm text-ink-muted">Loading commissions...</div>
    <div v-else-if="loadError" class="card px-4 py-6 text-center">
      <p class="mb-3 text-sm text-expense">{{ loadError }}</p>
      <BaseButton variant="secondary" icon="refresh" @click="load">Try Again</BaseButton>
    </div>
    <p v-else-if="!visible.length" class="card px-4 py-8 text-center text-sm text-ink-muted">No commissions here</p>
    <div v-else class="card divide-y divide-line overflow-hidden">
      <ListRow
        v-for="item in visible"
        :key="item.id"
        clickable
        :title="item.anonymised_at ? 'Anonymised' : item.customer_name"
        :subtitle="`${item.expand?.article?.name ?? 'Unknown article'} × ${item.quantity} · ${item.fulfilment === 'shipping' ? 'Ship' : 'Pickup'}`"
        @click="openExisting(item)"
      >
        <template #trailing>
          <span class="shrink-0 text-sm font-semibold tabular-nums text-ink">{{ formatCurrency(Number(item.agreed_price)) }}</span>
        </template>
      </ListRow>
    </div>

    <CommissionSheet
      v-model:open="sheetOpen"
      :commission="selected"
      :articles="articles"
      :deals="deals"
      @saved="onSaved"
      @changed="onChanged"
    />
  </div>
</template>

<script setup>
import { ref, computed, onMounted } from 'vue'
import { useCommissions } from '~/composables/useCommissions'
import { useArticles } from '~/composables/useArticles'
import { useDeals } from '~/composables/useDeals'
import { formatCurrency } from '~/utils/currency'
import { isFinal } from '~/utils/commissions'

definePageMeta({ middleware: 'owner' })

const TABS = [
  { id: 'open', label: 'Open' },
  { id: 'printing', label: 'Printing' },
  { id: 'ready', label: 'Ready' },
  { id: 'done', label: 'Done' }
]

const { listCommissions, anonymiseDue } = useCommissions()
const { listActive } = useArticles()
const { listDeals } = useDeals()

const commissions = ref([])
const articles = ref([])
const deals = ref([])
const loading = ref(false)
const loadError = ref('')
const activeTab = ref('open')
const sheetOpen = ref(false)
const selected = ref(null)

const tabOf = commission => (isFinal(commission.status) ? 'done' : commission.status)
const counts = computed(() => Object.fromEntries(TABS.map(tab => [tab.id, commissions.value.filter(item => tabOf(item) === tab.id).length])))
const visible = computed(() => commissions.value.filter(item => tabOf(item) === activeTab.value))

const load = async () => {
  loading.value = true
  loadError.value = ''
  try {
    const [list, articleList, dealList] = await Promise.all([
      listCommissions(),
      listActive(),
      // A deploy made before the migration has no deals yet: price without them
      listDeals().catch(err => (err?.status === 404 ? [] : Promise.reject(err)))
    ])
    articles.value = articleList
    deals.value = dealList
    const changed = await anonymiseDue(list)
    commissions.value = changed.length ? await listCommissions() : list
  } catch (err) {
    loadError.value = 'Could not load commissions. Check your connection and try again.'
  } finally {
    loading.value = false
  }
}

onMounted(load)

const openNew = () => {
  selected.value = null
  sheetOpen.value = true
}

const openExisting = (item) => {
  selected.value = item
  sheetOpen.value = true
}

const onSaved = (record) => {
  commissions.value = [record, ...commissions.value]
  activeTab.value = 'open'
}

const onChanged = (record) => {
  commissions.value = commissions.value.map(item => (item.id === record.id ? record : item))
  selected.value = record
}
</script>
```

- [ ] **Step 7: Run the tests to verify they pass**

Run: `npx playwright test tests/e2e/commissions.spec.js`
Expected: all pass on both projects.

Run: `npm run test:unit && npx playwright test`
Expected: `fail 0` and `0 failed`.

- [ ] **Step 8: Commit**

```bash
git add tests/e2e/fake-pocketbase.js tests/e2e/fixtures.js composables/useCommissions.js components/CommissionSheet.vue pages/commissions.vue tests/e2e/commissions.spec.js
git commit -m "Add the commissions page with lifecycle, delivery income and anonymising"
```

---

### Task 4: Entry points: catalog cards, catalog header, Dashboard

**Files:**
- Modify: `pages/catalog.vue`, `pages/index.vue`, `tests/e2e/commissions.spec.js` (append), `tests/e2e/mobile.spec.js`

**Interfaces:**
- Consumes (Task 3): `CommissionSheet`, `useCommissions().listCommissions`, and `COMMISSION_*`/`commission` exports from `commissions.spec.js`.
- Produces: the owner-only `Commission <name>` card button, the `Commissions` header button, and the Dashboard link `<N> open commission(s)`.

- [ ] **Step 1: Write the failing tests**

Append to `tests/e2e/commissions.spec.js`:

```js
test.describe('entry points', () => {
  test('a catalog card starts a commission for that article', async ({ page, api }) => {
    seedWith(api)
    await gotoReady(page, '/catalog')
    await page.getByRole('button', { name: 'Commission Pikachu Keychain' }).click()
    await expect(sheet(page).getByLabel('Article')).toHaveValue('k1')
    await expect(sheet(page).getByLabel('Agreed price')).toHaveValue('4,00')
    await sheet(page).getByLabel('Customer name').fill('Misty')
    await sheet(page).getByLabel('Email').fill('misty@example.com')
    await sheet(page).getByRole('button', { name: 'Create commission' }).click()
    await expect(page.getByText('Commission created')).toBeVisible()
    expect(api.db.commissions[0]).toMatchObject({ article: 'k1', quantity: 1, agreed_price: 4 })
  })

  test('the catalog header links to the commissions page', async ({ page, api }) => {
    seedWith(api)
    await gotoReady(page, '/catalog')
    await page.getByRole('button', { name: 'Commissions' }).click()
    await page.waitForURL(url => url.pathname === '/commissions')
  })

  test('the dashboard counts open commissions and links to them', async ({ page, api }) => {
    seedWith(api, [
      commission({ id: 'a', status: 'open' }),
      commission({ id: 'b', status: 'printing' }),
      commission({ id: 'c', status: 'delivered', delivered_at: '2026-10-02 10:00:00.000Z' })
    ])
    await gotoReady(page, '/')
    await page.getByRole('link', { name: /2 open commissions/ }).click()
    await page.waitForURL(url => url.pathname === '/commissions')
  })

  test('the dashboard hides the card when nothing is open', async ({ page, api }) => {
    seedWith(api, [commission({ status: 'cancelled', cancelled_at: '2026-10-02 10:00:00.000Z' })])
    await gotoReady(page, '/')
    await expect(page.getByRole('link', { name: /open commission/ })).toHaveCount(0)
  })
})

test.describe('visitors cannot reach commissions', () => {
  test.use({ owner: false })

  test('no commission buttons and the page redirects to login', async ({ page, api }) => {
    seedWith(api)
    await gotoReady(page, '/catalog')
    await expect(page.getByRole('button', { name: /^Commission/ })).toHaveCount(0)
    await page.goto('/commissions')
    await page.waitForURL(url => url.pathname === '/login')
  })
})
```

In `tests/e2e/mobile.spec.js`, add `'/commissions'` to `PAGES` after `'/reports'`.

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx playwright test tests/e2e/commissions.spec.js -g "entry points"`
Expected: FAIL. There is no `Commission Pikachu Keychain` button, no `Commissions` header button, and no Dashboard link. The visitors test passes already, which is correct, because the page is owner-gated in Task 3.

- [ ] **Step 3: Catalog header and cards**

In `pages/catalog.vue`:

1. In the `PageHeader` `#actions` template, before the Manage `BaseButton`, add:

```vue
            <BaseButton variant="secondary" icon="clipboard" @click="navigateTo('/commissions')">Commissions</BaseButton>
```

2. Inside `<template v-if="isOwner && !managing">`, after the add-to-cart `button` (the `v-else` one), add:

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

3. Directly after the `<ArticleSheet … />` element, add:

```vue
    <CommissionSheet
      v-model:open="isCommissionOpen"
      :commission="null"
      :articles="products"
      :deals="deals"
      :preset-article-id="commissionArticleId"
    />
```

4. In the script, after the `onStockChanged` function, add:

```js
const isCommissionOpen = ref(false)
const commissionArticleId = ref('')

const openCommission = (product) => {
  commissionArticleId.value = product.id
  isCommissionOpen.value = true
}
```

`CommissionSheet` reads `presetArticleId` when it opens. It is a fresh form every time, because the sheet's `watch(open)` rebuilds it.

- [ ] **Step 4: Dashboard card**

In `pages/index.vue`:

1. Directly after the closing `</BaseCard>` of the Balance Summary card, add:

```vue
        <NuxtLink
          v-if="openCommissions > 0"
          to="/commissions"
          class="card flex min-h-[56px] items-center justify-between gap-3 px-4 text-sm font-medium text-ink hover:bg-muted md:px-5"
        >
          <span class="flex items-center gap-3">
            <AppIcon name="clipboard" class="h-5 w-5 text-ink-muted" />
            {{ openCommissions }} open {{ openCommissions === 1 ? 'commission' : 'commissions' }}
          </span>
          <AppIcon name="chevron-right" class="h-4 w-4 text-ink-muted" />
        </NuxtLink>
```

2. In the script, add `import { onMounted } from 'vue'` by extending the existing vue import to `import { ref, computed, watch, onMounted } from 'vue'`. Add `import { useCommissions } from '~/composables/useCommissions'` after the `useMediaQuery` import. Then, after `const { displaySettings } = useAppSettings()`, add:

```js
const { listCommissions } = useCommissions()
const openCommissions = ref(0)

onMounted(async () => {
  try {
    const list = await listCommissions()
    openCommissions.value = list.filter(item => ['open', 'printing', 'ready'].includes(item.status)).length
  } catch {
    // No commissions collection yet (before the migration) or offline: the card simply stays hidden
  }
})
```

If `pages/index.vue` already imports `onMounted`, just add the composable lines.

- [ ] **Step 5: Run the tests to verify they pass**

Run: `npx playwright test tests/e2e/commissions.spec.js tests/e2e/mobile.spec.js tests/e2e/catalog.spec.js tests/e2e/dashboard.spec.js`
Expected: all pass on both projects. The 375px sweep covers `/commissions` and the extra card button.

Run: `npm run test:unit && npx playwright test`
Expected: `fail 0` and `0 failed`.

- [ ] **Step 6: Commit**

```bash
git add pages/catalog.vue pages/index.vue tests/e2e/commissions.spec.js tests/e2e/mobile.spec.js
git commit -m "Add commission entry points to catalog cards, the catalog header and the dashboard"
```
