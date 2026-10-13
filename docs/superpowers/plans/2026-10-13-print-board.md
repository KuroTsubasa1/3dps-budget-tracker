# Print Board Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** The owner sees what to print next on a Print board (low-stock articles and Open commissions), moves each card To print → Printing → Done, and finishing a stock print adds it to stock exactly once.

**Architecture:**
- Pure board rules (target, suggestion, the three columns, "today") live in `utils/printBoard.js`, unit-tested with `node:test`. `transitionPatch` in `utils/commissions.js` gains `ready_at`.
- An owner-only PocketBase `print_jobs` collection, plus `articles.target_stock` and `commissions.ready_at`, come from the existing migration script.
- `composables/usePrintJobs.js` lists, starts, finishes and cancels jobs. Finishing writes the `printed` movement through the existing `useInventory().applyMovements` with the movement id equal to the job id, so a retry is detected as "already written" by the existing duplicate-id handling in `createMovement`. No change to `useInventory` is needed.
- A `/print-board` page (owner only) shows three columns side by side at `lg+` and chips with counts on phones. It re-lists after every action.
- Entry points: a "Print board" button in the Catalog header, a Dashboard link `N to print`, and a "Target stock" field in the article editor.

**Tech Stack:** Nuxt 3.21 / Vue 3.5 `<script setup>`, Tailwind tokens, PocketBase 0.22 with `pocketbase@0.21.5`, `node:test`, Playwright against the in-memory fake PocketBase.

**Spec:** `docs/superpowers/specs/2026-10-13-print-board-design.md`

## Global Constraints

- **Owner only:** every `print_jobs` rule is `ownerRule(ownerId)` after `--apply-rules`. The collection is created locked (all five rules `null`). `/print-board` uses `middleware: 'owner'`.
- **Data model:**
  - `print_jobs`: `article` (relation → `budget_tracket_catalog`, single, required), `quantity` (number, integer, min 1, required), `status` (select `printing` | `done`, required), `done_at` (date).
  - `articles.target_stock`: number, integer, min 0, optional. Empty or 0 means "2 × threshold".
  - `commissions.ready_at`: date. `transitionPatch` sets it (ISO) when the target is `ready` and clears it (`''`) when moving back from Ready to Printing.
- **Board rules:**
  - `targetFor(article)` = `target_stock > 0 ? target_stock : 2 × low_stock_threshold`.
  - `suggestedQuantity(article)` = `max(1, targetFor(article) − stock)`.
  - "To print": active articles with threshold > 0, `stock ≤ threshold` and no `printing` job (sorted by stock ascending, then name), then Open commissions (oldest first).
  - "Printing": jobs with status `printing`, then commissions with status `printing`.
  - "Done today": jobs with `done_at` on the local day of `now`, and commissions with status `ready` and `ready_at` on that day.
  - One printing job per article. "Today" is the device's local calendar day.
- **Stock:**
  - "Done" on a stock job writes exactly one `printed +N` movement via `useInventory().applyMovements`, with the movement id = the job id, then patches the job to `done` with `done_at`. A duplicate-id rejection counts as already written.
  - Never patch an article's `stock` directly.
  - Commissions never touch stock.
- **Commission cards:** Start = open → printing; Done = printing → ready; Back = printing → open. Each move re-reads the commission first.
- **Strings (verbatim from the spec):**
  - header `Print board`; columns `To print`, `Printing`, `Done today`; chip group `Print board columns`
  - stock card `<stock> left · target <target>` and button `Print <n>`
  - commission card `Commission · <customer name>` (or `Anonymised`), `<article> × <qty>`, button `Start`
  - printing buttons `Done` and `Back`
  - done today `+<n> to stock` and `Commission ready`
  - `This article is already printing`
  - `Already updated — the board has been refreshed`
  - `You're offline — the print board needs a connection`
  - `Could not update the print board. Try again.`
  - `Run the migration to enable the print board`
  - article editor field `Target stock`, hint `Empty = 2× low-stock threshold`, error `Target stock must be a whole number of 0 or more`
  - Catalog header button `Print board`; Dashboard link `N to print` (`1 to print`), hidden at 0 and quietly hidden when loading fails
- **Placement:** the bottom tab bar stays at 5 tabs. Buttons only, no drag-and-drop.
- **Conventions:**
  - semantic colour tokens (`surface`, `card`, `muted`, `line`, `ink`, `ink-muted`, `accent`, `income`, `expense`), no raw gray/blue classes;
  - 44px tap targets; the page works at 375px with no horizontal scroll;
  - `gotoReady` in e2e;
  - 2-space indent, single quotes, no semicolons.
- **Never:**
  - stop the `nuxt dev` server on :3000;
  - contact pocket.lasseharm.space;
  - run `pb:migrate` with credentials or flags;
  - read `.env`.
- **Git:** only `git add <files you changed>` and `git commit`. NEVER `git stash`, `reset`, `checkout`, `restore`, `clean`, `rebase` or `merge`.

## Review Focus

1. **A stale "Print"**: another device has already started that article. The click must be refused with `This article is already printing` and must not create a second job. *Pinned in Task 3: "a stale Print is refused when the article is already printing".*
2. **"Done" on a job another device already removed with Back** must add no stock and refresh with `Already updated — the board has been refreshed`. *Pinned in Task 3: "Done on a job removed on another device adds no stock".*
3. **A deploy before the migration** (`print_jobs` answers 404) shows `Run the migration to enable the print board`, shows no stock cards, and commission cards still work. *Pinned in Task 3: "without print_jobs the board asks for the migration and commissions still work".*
4. **The stepper never goes below 1**, including when stock already meets the target (suggestion 1). *Pinned in Task 3: "the stepper never goes below 1".*
5. **Clearing Target stock** saves 0 (back to 2× threshold), and a negative value is refused with `Target stock must be a whole number of 0 or more`. *Pinned in Task 4: "an empty target stock saves 0 and a negative one is refused".*

## Working setup

- A `nuxt dev` server serves this checkout on :3000, and Playwright reuses it. The first run after edits may hit cold-compile timeouts; re-run once before investigating.
- Unit tests: `npm run test:unit` (70 tests pass before Task 1). e2e: `npx playwright test <files>` (projects `chromium` at 1280px and `mobile` on a Pixel 7).
- e2e uses the fake PocketBase (`tests/e2e/fake-pocketbase.js`) through the `api` fixture (`tests/e2e/fixtures.js`).
- `api.fail(collection, 'drop')` is one-shot: the write happens, then the reply is lost. The SDK reports status 0, which the app treats as offline.

## File map

| File | Responsibility | Task |
|---|---|---|
| `utils/printBoard.js`, `tests/unit/printBoard.test.js` | target, suggestion, columns, local day | 1 |
| `utils/commissions.js`, `tests/unit/commissions.test.js` | `ready_at` in `transitionPatch` | 1 |
| `scripts/lib/pb-plan.mjs`, `scripts/pb-migrate.mjs`, `tests/unit/pb-plan.test.js` | `print_jobs`, `target_stock`, `ready_at`, rules, snapshot | 2 |
| `tests/e2e/fake-pocketbase.js`, `tests/e2e/fixtures.js` | `print_jobs` in the fake, `||` and `>=` filters, seed | 3 |
| `composables/usePrintJobs.js` | data access | 3 |
| `pages/print-board.vue` | the board | 3 |
| `tests/e2e/print-board.spec.js` | e2e | 3, 4 |
| `components/ArticleSheet.vue`, `tests/e2e/articles.spec.js` | Target stock field | 4 |
| `pages/catalog.vue`, `pages/index.vue`, `tests/e2e/mobile.spec.js` | entry points, 375px sweep | 4 |

---

### Task 1: Board rules and `ready_at`

**Files:**
- Create: `utils/printBoard.js`
- Create: `tests/unit/printBoard.test.js`
- Modify: `utils/commissions.js` (`transitionPatch`)
- Modify: `tests/unit/commissions.test.js`

**Interfaces:**
- Produces:
  - `targetFor(article)` → number
  - `suggestedQuantity(article)` → integer ≥ 1
  - `isSameLocalDay(value, now)` → boolean. `value` is a PocketBase date (`YYYY-MM-DD HH:MM:SS.sssZ`) or an ISO string; empty or invalid gives `false`.
  - `buildBoard({ articles, jobs, commissions, now })` → `{ toPrint, printing, doneToday }`, where each card is one of:
    - `{ kind: 'stock', article, quantity }` (only in `toPrint`)
    - `{ kind: 'job', job, article }`, where `article` is `job.expand.article`, else the matching entry of `articles`, else `null`
    - `{ kind: 'commission', commission }`
  - `transitionPatch(commission, target, now)` now also returns `ready_at: now.toISOString()` for target `ready`, and `ready_at: ''` for ready → printing.

- [ ] **Step 1: Write the failing tests**

`tests/unit/printBoard.test.js`:

```js
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { targetFor, suggestedQuantity, isSameLocalDay, buildBoard } from '../../utils/printBoard.js'

// Built from local times, so the tests hold in every time zone
const NOW = new Date(2026, 9, 13, 12, 0, 0)
const pbDate = date => date.toISOString().replace('T', ' ')

const article = overrides => ({ id: 'a1', name: 'Pikachu Keychain', active: true, stock: 2, low_stock_threshold: 5, target_stock: 0, ...overrides })
const job = overrides => ({ id: 'j1', article: 'a1', quantity: 8, status: 'printing', done_at: '', created: '2026-10-13 08:00:00.000Z', ...overrides })
const commission = overrides => ({ id: 'c1', status: 'open', ready_at: '', created: '2026-10-01 10:00:00.000Z', ...overrides })
const idOf = card => (card.kind === 'commission' ? card.commission.id : card.kind === 'job' ? card.job.id : card.article.id)

test('the target is the article\'s own target stock, or twice the threshold', () => {
  assert.equal(targetFor(article()), 10)
  assert.equal(targetFor(article({ target_stock: 12 })), 12)
  assert.equal(targetFor(article({ target_stock: null })), 10)
})

test('the suggestion fills up to the target and is never below 1', () => {
  assert.equal(suggestedQuantity(article()), 8)
  assert.equal(suggestedQuantity(article({ stock: 0, target_stock: 3 })), 3)
  assert.equal(suggestedQuantity(article({ stock: 5, target_stock: 3 })), 1)
  assert.equal(suggestedQuantity(article({ stock: 10 })), 1)
})

test('To print holds active low-stock articles with a threshold, then open commissions', () => {
  const board = buildBoard({
    articles: [
      article(),
      article({ id: 'none', name: 'No threshold', stock: 0, low_stock_threshold: 0 }),
      article({ id: 'gone', name: 'Archived', active: false }),
      article({ id: 'full', name: 'Plenty', stock: 6 }),
      article({ id: 'edge', name: 'At threshold', stock: 5 })
    ],
    jobs: [],
    commissions: [commission(), commission({ id: 'c2', status: 'printing' })],
    now: NOW
  })
  assert.deepEqual(board.toPrint.map(idOf), ['a1', 'edge', 'c1'])
  assert.deepEqual(board.toPrint[0], { kind: 'stock', article: article(), quantity: 8 })
  assert.deepEqual(board.toPrint[2], { kind: 'commission', commission: commission() })
})

test('an article with a printing job leaves To print and shows under Printing', () => {
  const board = buildBoard({ articles: [article()], jobs: [job()], commissions: [commission({ status: 'printing' })], now: NOW })
  assert.deepEqual(board.toPrint, [])
  assert.deepEqual(board.printing, [
    { kind: 'job', job: job(), article: article() },
    { kind: 'commission', commission: commission({ status: 'printing' }) }
  ])
})

test('a done job does not keep its article off To print', () => {
  const board = buildBoard({ articles: [article()], jobs: [job({ status: 'done', done_at: pbDate(NOW) })], commissions: [], now: NOW })
  assert.deepEqual(board.toPrint.map(idOf), ['a1'])
  assert.deepEqual(board.printing, [])
})

test('To print sorts stock ascending, then by name, and commissions oldest first', () => {
  const board = buildBoard({
    articles: [article({ id: 'b', name: 'Bulbasaur', stock: 1 }), article({ id: 'z', name: 'Zubat', stock: 0 }), article({ id: 'a', name: 'Abra', stock: 1 })],
    jobs: [],
    commissions: [commission({ id: 'new', created: '2026-10-05 10:00:00.000Z' }), commission({ id: 'old', created: '2026-09-01 10:00:00.000Z' })],
    now: NOW
  })
  assert.deepEqual(board.toPrint.map(idOf), ['z', 'a', 'b', 'old', 'new'])
})

test('Done today starts at local midnight', () => {
  const midnight = new Date(2026, 9, 13, 0, 0, 0)
  const justBefore = new Date(2026, 9, 12, 23, 59, 59)
  const board = buildBoard({
    articles: [],
    jobs: [
      job({ id: 'today', status: 'done', done_at: pbDate(midnight) }),
      job({ id: 'yesterday', status: 'done', done_at: pbDate(justBefore) }),
      job({ id: 'running' })
    ],
    commissions: [
      commission({ id: 'ready-today', status: 'ready', ready_at: midnight.toISOString() }),
      commission({ id: 'ready-yesterday', status: 'ready', ready_at: pbDate(justBefore) }),
      commission({ id: 'delivered', status: 'delivered', ready_at: pbDate(midnight) })
    ],
    now: NOW
  })
  assert.deepEqual(board.doneToday.map(idOf), ['today', 'ready-today'])
  assert.equal(board.doneToday[0].article, null)
})

test('empty or invalid dates are never today', () => {
  assert.equal(isSameLocalDay('', NOW), false)
  assert.equal(isSameLocalDay(null, NOW), false)
  assert.equal(isSameLocalDay('not a date', NOW), false)
  assert.equal(isSameLocalDay(pbDate(NOW), NOW), true)
})
```

In `tests/unit/commissions.test.js`:

1. In 'forward, back and cancel moves follow the lifecycle', replace

```js
  assert.deepEqual(transitionPatch({ status: 'ready' }, 'printing', NOW), { status: 'printing' })
```

with

```js
  assert.deepEqual(transitionPatch({ status: 'ready' }, 'printing', NOW), { status: 'printing', ready_at: '' })
```

(The spec now clears `ready_at` on this move; every other assertion in the file stays as it is.)

2. Append:

```js
test('moving to ready stamps ready_at and moving back clears it', () => {
  assert.deepEqual(transitionPatch({ status: 'printing' }, 'ready', NOW), { status: 'ready', ready_at: NOW.toISOString() })
  assert.deepEqual(transitionPatch({ status: 'ready' }, 'printing', NOW), { status: 'printing', ready_at: '' })
  assert.deepEqual(transitionPatch({ status: 'printing' }, 'open', NOW), { status: 'open' })
  assert.deepEqual(transitionPatch({ status: 'open' }, 'printing', NOW), { status: 'printing' })
})
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npm run test:unit`
Expected: FAIL. `printBoard.test.js` fails with `Cannot find module '.../utils/printBoard.js'`. In `commissions.test.js`, 'forward, back and cancel moves follow the lifecycle' and 'moving to ready stamps ready_at and moving back clears it' fail, because `ready_at` is missing. Every other suite passes.

- [ ] **Step 3: Implement**

`utils/printBoard.js`:

```js
// Print board rules. See docs/superpowers/specs/2026-10-13-print-board-design.md

// PocketBase returns dates as "YYYY-MM-DD HH:MM:SS.sssZ"; the app itself writes ISO strings
const parseDate = value => new Date(String(value).replace(' ', 'T'))

export const targetFor = article =>
  Number(article.target_stock) > 0 ? Number(article.target_stock) : 2 * Number(article.low_stock_threshold)

export const suggestedQuantity = article => Math.max(1, targetFor(article) - Number(article.stock))

// "Today" is the device's local calendar day
export function isSameLocalDay (value, now) {
  if (!value) return false
  const date = parseDate(value)
  if (Number.isNaN(date.getTime())) return false
  return date.getFullYear() === now.getFullYear() && date.getMonth() === now.getMonth() && date.getDate() === now.getDate()
}

const oldestFirst = (a, b) => String(a.created ?? '').localeCompare(String(b.created ?? ''))
const newestFirst = field => (a, b) => parseDate(b[field]) - parseDate(a[field])

export function buildBoard ({ articles = [], jobs = [], commissions = [], now = new Date() }) {
  const printingJobs = jobs.filter(job => job.status === 'printing').sort(oldestFirst)
  const printingArticles = new Set(printingJobs.map(job => job.article))
  const lowStock = articles
    .filter(article =>
      article.active &&
      Number(article.low_stock_threshold) > 0 &&
      Number(article.stock) <= Number(article.low_stock_threshold) &&
      !printingArticles.has(article.id))
    .sort((a, b) => Number(a.stock) - Number(b.stock) || String(a.name).localeCompare(String(b.name)))

  const withStatus = status => commissions.filter(commission => commission.status === status).sort(oldestFirst)
  const articleOf = job => job.expand?.article ?? articles.find(article => article.id === job.article) ?? null
  const jobCard = job => ({ kind: 'job', job, article: articleOf(job) })
  const commissionCard = commission => ({ kind: 'commission', commission })

  const doneJobs = jobs.filter(job => job.status === 'done' && isSameLocalDay(job.done_at, now)).sort(newestFirst('done_at'))
  const readyToday = commissions
    .filter(commission => commission.status === 'ready' && isSameLocalDay(commission.ready_at, now))
    .sort(newestFirst('ready_at'))

  return {
    toPrint: [
      ...lowStock.map(article => ({ kind: 'stock', article, quantity: suggestedQuantity(article) })),
      ...withStatus('open').map(commissionCard)
    ],
    printing: [...printingJobs.map(jobCard), ...withStatus('printing').map(commissionCard)],
    doneToday: [...doneJobs.map(jobCard), ...readyToday.map(commissionCard)]
  }
}
```

In `utils/commissions.js`, replace the whole `transitionPatch` function with:

```js
export function transitionPatch (commission, target, now = new Date()) {
  const from = commission.status
  const allowed = NEXT[from] === target || PREVIOUS[from] === target || (target === 'cancelled' && canCancel(from))
  if (!allowed) throw new Error(`Cannot move a commission from ${from} to ${target}`)
  if (target === 'delivered') return { status: target, delivered_at: now.toISOString() }
  if (target === 'cancelled') return { status: target, cancelled_at: now.toISOString() }
  // ready_at feeds the print board's "Done today"; stepping back from Ready clears it
  if (target === 'ready') return { status: target, ready_at: now.toISOString() }
  if (from === 'ready') return { status: target, ready_at: '' }
  return { status: target }
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npm run test:unit`
Expected: `tests 79`, `pass 79`, `fail 0` (8 new board tests and 1 new commission test).

- [ ] **Step 5: Commit**

```bash
git add utils/printBoard.js tests/unit/printBoard.test.js utils/commissions.js tests/unit/commissions.test.js
git commit -m "Add print board rules and stamp ready_at on commissions"
```

---

### Task 2: `print_jobs`, `target_stock` and `ready_at` in the migration

**Files:**
- Modify: `scripts/lib/pb-plan.mjs`, `scripts/pb-migrate.mjs`, `tests/unit/pb-plan.test.js`

**Interfaces:**
- Produces:
  - `planSchema` creates `print_jobs` (locked) when it is missing. It adds `target_stock` to the articles in the existing `addFields` op. It creates `commissions` with `ready_at`, or adds `ready_at` to an existing `commissions` collection that lacks it (`addFields:commissions`).
  - Op order: `categories`, `stock_movements`, `deals`, `commissions` (create, or `addFields` for `ready_at`), `print_jobs`, `addFields` for the articles, `updateField` for the article price.
  - `rulesFor` gains `print_jobs`, with every rule set to the owner rule, as the last key.

- [ ] **Step 1: Write the failing tests**

In `tests/unit/pb-plan.test.js`:

1. In 'plans the new collections, article fields and optional price', replace the body with:

```js
  const ops = planSchema(current())
  assert.deepEqual(opKeys(ops), [
    'createCollection:categories',
    'createCollection:stock_movements',
    'createCollection:deals',
    'createCollection:commissions',
    'createCollection:print_jobs',
    `addFields:${ARTICLES}`,
    `updateField:${ARTICLES}.price`
  ])
  assert.deepEqual(ops[5].fields.map(field => field.name), ['category', 'stock', 'low_stock_threshold', 'target_stock'])
```

2. In 'rules pin the owner record id, close sign-up first, and apply only once', add `'setRules:print_jobs'` as the last expected op (after `'setRules:commissions'`).

3. Append:

```js
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
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npm run test:unit`
Expected: FAIL. There is no `createCollection:print_jobs` op, no `target_stock`, no `ready_at`, and no `print_jobs` rules.

- [ ] **Step 3: Implement**

In `scripts/lib/pb-plan.mjs`:

1. In `rulesFor`, add a comma after the `commissions` entry, then add as the last key:

```js
    print_jobs: { listRule: O, viewRule: O, createRule: O, updateRule: O, deleteRule: O }
```

2. In `planSchema`, replace the whole `if (!byName(collections, 'commissions')) { … }` block with:

```js
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
          relation('article', articles.id, true),
          number('quantity', { required: true, min: 1, noDecimal: true }),
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
  } else if (!findField(commissions, 'ready_at')) {
    // Servers migrated before the print board need the date behind "Done today"
    ops.push({ op: 'addFields', collection: 'commissions', fields: [date('ready_at')] })
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
```

3. In the `missing` list for the articles, after the `low_stock_threshold` line, add:

```js
  if (!findField(articles, 'target_stock')) missing.push(number('target_stock', { min: 0, noDecimal: true }))
```

In `scripts/pb-migrate.mjs`:
- In `writeSnapshot`, change the `ours` set to `new Set(['categories', 'deals', 'stock_movements', 'commissions', 'print_jobs', ARTICLES, TRANSACTIONS])`.
- Change line 1 to `// PocketBase 0.22 migration for categories, deals, stock, commissions, print jobs and owner-only rules.`

Do NOT run `npm run pb:migrate` in any form.

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npm run test:unit`
Expected: `tests 82`, `pass 82`, `fail 0`.

- [ ] **Step 5: Commit**

```bash
git add scripts/lib/pb-plan.mjs scripts/pb-migrate.mjs tests/unit/pb-plan.test.js
git commit -m "Create the owner-only print_jobs collection, target_stock and ready_at in the migration"
```

---

### Task 3: Print board page

**Files:**
- Modify: `tests/e2e/fake-pocketbase.js`, `tests/e2e/fixtures.js`
- Create: `composables/usePrintJobs.js`, `pages/print-board.vue`
- Create: `tests/e2e/print-board.spec.js`

**Interfaces:**
- Consumes:
  - from Task 1: `buildBoard`, `targetFor` (`utils/printBoard.js`) and `transitionPatch` (`utils/commissions.js`);
  - `printedMovement(count)` from `utils/inventory.js`;
  - `useInventory().applyMovements(movements)`. It already sends each movement's `id` to `create`, and `createMovement` swallows a 400 whose `response.data.id` is set (duplicate id = already written);
  - `useArticles().listActive()`;
  - `useCommissions().listCommissions()`, `getCommission(id)` and `updateCommission(id, fields)`.
- Produces:
  - `composables/usePrintJobs.js` exports:
    - `PRINT_JOBS` (`'print_jobs'`), `ALREADY_UPDATED`, and `staleError()` (an `Error` with `code: 'stale'`);
    - `usePrintJobs() → { listPrintJobs(now?), loadBoardData(), startJob(article, quantity), finishJob(job, now?), cancelJob(job) }`.
  - `loadBoardData()` → `{ articles, jobs, commissions, jobsMissing }`. When `print_jobs` answers 404, `articles` and `jobs` are `[]` and `jobsMissing` is `true`.
  - `startJob` rejects with `code: 'already_printing'` (message `This article is already printing`).
  - `finishJob` and `cancelJob` reject with `code: 'stale'` when the job changed elsewhere.
  - `/print-board` (owner only): regions `To print`, `Printing`, `Done today` (`<section aria-label>`); on phones a chip group `Print board columns`; cards are `<article aria-label="<title>">`.
  - The fake supports `print_jobs` (owner-only), filters with `||` and `>=`, and `api.seed({ printJobs })`.

- [ ] **Step 1: Teach the fake about print jobs**

In `tests/e2e/fake-pocketbase.js`:

1. Replace the `COLLECTIONS`, `OWNER_READ_ONLY` and `DEFAULTS` constants with:

```js
const COLLECTIONS = ['categories', 'budget_tracket_catalog', 'stock_movements', 'budget_tracker_transactions', 'deals', 'commissions', 'print_jobs']
const OWNER_READ_ONLY = new Set(['stock_movements', 'budget_tracker_transactions', 'commissions', 'print_jobs'])
const DEFAULTS = {
  categories: { sort_order: 0 },
  budget_tracket_catalog: { collectionId: 'articles0000001', active: true, stock: 0, low_stock_threshold: 2, target_stock: 0, images: [], price: 0, description: '' },
  stock_movements: { note: '' },
  budget_tracker_transactions: { notes: '' },
  deals: {},
  commissions: { notes: '', address: '', delivered_at: '', cancelled_at: '', anonymised_at: '', ready_at: '' },
  print_jobs: { done_at: '' }
}
```

2. Replace `matchesFilter` (with its comment) with:

```js
// Only what the app sends: `field = value` and `field >= value` clauses joined by && and ||, optionally in parentheses
const CLAUSE = /^\s*(\w+)\s*(>=|=)\s*(.+?)\s*$/
// Dates compare as text; the app writes ISO ("T") and PocketBase filters use a space
const asDateText = value => String(value ?? '').replace('T', ' ')
const matchesClause = (record, clause) => {
  const [, field, operator, raw] = clause.match(CLAUSE)
  const value = parseValue(raw)
  if (operator === '>=') return asDateText(record[field]) >= asDateText(value)
  return record[field] === value
}
const matchesFilter = (record, filter) =>
  !filter || filter.replace(/[()]/g, '').split('||').some(group => group.split('&&').every(clause => matchesClause(record, clause)))
```

3. Change the comment above `EXPANDABLE` to `// Expand only the relations the app asks for: category (articles) and article (commissions, print jobs)`.

In `tests/e2e/fixtures.js` `seed`:
- change the signature to `seed ({ categories = SAMPLE_CATEGORIES, articles = [], deals = [], commissions = [], printJobs = [] } = {})`;
- after the commissions push, add `fake.db.print_jobs.push(...structuredClone(printJobs))`;
- in the article defaults, add `target_stock: 0,` after `low_stock_threshold: 2,`.

Deletes, `expand=article` and the `'drop'` one-shot already work for any collection in `COLLECTIONS`.

- [ ] **Step 2: Write the failing tests**

`tests/e2e/print-board.spec.js`:

```js
import { test, expect, gotoReady } from './fixtures.js'

const BOARD_ARTICLES = [
  { id: 'k1', name: 'Pikachu Keychain', category: 'cat-keychain', stock: 2, low_stock_threshold: 5 },
  { id: 'f1', name: 'Glurak Figure', category: 'cat-figure', stock: 10, low_stock_threshold: 2 }
]
const job = overrides => ({
  id: 'job000000000001',
  collectionName: 'print_jobs',
  article: 'k1',
  quantity: 8,
  status: 'printing',
  done_at: '',
  created: '2026-10-13 08:00:00.000Z',
  ...overrides
})
const commission = overrides => ({
  id: 'c1',
  customer_name: 'Ash Ketchum',
  customer_email: 'ash@example.com',
  fulfilment: 'pickup',
  address: '',
  article: 'f1',
  quantity: 1,
  agreed_price: 30,
  notes: 'Shiny colours',
  status: 'open',
  created: '2026-10-01 10:00:00.000Z',
  delivered_at: '',
  cancelled_at: '',
  anonymised_at: '',
  ready_at: '',
  ...overrides
})
const COMMISSION_CARD = 'Commission · Ash Ketchum'

const seedBoard = (api, { articles = BOARD_ARTICLES, printJobs = [], commissions = [] } = {}) =>
  api.seed({ articles, printJobs, commissions })
const stockOf = (api, id) => api.db.budget_tracket_catalog.find(article => article.id === id).stock
const loggedMovements = api => api.db.stock_movements.filter(movement => movement.note !== 'opening stock')

// Phones show one column at a time behind chips; lg+ shows all three
const openColumn = async (page, name) => {
  const chips = page.getByRole('group', { name: 'Print board columns' })
  if (await chips.isVisible()) await chips.getByRole('button', { name: new RegExp(`^${name}`) }).click()
  return page.getByRole('region', { name })
}

test.describe('the print board', () => {
  test('a low-stock article is printed and topped up once', async ({ page, api }) => {
    seedBoard(api)
    await gotoReady(page, '/print-board')
    const toPrint = await openColumn(page, 'To print')
    const card = toPrint.getByRole('article', { name: 'Pikachu Keychain' })
    await expect(card).toContainText('2 left · target 10')
    await expect(toPrint.getByRole('article', { name: 'Glurak Figure' })).toHaveCount(0)
    await card.getByRole('button', { name: 'Print 8' }).click()

    await expect.poll(() => api.db.print_jobs.length).toBe(1)
    expect(api.db.print_jobs[0]).toMatchObject({ article: 'k1', quantity: 8, status: 'printing' })
    await expect(toPrint.getByRole('article', { name: 'Pikachu Keychain' })).toHaveCount(0)

    const printing = await openColumn(page, 'Printing')
    await printing.getByRole('article', { name: 'Pikachu Keychain' }).getByRole('button', { name: 'Done', exact: true }).click()
    await expect.poll(() => api.db.print_jobs[0].status).toBe('done')
    expect(api.db.print_jobs[0].done_at).toBeTruthy()
    expect(stockOf(api, 'k1')).toBe(10)
    expect(loggedMovements(api)).toEqual([
      expect.objectContaining({ id: api.db.print_jobs[0].id, article: 'k1', change: 8, reason: 'printed' })
    ])

    const doneToday = await openColumn(page, 'Done today')
    await expect(doneToday.getByRole('article', { name: 'Pikachu Keychain' })).toContainText('+8 to stock')
  })

  test('a changed stepper quantity is used', async ({ page, api }) => {
    seedBoard(api)
    await gotoReady(page, '/print-board')
    const card = (await openColumn(page, 'To print')).getByRole('article', { name: 'Pikachu Keychain' })
    await card.getByRole('button', { name: 'Add one Pikachu Keychain' }).click()
    await card.getByRole('button', { name: 'Add one Pikachu Keychain' }).click()
    await card.getByRole('button', { name: 'Remove one Pikachu Keychain' }).click()
    await card.getByRole('button', { name: 'Print 9' }).click()
    await expect.poll(() => api.db.print_jobs[0]?.quantity).toBe(9)
  })

  test('the stepper never goes below 1', async ({ page, api }) => {
    seedBoard(api, { articles: [{ id: 'k1', name: 'Pikachu Keychain', category: 'cat-keychain', stock: 4, low_stock_threshold: 5, target_stock: 3 }] })
    await gotoReady(page, '/print-board')
    const card = (await openColumn(page, 'To print')).getByRole('article', { name: 'Pikachu Keychain' })
    await expect(card).toContainText('4 left · target 3')
    await card.getByRole('button', { name: 'Remove one Pikachu Keychain' }).click()
    await card.getByRole('button', { name: 'Print 1' }).click()
    await expect.poll(() => api.db.print_jobs[0]?.quantity).toBe(1)
  })

  test('Back removes the job and returns the article to To print', async ({ page, api }) => {
    seedBoard(api, { printJobs: [job()] })
    await gotoReady(page, '/print-board')
    const printing = await openColumn(page, 'Printing')
    await expect(printing.getByRole('article', { name: 'Pikachu Keychain' })).toContainText('Stock print × 8')
    await printing.getByRole('article', { name: 'Pikachu Keychain' }).getByRole('button', { name: 'Back' }).click()
    await expect.poll(() => api.db.print_jobs.length).toBe(0)
    const toPrint = await openColumn(page, 'To print')
    await expect(toPrint.getByRole('article', { name: 'Pikachu Keychain' }).getByRole('button', { name: 'Print 8' })).toBeVisible()
    expect(loggedMovements(api)).toHaveLength(0)
  })

  test('a retried Done after a lost reply adds the stock once', async ({ page, api }) => {
    seedBoard(api, { printJobs: [job()] })
    await gotoReady(page, '/print-board')
    const printing = await openColumn(page, 'Printing')
    const done = printing.getByRole('article', { name: 'Pikachu Keychain' }).getByRole('button', { name: 'Done', exact: true })
    api.fail('stock_movements', 'drop')
    await done.click()
    await expect(page.getByRole('alert')).toHaveText("You're offline — the print board needs a connection")
    expect(api.db.print_jobs[0].status).toBe('printing')

    await done.click()
    await expect.poll(() => api.db.print_jobs[0].status).toBe('done')
    expect(loggedMovements(api)).toEqual([expect.objectContaining({ id: 'job000000000001', change: 8, reason: 'printed' })])
    expect(stockOf(api, 'k1')).toBe(10)
  })

  test('a stale Print is refused when the article is already printing', async ({ page, api }) => {
    seedBoard(api)
    await gotoReady(page, '/print-board')
    api.db.print_jobs.push(job({ quantity: 3 }))
    const toPrint = await openColumn(page, 'To print')
    await toPrint.getByRole('article', { name: 'Pikachu Keychain' }).getByRole('button', { name: 'Print 8' }).click()
    await expect(page.getByRole('alert')).toHaveText('This article is already printing')
    expect(api.db.print_jobs).toHaveLength(1)
    await expect(toPrint.getByRole('article', { name: 'Pikachu Keychain' })).toHaveCount(0)
  })

  test('Done on a job removed on another device adds no stock', async ({ page, api }) => {
    seedBoard(api, { printJobs: [job()] })
    await gotoReady(page, '/print-board')
    api.db.print_jobs.splice(0)
    const printing = await openColumn(page, 'Printing')
    await printing.getByRole('article', { name: 'Pikachu Keychain' }).getByRole('button', { name: 'Done', exact: true }).click()
    await expect(page.getByRole('alert')).toHaveText('Already updated — the board has been refreshed')
    expect(loggedMovements(api)).toHaveLength(0)
    expect(stockOf(api, 'k1')).toBe(2)
    await expect(printing.getByRole('article', { name: 'Pikachu Keychain' })).toHaveCount(0)
  })

  test('a commission card follows its own status and never touches stock', async ({ page, api }) => {
    seedBoard(api, { commissions: [commission()] })
    await gotoReady(page, '/print-board')
    let toPrint = await openColumn(page, 'To print')
    await expect(toPrint.getByRole('article', { name: COMMISSION_CARD })).toContainText('Glurak Figure × 1')
    await expect(toPrint.getByRole('article', { name: COMMISSION_CARD })).toContainText('Shiny colours')
    await toPrint.getByRole('article', { name: COMMISSION_CARD }).getByRole('button', { name: 'Start' }).click()
    await expect.poll(() => api.db.commissions[0].status).toBe('printing')

    let printing = await openColumn(page, 'Printing')
    await printing.getByRole('article', { name: COMMISSION_CARD }).getByRole('button', { name: 'Back' }).click()
    await expect.poll(() => api.db.commissions[0].status).toBe('open')

    toPrint = await openColumn(page, 'To print')
    await toPrint.getByRole('article', { name: COMMISSION_CARD }).getByRole('button', { name: 'Start' }).click()
    await expect.poll(() => api.db.commissions[0].status).toBe('printing')
    printing = await openColumn(page, 'Printing')
    await printing.getByRole('article', { name: COMMISSION_CARD }).getByRole('button', { name: 'Done', exact: true }).click()
    await expect.poll(() => api.db.commissions[0].status).toBe('ready')
    expect(api.db.commissions[0].ready_at).toBeTruthy()

    const doneToday = await openColumn(page, 'Done today')
    await expect(doneToday.getByRole('article', { name: COMMISSION_CARD })).toContainText('Commission ready')
    expect(loggedMovements(api)).toHaveLength(0)
    expect(api.db.print_jobs).toHaveLength(0)
  })

  test('a commission changed on another device refreshes the board', async ({ page, api }) => {
    seedBoard(api, { commissions: [commission()] })
    await gotoReady(page, '/print-board')
    api.db.commissions[0].status = 'printing'
    const toPrint = await openColumn(page, 'To print')
    await toPrint.getByRole('article', { name: COMMISSION_CARD }).getByRole('button', { name: 'Start' }).click()
    await expect(page.getByRole('alert')).toHaveText('Already updated — the board has been refreshed')
    await expect(toPrint.getByRole('article', { name: COMMISSION_CARD })).toHaveCount(0)
    const printing = await openColumn(page, 'Printing')
    await expect(printing.getByRole('article', { name: COMMISSION_CARD })).toBeVisible()
  })

  test('without print_jobs the board asks for the migration and commissions still work', async ({ page, api }) => {
    seedBoard(api, { commissions: [commission()] })
    api.dropCollection('print_jobs')
    await gotoReady(page, '/print-board')
    await expect(page.getByText('Run the migration to enable the print board')).toBeVisible()
    const toPrint = await openColumn(page, 'To print')
    await expect(toPrint.getByRole('article', { name: 'Pikachu Keychain' })).toHaveCount(0)
    await toPrint.getByRole('article', { name: COMMISSION_CARD }).getByRole('button', { name: 'Start' }).click()
    await expect.poll(() => api.db.commissions[0].status).toBe('printing')
  })
})

test.describe('visitors cannot reach the print board', () => {
  test.use({ owner: false })

  test('logged out, /print-board redirects to login', async ({ page, api }) => {
    seedBoard(api)
    await page.goto('/print-board')
    await page.waitForURL(url => url.pathname === '/login')
  })
})
```

- [ ] **Step 3: Run the tests to verify they fail**

Run: `npx playwright test tests/e2e/print-board.spec.js`
Expected: FAIL. `/print-board` is the 404 page, so there is no `To print` region. The visitors test fails too: `owner` is a named middleware, so nothing redirects until the page declares it.

- [ ] **Step 4: Data access**

`composables/usePrintJobs.js`:

```js
import { usePocketBase } from './usePocketBase'
import { useArticles } from './useArticles'
import { useCommissions } from './useCommissions'
import { useInventory } from './useInventory'
import { printedMovement } from '~/utils/inventory'

export const PRINT_JOBS = 'print_jobs'
export const ALREADY_UPDATED = 'Already updated — the board has been refreshed'
const DONE_DAYS_KEPT = 2

export const staleError = () => Object.assign(new Error(ALREADY_UPDATED), { code: 'stale' })
const alreadyPrinting = () => Object.assign(new Error('This article is already printing'), { code: 'already_printing' })
const missingAsNull = err => (err?.status === 404 ? null : Promise.reject(err))

export const usePrintJobs = () => {
  const pb = usePocketBase()
  const { listActive } = useArticles()
  const { listCommissions } = useCommissions()
  const { applyMovements } = useInventory()
  const withArticle = { expand: 'article' }

  // Printing jobs plus the ones finished since local midnight two days ago: enough for "Done today"
  const listPrintJobs = (now = new Date()) => {
    const since = new Date(now.getFullYear(), now.getMonth(), now.getDate() - DONE_DAYS_KEPT)
    return pb.collection(PRINT_JOBS).getFullList({
      filter: pb.filter('status = "printing" || done_at >= {:since}', { since }),
      expand: 'article',
      sort: 'created'
    })
  }

  // Before the migration print_jobs is missing (404): commission cards still show, stock cards do not
  const loadBoardData = async () => {
    const [articles, jobs, commissions] = await Promise.all([
      listActive(),
      listPrintJobs().catch(missingAsNull),
      listCommissions()
    ])
    return { articles: jobs ? articles : [], jobs: jobs ?? [], commissions, jobsMissing: !jobs }
  }

  // One printing job per article: another device may have started it since the board loaded
  const startJob = async (article, quantity) => {
    const printing = await pb.collection(PRINT_JOBS).getFullList({
      filter: pb.filter('article = {:id} && status = "printing"', { id: article.id })
    })
    if (printing.length) throw alreadyPrinting()
    return pb.collection(PRINT_JOBS).create({ article: article.id, quantity, status: 'printing', done_at: '' }, withArticle)
  }

  // The printed movement's id is the job id: a retried Done finds it already written and adds nothing.
  // The job is re-read first, so a job removed elsewhere adds no stock and a finished one is left alone.
  const finishJob = async (job, now = new Date()) => {
    const current = await pb.collection(PRINT_JOBS).getOne(job.id).catch(missingAsNull)
    if (!current) throw staleError()
    if (current.status === 'done') return current
    await applyMovements([{ id: current.id, article: current.article, ...printedMovement(Number(current.quantity)) }])
    return pb.collection(PRINT_JOBS).update(current.id, { status: 'done', done_at: now.toISOString() }, withArticle)
  }

  // A job that is already gone (a retry after a lost reply) counts as removed; a finished one is never undone
  const cancelJob = async (job) => {
    const current = await pb.collection(PRINT_JOBS).getOne(job.id).catch(missingAsNull)
    if (!current) return
    if (current.status !== 'printing') throw staleError()
    await pb.collection(PRINT_JOBS).delete(current.id)
  }

  return { listPrintJobs, loadBoardData, startJob, finishJob, cancelJob }
}
```

- [ ] **Step 5: The page**

`pages/print-board.vue`:

```vue
<template>
  <div>
    <PageHeader title="Print board" />

    <p v-if="error" role="alert" class="mb-4 rounded-lg bg-expense/10 px-3 py-2 text-sm text-expense">{{ error }}</p>
    <p v-if="jobsMissing" class="mb-4 rounded-lg bg-muted px-3 py-2 text-sm text-ink-muted">Run the migration to enable the print board</p>

    <div class="no-scrollbar -mx-4 mb-4 flex gap-2 overflow-x-auto px-4 md:mx-0 md:flex-wrap md:px-0 lg:hidden" role="group" aria-label="Print board columns">
      <button
        v-for="column in COLUMNS"
        :key="column.id"
        type="button"
        class="chip"
        :class="activeColumn === column.id ? 'chip-active' : 'chip-idle'"
        :aria-pressed="activeColumn === column.id"
        @click="activeColumn = column.id"
      >
        {{ column.label }}
        <span class="tabular-nums">{{ board[column.id].length }}</span>
      </button>
    </div>

    <div v-if="loading" class="card flex h-32 items-center justify-center text-sm text-ink-muted">Loading the print board...</div>
    <div v-else-if="loadError" class="card px-4 py-6 text-center">
      <p class="mb-3 text-sm text-expense">{{ loadError }}</p>
      <BaseButton variant="secondary" icon="refresh" @click="load">Try Again</BaseButton>
    </div>
    <div v-else class="grid gap-4 lg:grid-cols-3 lg:items-start">
      <section
        v-for="column in COLUMNS"
        :key="column.id"
        :aria-label="column.label"
        class="min-w-0 space-y-3"
        :class="activeColumn === column.id ? 'block' : 'hidden lg:block'"
      >
        <h2 class="hidden items-center justify-between text-sm font-semibold text-ink lg:flex">
          {{ column.label }}
          <span class="tabular-nums text-ink-muted">{{ board[column.id].length }}</span>
        </h2>
        <p v-if="!board[column.id].length" class="card px-4 py-8 text-center text-sm text-ink-muted">{{ column.empty }}</p>
        <article
          v-for="card in board[column.id]"
          :key="keyOf(card)"
          :aria-label="titleOf(card)"
          class="card space-y-3 p-4"
        >
          <div class="min-w-0">
            <h3 class="break-words text-sm font-semibold text-ink">{{ titleOf(card) }}</h3>
            <p class="break-words text-xs text-ink-muted">{{ detailOf(card) }}</p>
            <p v-if="card.kind === 'commission' && card.commission.notes" class="mt-1 whitespace-pre-line break-words text-xs text-ink-muted">{{ card.commission.notes }}</p>
          </div>

          <div v-if="column.id === 'toPrint' && card.kind === 'stock'" class="flex flex-wrap items-center justify-between gap-2">
            <QuantityStepper
              :quantity="quantityFor(card)"
              :name="card.article.name"
              @increment="setQuantity(card, quantityFor(card) + 1)"
              @decrement="setQuantity(card, quantityFor(card) - 1)"
            />
            <BaseButton icon="printer" :loading="busy === keyOf(card)" :disabled="!!busy" @click="start(card)">Print {{ quantityFor(card) }}</BaseButton>
          </div>
          <BaseButton
            v-else-if="column.id === 'toPrint'"
            block
            :loading="busy === keyOf(card)"
            :disabled="!!busy"
            @click="moveCommission(card.commission, 'printing')"
          >
            Start
          </BaseButton>
          <div v-else-if="column.id === 'printing'" class="grid grid-cols-2 gap-2">
            <BaseButton icon="check" :loading="busy === keyOf(card)" :disabled="!!busy" @click="done(card)">Done</BaseButton>
            <BaseButton variant="secondary" :disabled="!!busy" @click="back(card)">Back</BaseButton>
          </div>
          <p v-else class="text-sm font-medium" :class="card.kind === 'job' ? 'text-income' : 'text-accent'">
            {{ card.kind === 'job' ? `+${card.job.quantity} to stock` : 'Commission ready' }}
          </p>
        </article>
      </section>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, onMounted } from 'vue'
import { usePrintJobs, staleError } from '~/composables/usePrintJobs'
import { useCommissions } from '~/composables/useCommissions'
import { buildBoard, targetFor } from '~/utils/printBoard'
import { transitionPatch } from '~/utils/commissions'

definePageMeta({ middleware: 'owner' })

const COLUMNS = [
  { id: 'toPrint', label: 'To print', empty: 'Nothing to print' },
  { id: 'printing', label: 'Printing', empty: 'Nothing printing' },
  { id: 'doneToday', label: 'Done today', empty: 'Nothing done today yet' }
]
const OFFLINE = "You're offline — the print board needs a connection"

const { loadBoardData, startJob, finishJob, cancelJob } = usePrintJobs()
const { getCommission, updateCommission } = useCommissions()

const data = ref({ articles: [], jobs: [], commissions: [] })
const now = ref(new Date())
const jobsMissing = ref(false)
const loading = ref(true)
const loadError = ref('')
const error = ref('')
const busy = ref('')
const activeColumn = ref('toPrint')
const quantities = ref({})
let loaded = false

const board = computed(() => buildBoard({ ...data.value, now: now.value }))

const isOffline = err => (typeof navigator !== 'undefined' && !navigator.onLine) || err?.status === 0
// Refusals carry their own message; anything else is offline or a generic failure
const messageFor = (err) => {
  if (err?.code === 'stale' || err?.code === 'already_printing') return err.message
  return isOffline(err) ? OFFLINE : 'Could not update the print board. Try again.'
}

const keyOf = (card) => {
  if (card.kind === 'commission') return `commission:${card.commission.id}`
  return card.kind === 'job' ? `job:${card.job.id}` : `stock:${card.article.id}`
}
const customerOf = commission => (commission.anonymised_at ? 'Anonymised' : commission.customer_name)
const titleOf = card => (card.kind === 'commission' ? `Commission · ${customerOf(card.commission)}` : (card.article?.name ?? 'Unknown article'))
const detailOf = (card) => {
  if (card.kind === 'stock') return `${Number(card.article.stock)} left · target ${targetFor(card.article)}`
  if (card.kind === 'job') return `Stock print × ${card.job.quantity}`
  return `${card.commission.expand?.article?.name ?? 'Unknown article'} × ${card.commission.quantity}`
}

const quantityFor = card => quantities.value[card.article.id] ?? card.quantity
// A print job always prints at least one
const setQuantity = (card, value) => {
  quantities.value = { ...quantities.value, [card.article.id]: Math.max(1, value) }
}

const load = async () => {
  if (!loaded) loading.value = true
  try {
    const result = await loadBoardData()
    data.value = result
    jobsMissing.value = result.jobsMissing
    now.value = new Date()
    loadError.value = ''
    loaded = true
  } catch (err) {
    // A failed refresh keeps the last board; only a failed first load replaces it
    if (loaded) error.value = messageFor(err)
    else loadError.value = isOffline(err) ? OFFLINE : 'Could not load the print board. Check your connection and try again.'
  } finally {
    loading.value = false
  }
}

onMounted(load)

// Every action re-lists the board; a refusal re-lists too, so the screen shows what changed elsewhere
const run = async (key, action) => {
  if (busy.value) return
  busy.value = key
  error.value = ''
  try {
    await action()
    await load()
  } catch (err) {
    error.value = messageFor(err)
    if (err?.code === 'stale' || err?.code === 'already_printing') await load()
  } finally {
    busy.value = ''
  }
}

const start = card => run(keyOf(card), async () => {
  await startJob(card.article, quantityFor(card))
  quantities.value = Object.fromEntries(Object.entries(quantities.value).filter(([id]) => id !== card.article.id))
})

// Another device may have moved the commission: act only on the status this board shows
const moveCommission = (commission, target) => run(`commission:${commission.id}`, async () => {
  const current = await getCommission(commission.id)
  if (current.status !== commission.status) throw staleError()
  await updateCommission(commission.id, transitionPatch(current, target))
})

const done = card => (card.kind === 'job'
  ? run(keyOf(card), () => finishJob(card.job))
  : moveCommission(card.commission, 'ready'))

const back = card => (card.kind === 'job'
  ? run(keyOf(card), () => cancelJob(card.job))
  : moveCommission(card.commission, 'open'))
</script>
```

- [ ] **Step 6: Run the tests to verify they pass**

Run: `npx playwright test tests/e2e/print-board.spec.js`
Expected: all pass on both projects.

Run: `npm run test:unit && npx playwright test`
Expected: `fail 0` and `0 failed`. The commissions, articles and inventory suites still pass with the new fake filter.

- [ ] **Step 7: Commit**

```bash
git add tests/e2e/fake-pocketbase.js tests/e2e/fixtures.js composables/usePrintJobs.js pages/print-board.vue tests/e2e/print-board.spec.js
git commit -m "Add the print board with stock print jobs and commission cards"
```

---

### Task 4: Target stock and entry points

**Files:**
- Modify: `components/ArticleSheet.vue`, `pages/catalog.vue`, `pages/index.vue`
- Modify: `tests/e2e/articles.spec.js` (append), `tests/e2e/print-board.spec.js` (append), `tests/e2e/mobile.spec.js`

**Interfaces:**
- Consumes:
  - from Task 1: `buildBoard`;
  - from Task 3: `usePrintJobs().loadBoardData`, and the `seedBoard`, `job`, `commission` and `BOARD_ARTICLES` helpers inside `print-board.spec.js` (same file, so no cross-spec import).
- Produces:
  - the article editor's optional `Target stock` field, saved as `target_stock` (0 when empty);
  - the owner-only Catalog header button `Print board`;
  - the Dashboard link `N to print`.

- [ ] **Step 1: Write the failing tests**

Append to `tests/e2e/articles.spec.js`:

```js
test.describe('target stock', () => {
  test.beforeEach(async ({ page, api }) => {
    api.seed({ articles: [{ id: 'k1', name: 'Pikachu Keychain', category: 'cat-keychain', price: 0, stock: 5, low_stock_threshold: 5 }] })
    await gotoReady(page, '/catalog')
    await page.getByRole('button', { name: 'Manage' }).click()
    await page.locator('h3', { hasText: 'Pikachu Keychain' }).click()
  })

  test('the target stock is saved and drives the print board suggestion', async ({ page, api }) => {
    await expect(sheet(page).getByText('Empty = 2× low-stock threshold')).toBeVisible()
    await sheet(page).getByLabel('Target stock').fill('12')
    await sheet(page).getByRole('button', { name: 'Save changes' }).click()
    await expect(sheet(page)).toHaveCount(0)
    expect(api.db.budget_tracket_catalog[0].target_stock).toBe(12)

    await gotoReady(page, '/print-board')
    const card = page.getByRole('region', { name: 'To print' }).getByRole('article', { name: 'Pikachu Keychain' })
    await expect(card).toContainText('5 left · target 12')
    await expect(card.getByRole('button', { name: 'Print 7' })).toBeVisible()
  })

  test('an empty target stock saves 0 and a negative one is refused', async ({ page, api }) => {
    await sheet(page).getByLabel('Target stock').fill('-1')
    await sheet(page).getByRole('button', { name: 'Save changes' }).click()
    await expect(sheet(page).getByRole('alert')).toHaveText('Target stock must be a whole number of 0 or more')
    expect(api.db.budget_tracket_catalog[0].target_stock).toBe(0)

    await sheet(page).getByLabel('Target stock').fill('')
    await sheet(page).getByRole('button', { name: 'Save changes' }).click()
    await expect(sheet(page)).toHaveCount(0)
    expect(api.db.budget_tracket_catalog[0].target_stock).toBe(0)
  })
})
```

Append to `tests/e2e/print-board.spec.js`:

```js
test.describe('entry points', () => {
  test('the dashboard counts the To print cards and links to the board', async ({ page, api }) => {
    seedBoard(api, { commissions: [commission()] })
    await gotoReady(page, '/')
    await page.getByRole('link', { name: /2 to print/ }).click()
    await page.waitForURL(url => url.pathname === '/print-board')
  })

  test('one card reads "1 to print"', async ({ page, api }) => {
    seedBoard(api, { printJobs: [job()], commissions: [commission()] })
    await gotoReady(page, '/')
    await expect(page.getByRole('link', { name: /1 to print/ })).toBeVisible()
  })

  test('the dashboard hides the link when nothing is to print', async ({ page, api }) => {
    seedBoard(api, { articles: [BOARD_ARTICLES[1]] })
    await gotoReady(page, '/')
    await expect(page.getByRole('link', { name: /to print/ })).toHaveCount(0)
  })

  test('the catalog header opens the print board', async ({ page, api }) => {
    seedBoard(api)
    await gotoReady(page, '/catalog')
    await page.getByRole('button', { name: 'Print board' }).click()
    await page.waitForURL(url => url.pathname === '/print-board')
  })
})

test.describe('visitors see no print board button', () => {
  test.use({ owner: false })

  test('the catalog header has no Print board button', async ({ page, api }) => {
    seedBoard(api)
    await gotoReady(page, '/catalog')
    await expect(page.getByRole('heading', { name: 'Product Catalog' })).toBeVisible()
    await expect(page.getByRole('button', { name: 'Print board' })).toHaveCount(0)
  })
})
```

In `tests/e2e/mobile.spec.js`:

1. Add `'/print-board'` to `PAGES` after `'/commissions'`.
2. After the `seed` helper, add:

```js
// Controls inside a <label> (switches) use the whole label row as their target
const smallTargets = page => page.evaluate(() =>
  [...document.querySelectorAll('a[href], button, input, select, textarea')]
    .filter(el => !el.closest('label'))
    .map(el => ({ el, box: el.getBoundingClientRect() }))
    .filter(({ box }) => box.width > 0 && box.height > 0)
    .filter(({ box }) => box.width < 44 || box.height < 44)
    .map(({ el, box }) => `${el.tagName.toLowerCase()} "${(el.getAttribute('aria-label') || el.textContent || '').trim().slice(0, 30)}" ${Math.round(box.width)}×${Math.round(box.height)}`)
)
```

3. In the `tap targets are at least 44px` test, replace the inline `const small = await page.evaluate(…)` statement (and its comment) with `const small = await smallTargets(page)`.
4. Inside `test.describe('phone layout sweep', …)`, after 'the article editor fits at 375px', add:

```js
  test('the print board fits at 375px with long cards', async ({ page, api }) => {
    api.seed({
      articles: [{ ...longProducts[0], stock: 1, low_stock_threshold: 5 }],
      commissions: [{
        id: 'c1',
        customer_name: 'Supercalifragilisticexpialidocious-customer-name',
        customer_email: 'a@example.com',
        fulfilment: 'pickup',
        address: '',
        article: 'p1',
        quantity: 12,
        agreed_price: 30,
        notes: 'Unbroken-colour-notes-'.repeat(8),
        status: 'open',
        created: '2026-10-01 10:00:00.000Z',
        delivered_at: '',
        cancelled_at: '',
        anonymised_at: '',
        ready_at: ''
      }]
    })
    await gotoReady(page, '/print-board')
    await expect(page.getByRole('button', { name: 'Print 9' })).toBeVisible()
    const scrollWidth = await page.evaluate(() => document.documentElement.scrollWidth)
    expect(scrollWidth).toBeLessThanOrEqual(page.viewportSize().width)
    expect(await smallTargets(page)).toEqual([])
  })
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx playwright test tests/e2e/print-board.spec.js tests/e2e/articles.spec.js tests/e2e/mobile.spec.js`
Expected: FAIL. There is no `Target stock` field, no `Print board` header button and no `to print` Dashboard link. The visitors test and the long-cards test pass already: the board itself exists since Task 3.

- [ ] **Step 3: Target stock in the article editor**

In `components/ArticleSheet.vue`:

1. Directly after the closing `</div>` of the `grid grid-cols-2 gap-3` block (Price override / Low stock at), add:

```vue
      <div>
        <label for="article-target" class="label">Target stock</label>
        <input id="article-target" v-model="form.targetStock" type="text" inputmode="numeric" class="input">
        <p class="hint">Empty = 2× low-stock threshold</p>
      </div>
```

2. Replace `emptyForm` with:

```js
const emptyForm = () => ({ name: '', category: '', price: '', lowStockThreshold: '2', targetStock: '', startingStock: '', description: '' })
```

3. In the `watch(() => props.open, …)` article branch, after `lowStockThreshold: String(article.low_stock_threshold ?? 2),`, add:

```js
        targetStock: Number(article.target_stock) > 0 ? String(article.target_stock) : '',
```

4. In `validate`, directly after the `Low stock must be …` line, add:

```js
  if (!isBlank(form.value.targetStock) && !isCount(form.value.targetStock)) return 'Target stock must be a whole number of 0 or more'
```

5. In `save`, after `low_stock_threshold: parseNumber(form.value.lowStockThreshold),`, add:

```js
    // 0 means "use 2× the threshold"
    target_stock: isBlank(form.value.targetStock) ? 0 : parseNumber(form.value.targetStock),
```

- [ ] **Step 4: Catalog header button**

In `pages/catalog.vue`, replace the Commissions `BaseButton` in the `PageHeader` `#actions` template with these two buttons. Three labelled buttons overflow a 375px header, so below `sm` both show only their icon and keep their name for screen readers and tests:

```vue
            <BaseButton variant="secondary" icon="clipboard" @click="navigateTo('/commissions')">
              <span class="sr-only sm:not-sr-only">Commissions</span>
            </BaseButton>
            <BaseButton variant="secondary" icon="printer" @click="navigateTo('/print-board')">
              <span class="sr-only sm:not-sr-only">Print board</span>
            </BaseButton>
```

- [ ] **Step 5: Dashboard link**

In `pages/index.vue`:

1. Directly after the closing `</NuxtLink>` of the open-commissions link, add:

```vue
        <NuxtLink
          v-if="toPrintCount > 0"
          to="/print-board"
          class="card flex min-h-[56px] items-center justify-between gap-3 px-4 text-sm font-medium text-ink hover:bg-muted md:px-5"
        >
          <span class="flex items-center gap-3">
            <AppIcon name="printer" class="h-5 w-5 text-ink-muted" />
            {{ toPrintCount }} to print
          </span>
          <AppIcon name="chevron-right" class="h-4 w-4 text-ink-muted" />
        </NuxtLink>
```

2. In the script, add `import { usePrintJobs } from '~/composables/usePrintJobs'` after the `useCommissions` import, and `import { buildBoard } from '~/utils/printBoard'` after the `formatDate` import. Then, directly after the existing commissions `onMounted(…)` block, add:

```js
const { loadBoardData } = usePrintJobs()
const toPrintCount = ref(0)

onMounted(async () => {
  try {
    toPrintCount.value = buildBoard({ ...(await loadBoardData()), now: new Date() }).toPrint.length
  } catch {
    // Offline or a failed load: the link quietly stays hidden
  }
})
```

- [ ] **Step 6: Run the tests to verify they pass**

Run: `npx playwright test tests/e2e/print-board.spec.js tests/e2e/articles.spec.js tests/e2e/mobile.spec.js tests/e2e/commissions.spec.js tests/e2e/catalog.spec.js tests/e2e/dashboard.spec.js`
Expected: all pass on both projects. The 375px sweep covers `/print-board`, the long cards, and the icon-only catalog header buttons.

Run: `npm run test:unit && npx playwright test`
Expected: `fail 0` and `0 failed`.

- [ ] **Step 7: Commit**

```bash
git add components/ArticleSheet.vue pages/catalog.vue pages/index.vue tests/e2e/articles.spec.js tests/e2e/print-board.spec.js tests/e2e/mobile.spec.js
git commit -m "Add target stock to the article editor and print board entry points"
```
