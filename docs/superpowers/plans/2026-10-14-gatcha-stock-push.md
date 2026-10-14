# Gatcha Prizes, One Stock Field and Reminder Delivery Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** After a checkout with a gatcha, the owner records each prize in a few taps (also offline), so the prizes' stock stays right; stock editing becomes one "Stock now" field; the reminder job stops using up reminders when no device can get them and says in the log and in Settings what it did; and Settings no longer shows "on" for a device the server does not know.

**Architecture:**
- **Pure rules** live in plain ES modules and are unit-tested with `node:test`:
  - `utils/gatcha.js` (new): what a gatcha is, the prizes a cart owes, open prizes adding up, the prize list, the prize and undo movements, the Undo rule, and the device storage of open prizes and of the prize outbox;
  - `utils/inventory.js`: `stockNowMovement` for the one stock field;
  - `utils/printBoard.js`: `lowStockArticles` leaves gatchas out (print board and the reminder stock check share it);
  - `utils/reports/sales.js`: a prize movement is never a Top-article sale of its own;
  - `scripts/lib/pb-plan.mjs`: the `prize_categories` field;
  - `server/utils/reminderJob.js`: the job's delivery outcomes (`sent`, `failed`, `waiting`), the run's log line and the status line's delivery problem;
  - `utils/pushHosts.js` and `utils/push.js`: the push host and its company name, and the status line.
- **App:**
  - `composables/useGatchaPrizes.js` (new) holds one app-wide state: the open prizes, this round's picks and the outbox of prize movements. It sends the outbox in order through `useInventory().applyMovements`, on every pick or undo, when the catalog mounts and when the connection returns;
  - `components/GatchaPrizeSheet.vue` (new) is the picker (`BottomSheet`);
  - `pages/catalog.vue` leaves the gatcha out of the checkout's stock movements, opens the picker after the checkout and shows the open-prizes banner;
  - `components/ArticleSheet.vue` gets the **Prize categories** checkboxes; `components/InventoryPanel.vue` gets **Stock now**;
  - `useTransactions().forgetLocalData` (logout and *Clear All Local Data*) also forgets the open prizes.
- **Settings:** a device the browser has "on" is checked against its `push_subscriptions` record on load, and a lost record is re-created (Task 6, an owner-observed bug).
- **Server:** the job keeps a due reminder unsent while no device can get it, writes one `[reminders] …` line per run with push hosts and status codes only, and keeps the last delivery problem for `/api/push/status`, which also reports how many devices are registered.
- **Tests:** e2e runs against the in-memory fake PocketBase; the server job runs with a fake store and a fake sender.

**Tech Stack:** Nuxt 3.21 / Vue 3.5 `<script setup>`, Nitro (h3), Tailwind 3.4 semantic tokens, PocketBase 0.22 with `pocketbase@0.21.5`, `web-push@3.6.7`, `node:test`, Playwright against the fake PocketBase.

**Spec:** `docs/superpowers/specs/2026-10-14-gatcha-stock-push-design.md`

## Global Constraints

- **Gatcha:** an article with at least one entry in `prize_categories` is a gatcha. Its price, deal and sale line work as for any article. **The checkout never lowers the gatcha's own stock: its sale line has no stock movement.**
- **Prizes:**
  - one prize per gatcha unit, summed over the gatcha articles of the checkout; the list is the union of their prize categories;
  - a pick is a `sale` movement of `-1` with the note `Gatcha prize`;
  - an undo after the pick synced is a `correction` of `+1` with the note `Gatcha prize undone`;
  - movement ids are made on the device (`newRecordId()`), so a resend is idempotent.
- **Open prizes** are kept on the device in local storage as a count plus the prize categories, until picked. Logout clears them, like the other local data.
- **Stock field:** one field **Stock now** (whole number ≥ 0) and **Save**. Higher than the current stock → a `printed` movement for the difference; lower → a `correction` to the new count; equal → nothing recorded and `Stock unchanged`; invalid → `Enter how many are in stock now`. No note field. The starting stock of a new article and the movement history list stay as they are.
- **Strings** (verbatim from the spec): `Prize categories`, `Gatcha prizes · k of N`, `Picked`, `Undo`, `Waiting to sync`, `All prizes picked`, `Later`, `N gatcha prizes to pick`, `Pick now`, `Gatcha prize`, `Gatcha prize undone`, `Stock now`, `Save`, `Stock unchanged`, `Enter how many are in stock now`, `No device has notifications on`, `Reminders last checked <time>`, `Apple answered 410 for a device; it was removed`.
- **Reports and deals stay as they are.** Older sales without line data keep 0 € revenue per article.
- **Reminders:**
  - with no registered device a due reminder is **not** marked sent; it waits until a device is registered or it is more than 24 h late (then missed, as before);
  - if every device turns out gone (404/410) during a run, the reminder also waits;
  - every run that sends, removes or fails anything writes one line: `[reminders] sent N, removed M (410 web.push.apple.com), failed K (403 …)`;
  - **server logs never include a push endpoint's path, keys, tokens or secrets**: only the push host and the status code.
- **Data model (PocketBase 0.22):** `budget_tracket_catalog.prize_categories`, a relation to `categories`, multiple (`maxSelect: null`), optional, `cascadeDelete: false`. Added only when missing, in the existing article `addFields` op, which `scripts/pb-migrate.mjs` applies with `MIGRATION_GAP_MS = 1500`. **Rules are unchanged.**
- **Stock changes** are only ever `stock_movements` written through `useInventory().applyMovements`; never patch an article's `stock` directly. Schema changes go only through `scripts/pb-migrate.mjs`.
- **Conventions:**
  - Vue 3 `<script setup>`; 2-space indent, single quotes, no semicolons; imports ordered Vue, components, composables, utilities.
  - Semantic colour tokens only (`surface`, `card`, `muted`, `line`, `ink`, `ink-muted`, `accent`, `income`, `expense`, `warning`); no raw gray/blue classes, no `dark:` classes, no `darkMode` ternaries. `tests/unit/no-raw-colours.test.js` enforces this.
  - 44px tap targets; 375px without horizontal scroll, light and dark; `formatCurrency()` for money.
- **Never:**
  - contact pocket.lasseharm.space;
  - run `pb:migrate` in any form, with or without flags (`node --check` and the offline `planSchema` print below are fine);
  - read `.env`;
  - stop the `nuxt dev` server on :3000 (if new Tailwind classes do not apply, `touch tailwind.config.js`).
- **Git:** only `git add <files you changed>` and `git commit`. NEVER `git stash`, `reset`, `checkout`, `restore`, `clean`, `rebase` or `merge`.
- **Baselines before Task 1:** `npm run test:unit` 299 pass; `npx playwright test` 585 passed, 77 skipped, 0 failed.

## Review Focus

1. **An undo for a pick whose request may already have reached the server** (the reply was lost, or the stock recompute after the create failed). Dropping it from the outbox would leave the server's `-1` without its `+1`. Expected: the stock ends where it started. *Pinned in Task 2: "undo takes a waiting pick out of the outbox, and balances a sent or sending one". Pinned in Task 4: "a pick whose reply was lost is sent again once, and an undo meanwhile still balances it".*
2. **A prize movement that reaches the server before its gatcha sale** (the sale is still queued, or it is the first sale with lines). The line-data cut-off alone would count the prize as an older article sale in Top articles. Expected: never counted there; it still counts for "runs out". *Pinned in Task 2: "in Reports the gatcha sale is its own line and a prize is no article sale, even before any line data".*
3. **The gatcha's own stock never moves**, so with a low-stock threshold it would sit on the print board and in the reminder stock check for ever, and the cart would warn "only 0 in stock". Expected: neither. *Pinned in Task 2: "a gatcha is never on the print board or in the stock check". Pinned in Task 3: "the cart does not warn about the gatcha's own stock".*
4. **A blocked, full or garbled local storage** (private mode, an old or hand-edited value). Expected: the catalog, the checkout and the picker keep working; garbage reads as no open prizes and an empty outbox. *Pinned in Task 2: "open prizes and the outbox survive a reload, and garbage reads as nothing".*
5. **A push service's error message that quotes the device's address** (web-push and socket errors do). Logging `error.message` would leak the endpoint path. Expected: only the host and the status code reach the log and the status line. *Pinned in Task 5: "every run that sends, removes or fails writes one line with the push host and status only" and "device problems name the push service and its answer, never the address".*

## Decisions the spec leaves open

1. **The gatcha card and the print board.** A gatcha's card shows a `Gatcha` badge instead of its stock badge. The cart never warns about a gatcha's own stock. Gatchas never appear on the print board or in the reminder stock check. **Flag:** Reports → Stock value still counts the gatcha's own stock (Reports stay as they are). The owner can set it to 0 once with **Stock now**.
2. **The prize list.**
   - It shows active articles with stock > 0 from the open prize categories, never a gatcha, even when the gatcha's own category is ticked.
   - Groups follow the categories' own order (`sort_order`, like the catalog chips); articles are sorted by name; each row reads `<name>` and `<stock> left`.
   - The stock shown is the catalog's: the checkout and every pick or undo change it at once.
   - Copy the spec does not give: `Search prizes...`, `No prize articles in stock`, `No prizes match your search`, and `1 gatcha prize to pick` for one prize.
3. **k of N.**
   - N is this round's picks plus the open prizes, and k is the picks.
   - A round ends when every prize is picked and the sheet closes; `All prizes picked` shows for 1.2 s.
   - **Later** keeps the picks, so Undo still works after **Pick now**.
   - **Flag:** the Picked list is kept in memory only. After a reload, the sheet shows `0 of <open>`.
4. **Undo.**
   - A pick that never left the device is dropped from the outbox.
   - A pick that was sent, is being sent or was **tried** gets the `+1` correction queued behind it, and the pick is sent again first, idempotently.
   - **Flag:** the spec says "before the pick has synced, Undo removes it". A tried but unconfirmed pick is treated as possibly synced. The stock ends right either way, and in the sheet both cases look the same.
   - **Flag:** an undone pick that had synced still counts as one sold unit in "Runs out" and "Printed vs sold" (`-1` sale, then a `+1` correction).
5. **The outbox.**
   - Prize movements wait in their own outbox (`akinai-gatcha-outbox`), not in the sales queue.
   - It is sent in order, one movement at a time, and stops at the first failure, so an undo never overtakes its pick.
   - It is sent on every pick or undo, when the catalog mounts and on the `online` event (registered once).
   - **Flag:** waiting picks do not count in the Dashboard's "pending" sales.
6. **Logout** clears the open prizes and the picks. Prize movements still waiting stay queued, like unsynced sales, and go out after the next login. *Clear All Local Data* drops them too.
7. **Reports** skip prize movements explicitly in Top articles (`note === 'Gatcha prize'`), not only through the line-data cut-off (Review Focus 2). Revenue, runs out and printed vs sold are unchanged.
8. **Stock now.**
   - The field starts at the current stock, and **Save** is the primary button.
   - `Stock unchanged` is a `role="status"` note.
   - Numbers past `Number.MAX_SAFE_INTEGER`, signs, decimals and exponents are invalid.
   - The ArticleSheet toast for a failed starting stock now says "Set it with Stock now."
9. **Prize categories** use the checkbox list of the deal editor, with a hint. A category deleted since it was ticked is dropped on save. PocketBase 0.22 ignores the field on a server that is not migrated yet, so **`--apply` must run before the deploy** (README, Task 6).
10. **The run's log line.**
    - It goes to `log.info`, so pm2's out log.
    - The parts are `sent N, removed M (…), failed K (…)`. K counts failed deliveries, and the same `status host` is listed once.
    - **Flag:** it adds `, waiting W (no device)` and `, missed X` when those are non-zero, and writes the line then too. With no device at all, that is one line every 5 minutes for up to 24 hours per waiting reminder.
    - A device's status is its push service's HTTP code, `no answer` (a timeout or a dropped connection) or `blocked` (an address that is not a push service, removed without being contacted).
    - PocketBase failures still get their own `[reminders] Could not save reminder state: …` error line.
11. **The status line.**
    - `/api/push/status` adds `devices` (counted with the notifier on every Settings load; `null` when PocketBase cannot say) and `lastProblem`.
    - `No device has notifications on` comes before `Last check failed: …`.
    - The problem follows the time after ` · `, for example `Reminders last checked Wed 14 Oct, 13:05 · Apple answered 410 for a device; it was removed`.
    - Other problems read `Google answered 403 for a device`, `Google did not answer for a device` and `A device without a supported push service was removed`.
    - A run that delivers without a problem clears it. Like `lastRun`, it lives in the server's memory, so a restart clears it.
    - Device failures no longer go into `lastError` (`Could not reach a device: …` is gone).
    - Settings reloads the status after *Turn on* and *Turn off*.
12. **The test route** (`/api/push/test`) logs `[push] test: removed a device (410 web.push.apple.com)` or `[push] test: failed (403 fcm.googleapis.com)`, host and status only.
13. **A device that only the browser has on** (owner-observed bug, decided by the controller, Task 6).
    - When Settings → Notifications loads online, with the owner's session and a configured server, a device whose browser has a subscription with the current key and granted permission must also have a `push_subscriptions` record for its endpoint. The check is an owner list with `pb.filter('endpoint = {:endpoint}')`.
    - A missing record is re-created silently: the same create as *Turn on*, where a duplicate endpoint counts as stored. The state shows "on", and the status is loaded again so `devices` is right.
    - If the create fails, the state is "off" with the *Turn on* button, and the message `This device isn't registered on the server. Turn notifications on again.` shows.
    - Offline, the browser's own state stays and nothing is asked.
    - An endpoint outside the allowed push services is never registered. It shows "off" with the same message, and *Turn on* then explains that the service isn't supported.
14. **The owner's phone is Android Chrome** (push host `fcm.googleapis.com`). Tests and copy do not assume iOS. The Apple strings appear only as the spec's example of a removed device.

## Working setup

- **Dev server and e2e:**
  - A `nuxt dev` server serves this checkout on :3000, and Playwright reuses it (`reuseExistingServer`). Never stop it. Nitro picks up server changes without a restart.
  - The first run after edits may hit cold-compile timeouts. `mobile.spec.js` "the commission form fits at 375px with long lines" is a known flake under load. Re-run a failing test once on its own before investigating.
  - The full suite (`npx playwright test`) takes about three minutes.
- **Unit tests:** `npm run test:unit` (299 pass before Task 1). For the time-zone runs:

  ```bash
  for tz in "" Pacific/Auckland Europe/Berlin; do TZ=$tz node --test tests/unit/*.test.js 2>&1 | grep -E 'ℹ (tests|pass|fail) [0-9]+$'; done
  ```

  All three must show `fail 0`. CI and the server run Node 20 (local is newer). Its runner prints TAP lines:

  ```bash
  npx -y node@20 --test tests/unit/*.test.js 2>&1 | grep -E '^# (tests|pass|fail)'
  ```

- **e2e:**
  - `npx playwright test <files>` runs the `chromium` project (1280px) and `mobile` (Pixel 7). `mobile.spec.js` skips itself on `chromium`.
  - The fake PocketBase (`tests/e2e/fake-pocketbase.js`) holds exactly the posted body fields; records the app creates get `DEFAULTS`.
  - `api.fail(collection, status)` fails every write to a collection until it is reset with `api.fail(collection, 0)`. `api.failOnce` fails one write, and `failReads` fails reads.
  - A `page.route` on the PocketBase host must end in `route.fallback()`: fulfilling it directly trips the fixture's escaped-requests check.
  - `context.setOffline(true/false)` fires the window `offline`/`online` events the app syncs on.
- **Modules:** `utils/` and `server/utils/` are plain ES modules with relative `.js` imports, so `node --test` loads them. Vue files import them as `~/utils/...`. Components under `components/` (top level) are auto-imported.
- **Snapshot:** `pocketbase/schema.json` is the live snapshot. It is never edited by hand, and the migration tests hold before and after the owner's `--apply` refreshes it.

## File map

| File | Responsibility | Task |
|---|---|---|
| `utils/inventory.js`, `tests/unit/inventory.test.js` | `stockNowMovement` | 1 |
| `components/InventoryPanel.vue`, `components/ArticleSheet.vue` (toast) | the Stock now field | 1 |
| `tests/e2e/articles.spec.js`, `tests/e2e/inventory.spec.js`, `tests/e2e/print-board.spec.js` | e2e for Stock now | 1 |
| `utils/gatcha.js`, `tests/unit/gatcha.test.js` | gatcha rules, device storage | 2 |
| `utils/printBoard.js`, `utils/reports/sales.js` | gatchas off the print board, prizes off Top articles | 2 |
| `scripts/lib/pb-plan.mjs`, `scripts/pb-migrate.mjs` (header), `tests/unit/pb-plan.test.js` | `prize_categories` | 2 |
| `components/ArticleSheet.vue`, `components/CartPanel.vue`, `pages/catalog.vue` (card badge, checkout) | the gatcha article and its checkout | 3 |
| `tests/e2e/fake-pocketbase.js`, `tests/e2e/fixtures.js` (seed default), `tests/e2e/gatcha-data.js`, `tests/e2e/gatcha.spec.js` | e2e for the gatcha article | 3 |
| `composables/useGatchaPrizes.js`, `components/GatchaPrizeSheet.vue`, `pages/catalog.vue` (picker, banner), `composables/useTransactions.js` (logout) | picking prizes, open prizes, offline | 4 |
| `tests/e2e/gatcha.spec.js`, `tests/e2e/mobile.spec.js` | e2e for the picker, 375px | 4 |
| `utils/pushHosts.js`, `server/utils/reminderJob.js`, `server/api/push/status.get.js`, `server/api/push/test.post.js` | delivery outcomes, log line, delivery problem, device count | 5 |
| `utils/push.js`, `components/NotificationSettings.vue` | the status line | 5 |
| `tests/unit/reminder-job.test.js`, `tests/unit/push.test.js`, `tests/e2e/fixtures.js` (notifier), `tests/e2e/notifications.spec.js` | their tests | 5 |
| `composables/usePushNotifications.js`, `components/NotificationSettings.vue`, `tests/e2e/notifications.spec.js` | register a device again when the server lost it | 6 |
| `README.md` | features and the rollout | 6 |

---

### Task 1: One "Stock now" field

**Files:**
- Modify: `utils/inventory.js` (new `STOCK_NOW_ERROR`, `stockNowMovement`)
- Modify: `components/InventoryPanel.vue` (whole file)
- Modify: `components/ArticleSheet.vue:205` (toast text)
- Test: `tests/unit/inventory.test.js`, `tests/e2e/articles.spec.js`, `tests/e2e/inventory.spec.js`, `tests/e2e/print-board.spec.js`

**Interfaces:**
- Consumes: `printedMovement(count)`, `correctionMovement(stock, target, note)`, `newRecordId()` from `utils/inventory.js`; `useInventory().applyMovements(movements) → { [articleId]: stock }`.
- Produces:
  - `STOCK_NOW_ERROR = 'Enter how many are in stock now'`;
  - `stockNowMovement(stock, value) → { change, reason: 'printed' | 'correction', note: '' } | null`, which throws `Error(STOCK_NOW_ERROR)` for anything that is not a whole number of 0 or more;
  - the panel's field is labelled `Stock now` (`#inventory-now`) with a `Save` submit button. Later tasks and specs find it by that label.

- [ ] **Step 1: Write the failing unit tests**

In `tests/unit/inventory.test.js`, replace

```js
  correctionMovement,
  stockFromMovements,
```

with

```js
  correctionMovement,
  stockNowMovement,
  stockFromMovements,
```

and append at the end of the file:

```js

test('Stock now records a higher count as printed and a lower one as a correction to it', () => {
  assert.deepEqual(stockNowMovement(5, '7'), { change: 2, reason: 'printed', note: '' })
  assert.deepEqual(stockNowMovement(5, '1'), { change: -4, reason: 'correction', note: '' })
  assert.deepEqual(stockNowMovement(5, '0'), { change: -5, reason: 'correction', note: '' })
  assert.deepEqual(stockNowMovement(0, ' 3 '), { change: 3, reason: 'printed', note: '' })
  assert.deepEqual(stockNowMovement(2, '007'), { change: 5, reason: 'printed', note: '' })
})

test('Stock now at the current count records nothing', () => {
  assert.equal(stockNowMovement(4, '4'), null)
  // A missing or negative stock counts as 0
  assert.equal(stockNowMovement(undefined, '0'), null)
  assert.equal(stockNowMovement(-2, '0'), null)
})

test('Stock now accepts only a whole number of 0 or more', () => {
  for (const value of ['', '   ', '-1', '2.5', '2,5', 'abc', '1e3', '+3', null, undefined, '99999999999999999999']) {
    assert.throws(() => stockNowMovement(4, value), /^Error: Enter how many are in stock now$/, String(value))
  }
})
```

- [ ] **Step 2: Run them to verify they fail**

Run: `npm run test:unit`
Expected: `tests 287`, `pass 286`, `fail 1`. The one failure is `inventory.test.js` as a whole: `SyntaxError: The requested module '../../utils/inventory.js' does not provide an export named 'stockNowMovement'`.

- [ ] **Step 3: Implement `stockNowMovement`**

In `utils/inventory.js`, directly above the line `// Replayed in date order (id breaks ties) and floored at every step: a printed batch after an oversell counts in full`, add:

```js
export const STOCK_NOW_ERROR = 'Enter how many are in stock now'
const WHOLE_NUMBER = /^\d+$/

// "Stock now" in the inventory panel: a higher count than the current stock is recorded as printed,
// a lower one as a correction to that count, the same count as nothing (null)
export const stockNowMovement = (stock, value) => {
  const text = String(value ?? '').trim()
  if (!WHOLE_NUMBER.test(text) || !Number.isSafeInteger(Number(text))) throw new Error(STOCK_NOW_ERROR)
  const target = Number(text)
  const current = Math.max(0, Number(stock) || 0)
  return target > current ? printedMovement(target - current) : correctionMovement(current, target)
}

```

`printedMovement` and `correctionMovement` stay: the print board's Done and the new article's starting stock use them.

- [ ] **Step 4: Run the unit tests**

Run: `npm run test:unit`
Expected: `tests 302`, `pass 302`, `fail 0`.

- [ ] **Step 5: Write the failing e2e tests**

In `tests/e2e/articles.spec.js`, replace the whole test `'adding printed items and correcting the count are logged'` (from its `test(` line to its closing `})`) with:

```js
  test('Stock now records a higher count as printed and a lower one as a correction', async ({ page, api }) => {
    await page.locator('h3', { hasText: 'Pikachu Keychain' }).click()
    const stockNow = sheet(page).getByLabel('Stock now')
    const save = sheet(page).getByRole('button', { name: 'Save', exact: true })
    await expect(stockNow).toHaveValue('5')
    await expect(save).toHaveClass(/btn-primary/)
    await stockNow.fill('7')
    await save.click()
    await expect(sheet(page).getByTestId('article-stock')).toHaveText('7')
    await expect(stockNow).toHaveValue('7')

    await stockNow.fill('1')
    await save.click()
    await expect(sheet(page).getByTestId('article-stock')).toHaveText('1')

    expect(loggedMovements(api).map(m => [m.reason, m.change, m.note])).toEqual([
      ['printed', 2, ''],
      ['correction', -6, '']
    ])
    expect(api.db.budget_tracket_catalog[0].stock).toBe(1)
    // One field: no Add printed, no Set, no note
    await expect(sheet(page).getByLabel('Add printed')).toHaveCount(0)
    await expect(sheet(page).getByLabel('Correction note')).toHaveCount(0)
    await expect(page.locator('article', { hasText: 'Pikachu Keychain' })).toContainText('1 left')
  })

  test('Stock now says when nothing changed and refuses what is not a count', async ({ page, api }) => {
    await page.locator('h3', { hasText: 'Pikachu Keychain' }).click()
    const stockNow = sheet(page).getByLabel('Stock now')
    const save = sheet(page).getByRole('button', { name: 'Save', exact: true })
    await save.click()
    await expect(sheet(page).getByRole('status')).toHaveText('Stock unchanged')

    for (const value of ['', '-1', '2.5', 'abc']) {
      await stockNow.fill(value)
      await save.click()
      await expect(sheet(page).getByRole('alert')).toHaveText('Enter how many are in stock now')
      await expect(sheet(page).getByRole('status')).toHaveCount(0)
    }
    expect(loggedMovements(api)).toEqual([])
    await expect(sheet(page).getByTestId('article-stock')).toHaveText('5')
  })

  test('the starting stock of a new article and the history list stay as they were', async ({ page, api }) => {
    api.db.stock_movements.push({ id: 'mv0000000000001', collectionName: 'stock_movements', article: 'k1', change: -1, reason: 'sale', note: 'Gatcha prize', created: '2026-10-14 10:00:00.000Z' })
    await page.locator('h3', { hasText: 'Pikachu Keychain' }).click()
    const history = sheet(page).getByRole('list')
    await expect(history.getByText('Sold')).toBeVisible()
    await expect(history.getByText(/Gatcha prize/)).toBeVisible()
    await sheet(page).getByRole('button', { name: 'Close' }).click()

    await page.getByRole('button', { name: 'New article' }).click()
    await expect(sheet(page).getByLabel('Starting stock')).toBeVisible()
    await expect(sheet(page).getByLabel('Stock now')).toHaveCount(0)
  })
```

In `tests/e2e/inventory.spec.js`, in the test `'printing after a double sale of the last item counts in full'`, replace

```js
  await sheet.getByLabel('Add printed').fill('3')
  await sheet.getByRole('button', { name: 'Add', exact: true }).click()
```

with

```js
  await sheet.getByLabel('Stock now').fill('3')
  await sheet.getByRole('button', { name: 'Save', exact: true }).click()
```

In `tests/e2e/print-board.spec.js`, replace each of the three `getByLabel('Add printed')` with `getByLabel('Stock now')` (the tests `'a job on the board hints at Done in the article inventory'`, `'no hint when the article only has a finished job'` and `'no hint when print_jobs is locked'`).

- [ ] **Step 6: Run them to verify they fail**

Run: `npx playwright test tests/e2e/articles.spec.js tests/e2e/inventory.spec.js tests/e2e/print-board.spec.js`
Expected: 12 failures, all waiting for a `Stock now` label that does not exist yet: `'Stock now records a higher count as printed and a lower one as a correction'`, `'Stock now says when nothing changed and refuses what is not a count'`, `'printing after a double sale of the last item counts in full'` and the three print-board hint tests, each on both projects. `'the starting stock of a new article and the history list stay as they were'` already passes.

- [ ] **Step 7: Replace the inventory panel**

Replace the whole of `components/InventoryPanel.vue` with:

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

    <p v-if="onBoard" class="rounded-lg bg-muted px-3 py-2 text-sm text-ink-muted" data-testid="print-board-hint">This article is on the print board — use Done there to add the batch</p>

    <form class="space-y-2" novalidate @submit.prevent="save">
      <div class="flex items-end gap-2">
        <div class="min-w-0 flex-1">
          <label for="inventory-now" class="label">Stock now</label>
          <input id="inventory-now" v-model="stockNow" type="text" inputmode="numeric" class="input" autocomplete="off">
        </div>
        <BaseButton type="submit" :loading="busy">Save</BaseButton>
      </div>
      <p v-if="notice" role="status" class="text-sm text-ink-muted">{{ notice }}</p>
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
import { usePrintJobs } from '~/composables/usePrintJobs'
import { stockNowMovement, newRecordId } from '~/utils/inventory'
import { formatDateTime } from '~/utils/date'

const props = defineProps({
  article: { type: Object, required: true }
})
const emit = defineEmits(['changed'])

const REASON_LABEL = { sale: 'Sold', printed: 'Printed', correction: 'Correction' }

const { applyMovements, listMovements } = useInventory()
const { findPrintingJob } = usePrintJobs()

const stock = ref(props.article.stock ?? 0)
const movements = ref([])
// Starts at the current stock, so the owner only changes the number
const stockNow = ref(String(stock.value))
const busy = ref(false)
const error = ref('')
const notice = ref('')
const onBoard = ref(false)

const loadMovements = async () => {
  movements.value = await listMovements(props.article.id)
}

onMounted(() => {
  // A printing job means Done on the board adds this batch; a locked or missing print_jobs just shows no hint
  findPrintingJob(props.article.id).then((job) => { onBoard.value = !!job }).catch(() => {})
  loadMovements().catch(() => { error.value = 'Could not load stock history' })
})

// Stock changes need the server: they are owner actions in the sheet, not part of offline selling.
// A higher count is recorded as printed, a lower one as a correction.
const save = async () => {
  error.value = ''
  notice.value = ''
  let movement
  try {
    movement = stockNowMovement(stock.value, stockNow.value)
  } catch (err) {
    error.value = err.message
    return
  }
  if (!movement) {
    notice.value = 'Stock unchanged'
    return
  }
  busy.value = true
  try {
    const stocks = await applyMovements([{ id: newRecordId(), article: props.article.id, ...movement }])
    stock.value = stocks[props.article.id]
    stockNow.value = String(stock.value)
    emit('changed', stock.value)
  } catch (err) {
    error.value = 'Could not save the stock change. Check your connection and try again.'
    return
  } finally {
    busy.value = false
  }
  loadMovements().catch(() => { error.value = 'Could not load stock history' })
}
</script>
```

In `components/ArticleSheet.vue`, replace

```js
          toast('Article created, but its starting stock could not be saved. Set it with Correct count.', { tone: 'warning', duration: 6000 })
```

with

```js
          toast('Article created, but its starting stock could not be saved. Set it with Stock now.', { tone: 'warning', duration: 6000 })
```

- [ ] **Step 8: Run the tests to verify they pass**

Run: `npx playwright test tests/e2e/articles.spec.js tests/e2e/inventory.spec.js tests/e2e/print-board.spec.js`
Expected: `104 passed`, no failed tests.

Run: `npm run test:unit`
Expected: `tests 302`, `pass 302`, `fail 0` (`no-raw-colours` included).

Run: `npx playwright test`
Expected: `589 passed`, `77 skipped`, no failed tests.

- [ ] **Step 9: Commit**

```bash
git add utils/inventory.js tests/unit/inventory.test.js components/InventoryPanel.vue components/ArticleSheet.vue tests/e2e/articles.spec.js tests/e2e/inventory.spec.js tests/e2e/print-board.spec.js
git commit -m "Replace Add printed, Set to and the note with one Stock now field"
```

---

### Task 2: Gatcha rules, the `prize_categories` field, the print board and Reports

**Files:**
- Create: `utils/gatcha.js`
- Modify: `utils/printBoard.js` (`lowStockArticles`), `utils/reports/sales.js` (`salesSummary`)
- Modify: `scripts/lib/pb-plan.mjs` (`planSchema`), `scripts/pb-migrate.mjs` (header comment)
- Test: `tests/unit/gatcha.test.js` (new), `tests/unit/pb-plan.test.js`

**Interfaces:**
- Consumes: nothing from Task 1.
- Produces (all from `utils/gatcha.js`):
  - `PRIZE_NOTE = 'Gatcha prize'`, `UNDO_NOTE = 'Gatcha prize undone'`, `OPEN_PRIZES_KEY = 'akinai-gatcha-open'`, `PRIZE_OUTBOX_KEY = 'akinai-gatcha-outbox'`, `NO_PRIZES = { count: 0, categories: [] }` (frozen);
  - `prizeCategoriesOf(article) → string[]`, `isGatcha(article) → boolean`;
  - `prizesFor(cart: [{ ...article, quantity }]) → { count, categories }`;
  - `addPrizes(open, more) → open`, `takePrize(open) → open`, `returnPrize(open) → open`;
  - `prizeChoices({ articles, categories, prizeCategories, query? }) → [{ category, articles: [...] }]`;
  - `prizeMovement(id, articleId)`, `undoMovement(id, articleId) → { id, article, change, reason, note }`;
  - `undoPick(outbox, pick: { id, article }, { sending, id }) → outbox`;
  - `readOpenPrizes(storage)`, `writeOpenPrizes(storage, open)`, `readOutbox(storage)`, `writeOutbox(storage, outbox)`, `forgetPrizes(storage, { keepOutbox = true })`. Every storage function swallows storage errors.
  - Outbox entries are prize movements, optionally with `tried: true` (Task 4 sets it before the first send).
- `lowStockArticles(articles)` leaves gatchas out. `salesSummary` never counts a `Gatcha prize` movement as an article sale.
- `planSchema` adds `prize_categories` to the article `addFields` op: `{ name: 'prize_categories', type: 'relation', required: false, presentable: false, options: { collectionId: '@categories', cascadeDelete: false, minSelect: null, maxSelect: null, displayFields: null } }`.

- [ ] **Step 1: Write the failing unit tests**

Create `tests/unit/gatcha.test.js`:

```js
import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  PRIZE_NOTE,
  UNDO_NOTE,
  OPEN_PRIZES_KEY,
  PRIZE_OUTBOX_KEY,
  NO_PRIZES,
  isGatcha,
  prizesFor,
  addPrizes,
  takePrize,
  returnPrize,
  prizeChoices,
  prizeMovement,
  undoMovement,
  undoPick,
  readOpenPrizes,
  writeOpenPrizes,
  readOutbox,
  writeOutbox,
  forgetPrizes
} from '../../utils/gatcha.js'
import { lowStockArticles } from '../../utils/printBoard.js'
import { salesSummary } from '../../utils/reports/sales.js'
import { runsOutSoonest } from '../../utils/reports/stock.js'
import { periodRange } from '../../utils/reports/period.js'

const CATEGORIES = [
  { id: 'cat-gatcha', name: 'GatchaPon', base_price: 4, sort_order: 0 },
  { id: 'cat-keychain', name: 'Keychain', base_price: 4, sort_order: 1 },
  { id: 'cat-mini', name: 'Mini Figure', base_price: 8, sort_order: 2 },
  { id: 'cat-coaster', name: 'Coaster', base_price: 8, sort_order: 3 }
]
const article = (id, name, category, extra = {}) => ({ id, name, category, active: true, stock: 3, low_stock_threshold: 2, ...extra })
const GATCHA = article('g1', 'GatchaPon', 'cat-gatcha', { stock: 0, prize_categories: ['cat-keychain', 'cat-mini'] })
const ARTICLES = [
  GATCHA,
  article('k2', 'Zubat Keychain', 'cat-keychain'),
  article('k1', 'Pikachu Keychain', 'cat-keychain', { stock: 1 }),
  article('k3', 'Evoli Keychain', 'cat-keychain', { stock: 0 }),
  article('k4', 'Old Keychain', 'cat-keychain', { active: false }),
  article('m1', 'Totoro Mini', 'cat-mini'),
  article('c1', 'Moon Coaster', 'cat-coaster')
]
const names = groups => groups.map(group => [group.category.name, group.articles.map(item => item.name)])

// A Storage stand-in; `broken` throws like a blocked or full localStorage
const memoryStorage = (broken = false) => {
  const data = new Map()
  const guard = () => { if (broken) throw new Error('blocked') }
  return {
    data,
    getItem: key => { guard(); return data.has(key) ? data.get(key) : null },
    setItem: (key, value) => { guard(); data.set(key, String(value)) },
    removeItem: (key) => { guard(); data.delete(key) }
  }
}

test('an article with at least one prize category is a gatcha', () => {
  assert.equal(isGatcha(GATCHA), true)
  assert.equal(isGatcha(article('a', 'A', 'cat-keychain', { prize_categories: [] })), false)
  // Older records and servers before the migration have no field at all
  assert.equal(isGatcha(article('a', 'A', 'cat-keychain')), false)
  assert.equal(isGatcha(article('a', 'A', 'cat-keychain', { prize_categories: null })), false)
  assert.equal(isGatcha(null), false)
})

test('a cart owes one prize per gatcha unit, from the union of the gatchas\' categories', () => {
  const coasterGatcha = article('g2', 'Coaster Gatcha', 'cat-gatcha', { prize_categories: ['cat-coaster', 'cat-keychain'] })
  assert.deepEqual(prizesFor([
    { ...GATCHA, quantity: 2 },
    { ...coasterGatcha, quantity: 1 },
    { ...ARTICLES[1], quantity: 4 },
    { ...article('g3', 'Unsold Gatcha', 'cat-gatcha', { prize_categories: ['cat-mini'] }), quantity: 0 }
  ]), { count: 3, categories: ['cat-keychain', 'cat-mini', 'cat-coaster'] })
  assert.deepEqual(prizesFor([{ ...ARTICLES[1], quantity: 1 }]), { count: 0, categories: [] })
})

test('open prizes add up, and start afresh once none are open', () => {
  const first = addPrizes(NO_PRIZES, { count: 2, categories: ['cat-keychain'] })
  assert.deepEqual(first, { count: 2, categories: ['cat-keychain'] })
  assert.deepEqual(addPrizes(first, { count: 1, categories: ['cat-mini', 'cat-keychain'] }), { count: 3, categories: ['cat-keychain', 'cat-mini'] })
  assert.equal(addPrizes(first, { count: 0, categories: [] }), first)
  // All picked: the old categories only stay for an Undo, a new checkout replaces them
  const done = takePrize(takePrize(first))
  assert.deepEqual(done, { count: 0, categories: ['cat-keychain'] })
  assert.deepEqual(takePrize(done), done)
  assert.deepEqual(returnPrize(done), { count: 1, categories: ['cat-keychain'] })
  assert.deepEqual(addPrizes(done, { count: 1, categories: ['cat-coaster'] }), { count: 1, categories: ['cat-coaster'] })
})

test('prize choices are active articles in stock from the prize categories, grouped and sorted by name', () => {
  const groups = prizeChoices({ articles: ARTICLES, categories: CATEGORIES, prizeCategories: ['cat-mini', 'cat-keychain'] })
  assert.deepEqual(names(groups), [
    ['Keychain', ['Pikachu Keychain', 'Zubat Keychain']],
    ['Mini Figure', ['Totoro Mini']]
  ])
  // The search filters by name, ignoring case and spaces around it; empty groups are left out
  assert.deepEqual(names(prizeChoices({ articles: ARTICLES, categories: CATEGORIES, prizeCategories: ['cat-mini', 'cat-keychain'], query: '  PIKA ' })), [
    ['Keychain', ['Pikachu Keychain']]
  ])
  assert.deepEqual(prizeChoices({ articles: ARTICLES, categories: CATEGORIES, prizeCategories: ['cat-keychain'], query: 'nothing' }), [])
})

test('a gatcha is never its own prize, even when its category is a prize category', () => {
  const groups = prizeChoices({ articles: [{ ...GATCHA, stock: 5 }, ...ARTICLES.slice(1)], categories: CATEGORIES, prizeCategories: ['cat-gatcha', 'cat-mini'] })
  assert.deepEqual(names(groups), [['Mini Figure', ['Totoro Mini']]])
})

test('a prize is a sale of one, and its undo a correction of one', () => {
  assert.deepEqual(prizeMovement('mv1', 'k1'), { id: 'mv1', article: 'k1', change: -1, reason: 'sale', note: 'Gatcha prize' })
  assert.deepEqual(undoMovement('mv2', 'k1'), { id: 'mv2', article: 'k1', change: 1, reason: 'correction', note: 'Gatcha prize undone' })
  assert.deepEqual([PRIZE_NOTE, UNDO_NOTE], ['Gatcha prize', 'Gatcha prize undone'])
})

test('undo takes a waiting pick out of the outbox, and balances a sent or sending one', () => {
  const pick = { id: 'mv1', article: 'k1', name: 'Pikachu Keychain' }
  const outbox = [prizeMovement('mv0', 'm1'), prizeMovement('mv1', 'k1')]
  assert.deepEqual(undoPick(outbox, pick, { id: 'mv9' }), [prizeMovement('mv0', 'm1')])
  // On its way: it may land, so the correction follows it
  assert.deepEqual(undoPick(outbox, pick, { sending: true, id: 'mv9' }), [...outbox, undoMovement('mv9', 'k1')])
  // Already on the server
  assert.deepEqual(undoPick([], pick, { id: 'mv9' }), [undoMovement('mv9', 'k1')])
})

test('open prizes and the outbox survive a reload, and garbage reads as nothing', () => {
  const storage = memoryStorage()
  writeOpenPrizes(storage, { count: 2, categories: ['cat-keychain'] })
  assert.deepEqual(readOpenPrizes(storage), { count: 2, categories: ['cat-keychain'] })
  writeOpenPrizes(storage, { count: 0, categories: ['cat-keychain'] })
  assert.equal(storage.data.has(OPEN_PRIZES_KEY), false)
  assert.deepEqual(readOpenPrizes(storage), NO_PRIZES)

  writeOutbox(storage, [prizeMovement('mv1', 'k1')])
  assert.deepEqual(readOutbox(storage), [prizeMovement('mv1', 'k1')])
  writeOutbox(storage, [])
  assert.equal(storage.data.has(PRIZE_OUTBOX_KEY), false)

  storage.setItem(OPEN_PRIZES_KEY, '{"count":-1,"categories":[]}')
  assert.deepEqual(readOpenPrizes(storage), NO_PRIZES)
  storage.setItem(OPEN_PRIZES_KEY, 'not json')
  assert.deepEqual(readOpenPrizes(storage), NO_PRIZES)
  storage.setItem(PRIZE_OUTBOX_KEY, JSON.stringify([prizeMovement('mv1', 'k1'), { id: 'x', article: 'k1', change: -40, reason: 'sale' }, 'junk']))
  assert.deepEqual(readOutbox(storage), [prizeMovement('mv1', 'k1')])

  // A blocked storage never throws
  const blocked = memoryStorage(true)
  writeOpenPrizes(blocked, { count: 1, categories: [] })
  writeOutbox(blocked, [prizeMovement('mv1', 'k1')])
  forgetPrizes(blocked)
  assert.deepEqual([readOpenPrizes(blocked), readOutbox(blocked)], [NO_PRIZES, []])
})

test('logging out forgets the open prizes and keeps waiting picks; clearing all data drops both', () => {
  const storage = memoryStorage()
  writeOpenPrizes(storage, { count: 1, categories: ['cat-keychain'] })
  writeOutbox(storage, [prizeMovement('mv1', 'k1')])
  forgetPrizes(storage)
  assert.deepEqual([storage.data.has(OPEN_PRIZES_KEY), storage.data.has(PRIZE_OUTBOX_KEY)], [false, true])
  forgetPrizes(storage, { keepOutbox: false })
  assert.equal(storage.data.size, 0)
})

test('a gatcha is never on the print board or in the stock check', () => {
  const low = lowStockArticles([GATCHA, article('k1', 'Pikachu Keychain', 'cat-keychain', { stock: 1 })])
  assert.deepEqual(low.map(item => item.id), ['k1'])
})

// Reports stay as they are: the gatcha's own line carries the revenue, prizes count for "runs out" only
const NOW = new Date(2026, 9, 14, 13, 0)
const stamp = date => date.toISOString().replace('T', ' ')
const MONTH = periodRange('month', NOW)

test('in Reports the gatcha sale is its own line and a prize is no article sale, even before any line data', () => {
  const gatchaSale = {
    id: 't1',
    description: 'GatchaPon',
    amount: 4,
    date: '2026-10-14',
    created: stamp(new Date(2026, 9, 14, 11, 0)),
    items: [{ article: 'g1', name: 'GatchaPon', category: 'cat-gatcha', categoryName: 'GatchaPon', quantity: 1, unitPrice: 4, lineTotal: 4, discount: 0, deal: '', dealName: '' }]
  }
  // The prize synced before the sale reached the server (the sale was still queued)
  const movements = [
    { id: 'mv1', article: 'k1', change: -1, reason: 'sale', note: PRIZE_NOTE, created: stamp(new Date(2026, 9, 14, 10, 0)) },
    { id: 'mv2', article: 'k2', change: -1, reason: 'sale', note: '', created: stamp(new Date(2026, 9, 14, 9, 0)) }
  ]
  const summary = salesSummary({ transactions: [gatchaSale], movements, articles: ARTICLES, categories: CATEGORIES, range: MONTH })
  assert.deepEqual(summary.topArticles.map(row => [row.name, row.units, row.revenue]), [
    ['GatchaPon', 1, 4],
    ['Zubat Keychain', 1, 0]
  ])
  assert.deepEqual(runsOutSoonest({ articles: ARTICLES, movements, now: NOW }).map(row => row.id), ['k1', 'k2'])
})
```

In `tests/unit/pb-plan.test.js`:

1. In the test `'plans the new collections, article fields and optional price'`, replace

```js
  assert.deepEqual(ops[7].fields.map(field => field.name), ['category', 'stock', 'low_stock_threshold', 'target_stock'])
```

with

```js
  assert.deepEqual(ops[7].fields.map(field => field.name), ['category', 'stock', 'low_stock_threshold', 'target_stock', 'prize_categories'])
```

2. Replace everything from the line `// The snapshot follows production, so it is checked as it is and as it was before these changes.` up to (not including) the line `const NOTIFIER_ID = 'notifier0000001'` with the block below. `DATE_FIELD`, `SOLD_AT_FIELD`, `ITEMS_FIELD` and `live` stay as they are above it.

   The live snapshot already has the calendar collections and the report fields, but not `prize_categories`. Every test below holds both before `--apply` and after the owner's refreshed snapshot has the field. The first test expects exactly what is still missing, and the others start from `upToDate()`, the snapshot with this plan's field simulated in.

```js
// The snapshot follows production, so it is checked as it is and as it was before these changes.
// Every check holds before and after `npm run pb:migrate -- --apply` refreshes the snapshot.
const REPORT_FIELDS = ['items', 'sold_at']
const CALENDAR = ['conventions', 'push_subscriptions']
const PRIZE_FIELD = { name: 'prize_categories', type: 'relation', required: false, presentable: false, options: { collectionId: '@categories', cascadeDelete: false, minSelect: null, maxSelect: null, displayFields: null } }
const withoutFields = (collections, names) => collections.map(collection => collection.name === TRANSACTIONS
  ? { ...collection, schema: collection.schema.filter(field => !names.includes(field.name)) }
  : collection)
const withoutCalendar = collections => collections.filter(collection => !CALENDAR.includes(collection.name))
const withoutDate = collections => withoutFields(collections, ['date', ...REPORT_FIELDS])
const withoutPrizes = collections => collections.map(collection => collection.name === ARTICLES
  ? { ...collection, schema: collection.schema.filter(field => field.name !== 'prize_categories') }
  : collection)
// The live schema with everything this plan adds, whether or not the owner has applied it yet
const upToDate = () => simulate(live(), planSchema(live()))
const CALENDAR_KEYS = CALENDAR.map(name => `createCollection:${name}`)

test('the live schema needs nothing beyond the prize categories', () => {
  const hasPrizes = live().find(collection => collection.name === ARTICLES).schema.some(field => field.name === 'prize_categories')
  const ops = planSchema(live())
  assert.deepEqual(ops, hasPrizes ? [] : [{ op: 'addFields', collection: ARTICLES, fields: [PRIZE_FIELD] }])
  assert.deepEqual(planSchema(simulate(live(), ops)), [])
})

test('without the prize categories the live schema needs exactly that field, and only once', () => {
  const before = withoutPrizes(upToDate())
  const ops = planSchema(before)
  assert.deepEqual(ops, [{ op: 'addFields', collection: ARTICLES, fields: [PRIZE_FIELD] }])
  assert.equal(describeOp(ops[0]), `add to "${ARTICLES}": prize_categories`)
  const after = simulate(before, ops)
  const field = after.find(collection => collection.name === ARTICLES).schema.find(item => item.name === 'prize_categories')
  // A relation to the categories that already exist on the server, several allowed, deleting a category keeps the article
  assert.equal(field.options.collectionId, after.find(collection => collection.name === 'categories').id)
  assert.deepEqual([field.required, field.options.maxSelect, field.options.cascadeDelete], [false, null, false])
  assert.deepEqual(planSchema(after), [])
})

test('the prize categories change no access rules', () => {
  const ruled = simulate(withoutPrizes(upToDate()), planRules(withoutPrizes(upToDate()), OWNER_ID, NOTIFIER_ID))
  const withPrizes = simulate(ruled, planSchema(ruled))
  assert.deepEqual(planRules(withPrizes, OWNER_ID, NOTIFIER_ID), [])
})

test('without the calendar collections the live schema needs exactly those two, and only once', () => {
  const before = withoutCalendar(upToDate())
  const ops = planSchema(before)
  assert.deepEqual(opKeys(ops), CALENDAR_KEYS)
  assert.equal(describeOp(ops[1]), 'create collection "push_subscriptions" (endpoint, keys, device)')
  assert.deepEqual(planSchema(simulate(before, ops)), [])
})

test('without the report fields the live schema needs exactly those two, and only once', () => {
  const before = withoutFields(withoutCalendar(upToDate()), REPORT_FIELDS)
  const ops = planSchema(before)
  assert.deepEqual(opKeys(ops), [...CALENDAR_KEYS, `addFields:${TRANSACTIONS}`])
  assert.deepEqual(ops[2], { op: 'addFields', collection: TRANSACTIONS, fields: [ITEMS_FIELD, SOLD_AT_FIELD] })
  assert.equal(describeOp(ops[2]), `add to "${TRANSACTIONS}": items, sold_at`)
  assert.deepEqual(planSchema(simulate(before, ops)), [])
})

test('before the date field the live schema needs it and the report fields, and only once', () => {
  const before = withoutDate(withoutCalendar(upToDate()))
  const ops = planSchema(before)
  assert.deepEqual(opKeys(ops), [...CALENDAR_KEYS, `addFields:${TRANSACTIONS}`])
  assert.deepEqual(ops[2], { op: 'addFields', collection: TRANSACTIONS, fields: [DATE_FIELD, ITEMS_FIELD, SOLD_AT_FIELD] })
  assert.deepEqual(planSchema(simulate(before, ops)), [])
})
```

(`'the prize categories change no access rules'` uses `NOTIFIER_ID`, which is declared further down. Test bodies run after the whole file has loaded, so that is fine.)

- [ ] **Step 2: Run them to verify they fail**

Run: `npm run test:unit`
Expected: `tests 305`, `pass 301`, `fail 4`:
- `tests/unit/gatcha.test.js` as a whole (`ERR_MODULE_NOT_FOUND` for `utils/gatcha.js`);
- `plans the new collections, article fields and optional price`;
- `the live schema needs nothing beyond the prize categories`;
- `without the prize categories the live schema needs exactly that field, and only once`.

- [ ] **Step 3: Create the gatcha rules**

Create `utils/gatcha.js`:

```js
// Gatcha prizes. See docs/superpowers/specs/2026-10-14-gatcha-stock-push-design.md
// A gatcha is an article with prize categories. Its buyer takes one prize article from those categories
// per unit; the prize's stock goes down, the gatcha's own stock is never touched.
export const PRIZE_NOTE = 'Gatcha prize'
export const UNDO_NOTE = 'Gatcha prize undone'
// On this device until picked: the open prizes, and the prize movements still waiting to reach the server
export const OPEN_PRIZES_KEY = 'akinai-gatcha-open'
export const PRIZE_OUTBOX_KEY = 'akinai-gatcha-outbox'

export const NO_PRIZES = Object.freeze({ count: 0, categories: Object.freeze([]) })

const unique = list => [...new Set(list)]

// PocketBase returns an empty multi-relation as [], an older record has no field at all
export const prizeCategoriesOf = article =>
  (Array.isArray(article?.prize_categories) ? article.prize_categories.filter(id => typeof id === 'string' && id) : [])

export const isGatcha = article => prizeCategoriesOf(article).length > 0

// The prizes a cart owes: one per gatcha unit, from the union of its gatchas' prize categories
export function prizesFor (cart) {
  const gatchas = cart.filter(item => isGatcha(item) && Number(item.quantity) > 0)
  return {
    count: gatchas.reduce((sum, item) => sum + Number(item.quantity), 0),
    categories: unique(gatchas.flatMap(prizeCategoriesOf))
  }
}

// A later checkout adds to the open prizes. Once none are open, its categories replace the old ones.
export function addPrizes (open, more) {
  if (!more.count) return open
  if (!open.count) return { count: more.count, categories: [...more.categories] }
  return { count: open.count + more.count, categories: unique([...open.categories, ...more.categories]) }
}

// Picking one prize lowers the count; the categories stay, so an Undo can bring the prize back
export const takePrize = open => ({ count: Math.max(0, open.count - 1), categories: open.categories })
export const returnPrize = open => ({ count: open.count + 1, categories: open.categories })

const byName = (a, b) => String(a.name).localeCompare(String(b.name))

// What a prize can be: an active article in stock from the open prize categories, never a gatcha.
// Grouped by category in the categories' own order, each group sorted by name; `query` filters by name.
export function prizeChoices ({ articles, categories, prizeCategories, query = '' }) {
  const wanted = new Set(prizeCategories)
  const text = String(query).trim().toLowerCase()
  const available = articles.filter(article =>
    article.active !== false &&
    Number(article.stock) > 0 &&
    wanted.has(article.category) &&
    !isGatcha(article) &&
    (!text || String(article.name).toLowerCase().includes(text)))
  return categories
    .filter(category => wanted.has(category.id))
    .map(category => ({ category, articles: available.filter(article => article.category === category.id).sort(byName) }))
    .filter(group => group.articles.length)
}

// The ids are made on the device, so a resend after a lost reply is recognised (like the checkout's movements)
export const prizeMovement = (id, article) => ({ id, article, change: -1, reason: 'sale', note: PRIZE_NOTE })
export const undoMovement = (id, article) => ({ id, article, change: 1, reason: 'correction', note: UNDO_NOTE })

// Undo before the pick left the device takes it out of the outbox. Once it was sent, or is on its way,
// a +1 correction balances it; it queues behind the pick, so it never reaches the server first.
export function undoPick (outbox, pick, { sending = false, id }) {
  if (!sending && outbox.some(movement => movement.id === pick.id)) return outbox.filter(movement => movement.id !== pick.id)
  return [...outbox, undoMovement(id, pick.article)]
}

const isCount = value => Number.isInteger(value) && value >= 0
const isMovement = movement => !!movement && typeof movement.id === 'string' && typeof movement.article === 'string' &&
  [-1, 1].includes(movement.change) && ['sale', 'correction'].includes(movement.reason)

// A full, blocked or garbled storage only costs what this device kept
export function readOpenPrizes (storage) {
  try {
    const stored = JSON.parse(storage.getItem(OPEN_PRIZES_KEY) || 'null')
    if (!stored || !isCount(stored.count) || !Array.isArray(stored.categories)) return NO_PRIZES
    return { count: stored.count, categories: stored.categories.filter(id => typeof id === 'string' && id) }
  } catch {
    return NO_PRIZES
  }
}

export function writeOpenPrizes (storage, open) {
  try {
    if (open.count > 0) storage.setItem(OPEN_PRIZES_KEY, JSON.stringify({ count: open.count, categories: open.categories }))
    else storage.removeItem(OPEN_PRIZES_KEY)
  } catch {}
}

export function readOutbox (storage) {
  try {
    const stored = JSON.parse(storage.getItem(PRIZE_OUTBOX_KEY) || '[]')
    return Array.isArray(stored) ? stored.filter(isMovement) : []
  } catch {
    return []
  }
}

export function writeOutbox (storage, outbox) {
  try {
    if (outbox.length) storage.setItem(PRIZE_OUTBOX_KEY, JSON.stringify(outbox))
    else storage.removeItem(PRIZE_OUTBOX_KEY)
  } catch {}
}

// Logging out drops the open prizes; the outbox stays, like queued sales, unless everything is cleared
export function forgetPrizes (storage, { keepOutbox = true } = {}) {
  try {
    storage.removeItem(OPEN_PRIZES_KEY)
    if (!keepOutbox) storage.removeItem(PRIZE_OUTBOX_KEY)
  } catch {}
}
```

- [ ] **Step 4: Keep gatchas off the print board and prizes out of Top articles**

In `utils/printBoard.js`, replace

```js
import { itemsOf } from './commissions.js'
```

with

```js
import { itemsOf } from './commissions.js'
import { isGatcha } from './gatcha.js'
```

and replace

```js
// Active articles with a threshold whose stock is at or below it, lowest stock first, then by name.
// The reminder job's stock check uses the same rule.
export const lowStockArticles = articles => articles
  .filter(article =>
    article.active &&
```

with

```js
// Active articles with a threshold whose stock is at or below it, lowest stock first, then by name.
// A gatcha is never printed: its prizes are. The reminder job's stock check uses the same rule.
export const lowStockArticles = articles => articles
  .filter(article =>
    article.active &&
    !isGatcha(article) &&
```

In `utils/reports/sales.js`, replace

```js
import { UNKNOWN_ARTICLE } from '../commissions.js'
```

with

```js
import { UNKNOWN_ARTICLE } from '../commissions.js'
import { PRIZE_NOTE } from '../gatcha.js'
```

and replace

```js
    if (movement.reason !== 'sale' || !at || at.getTime() >= start || !inPeriod(at, range)) continue
```

with

```js
    if (movement.reason !== 'sale' || !at || at.getTime() >= start || !inPeriod(at, range)) continue
    // A gatcha prize was paid for on the gatcha's own line; it is never an article sale of its own
    if (movement.note === PRIZE_NOTE) continue
```

`runsOutSoonest` and `printedVsSold` (`utils/reports/stock.js`) stay as they are: a prize left the stock, so it counts there.

- [ ] **Step 5: Add `prize_categories` to the migration plan**

In `scripts/lib/pb-plan.mjs`, in `planSchema`, replace

```js
  if (!findField(articles, 'target_stock')) missing.push(number('target_stock', { min: 0, noDecimal: true }))
```

with

```js
  if (!findField(articles, 'target_stock')) missing.push(number('target_stock', { min: 0, noDecimal: true }))
  // Gatcha prizes: the categories a gatcha's prizes come from. Several, optional; an article with any is a gatcha
  if (!findField(articles, 'prize_categories')) missing.push(relation('prize_categories', '@categories', false, null))
```

`scripts/pb-migrate.mjs` applies the `addFields` op as it is (with `resolveField` for `@categories` and the 1.5 s gap), and `rulesFor` does not change. Only its header comment changes. Replace

```js
// PocketBase 0.22 migration for categories, deals, stock, commissions (with items), print jobs, sale lines,
// the convention calendar and owner-only rules.
```

with

```js
// PocketBase 0.22 migration for categories, deals, stock, commissions (with items), print jobs, sale lines,
// the convention calendar, gatcha prize categories and owner-only rules.
```

Do NOT run `npm run pb:migrate` in any form.

- [ ] **Step 6: Run the tests to verify they pass**

Run: `npm run test:unit`
Expected: `tests 315`, `pass 315`, `fail 0`.

Run the time-zone loop and the Node 20 run from Working setup.
Expected: `fail 0` three times; `# pass 315` and `# fail 0` on Node 20.

Run: `node --check scripts/pb-migrate.mjs`
Expected: no output, exit code 0.

Run (reads only the local snapshot of production; no network):

```bash
node --input-type=module -e "import { readFileSync } from 'node:fs'; import { planSchema, describeOp } from './scripts/lib/pb-plan.mjs'; planSchema(JSON.parse(readFileSync('pocketbase/schema.json', 'utf8'))).forEach(op => console.log(describeOp(op)))"
```

Expected exactly (while the snapshot predates this migration):

```
add to "budget_tracket_catalog": prize_categories
```

Run: `npx playwright test tests/e2e/print-board.spec.js tests/e2e/reports.spec.js`
Expected: `90 passed`, no failed tests.

- [ ] **Step 7: Commit**

```bash
git add utils/gatcha.js tests/unit/gatcha.test.js utils/printBoard.js utils/reports/sales.js scripts/lib/pb-plan.mjs scripts/pb-migrate.mjs tests/unit/pb-plan.test.js
git commit -m "Add the gatcha rules and the prize_categories field to the migration"
```

---

### Task 3: The gatcha article and its checkout

**Files:**
- Modify: `components/ArticleSheet.vue` (Prize categories), `components/CartPanel.vue` (no stock warning for a gatcha), `pages/catalog.vue` (card badge, checkout movements)
- Modify: `tests/e2e/fake-pocketbase.js` (article default), `tests/e2e/fixtures.js` (seed default)
- Create: `tests/e2e/gatcha-data.js`, `tests/e2e/gatcha.spec.js`

**Interfaces:**
- Consumes: `isGatcha(article)` and `prizeCategoriesOf(article)` from `utils/gatcha.js` (Task 2).
- Produces:
  - articles saved from the sheet carry `prize_categories: string[]`;
  - the checkout's `stockMovements` leave gatchas out;
  - `tests/e2e/gatcha-data.js` exports `GATCHA_CATEGORIES`, `GATCHA`, `GATCHA_ARTICLES`, `card(page, name)`, `prizeSheet(page)`, `prizeMovements(api)`, `stockOf(api, id)`, `openGatchaShop(page, api, { articles?, deals? })` and `checkout(page, { [articleName]: times })`. Task 4 and `mobile.spec.js` use them.

- [ ] **Step 1: Give the fake articles the field**

PocketBase returns an empty multi-relation as `[]`. In `tests/e2e/fake-pocketbase.js`, replace

```js
  budget_tracket_catalog: { collectionId: 'articles0000001', active: true, stock: 0, low_stock_threshold: 2, target_stock: 0, images: [], price: 0, description: '' },
```

with

```js
  budget_tracket_catalog: { collectionId: 'articles0000001', active: true, stock: 0, low_stock_threshold: 2, target_stock: 0, images: [], price: 0, description: '', prize_categories: [] },
```

In `tests/e2e/fixtures.js`, in `seed`, replace

```js
          price: 0,
          category: 'cat-figure',
          ...article
```

with

```js
          price: 0,
          category: 'cat-figure',
          prize_categories: [],
          ...article
```

- [ ] **Step 2: Write the failing e2e tests**

Create `tests/e2e/gatcha-data.js`:

```js
// A shop with a gatcha: GatchaPon (category GatchaPon, 4 €) whose prizes come from Keychain and Mini Figure
import { SAMPLE_CATEGORIES, gotoReady } from './fixtures.js'

export const GATCHA_CATEGORIES = [
  ...SAMPLE_CATEGORIES,
  { id: 'cat-gatcha', name: 'GatchaPon', base_price: 4, sort_order: 3 },
  { id: 'cat-mini', name: 'Mini Figure', base_price: 8, sort_order: 4 }
]

export const GATCHA = { id: 'g1', name: 'GatchaPon', category: 'cat-gatcha', stock: 7, prize_categories: ['cat-keychain', 'cat-mini'] }
export const GATCHA_ARTICLES = [
  GATCHA,
  { id: 'k1', name: 'Pikachu Keychain', category: 'cat-keychain', stock: 2 },
  { id: 'k2', name: 'Zubat Keychain', category: 'cat-keychain', stock: 1 },
  { id: 'k3', name: 'Evoli Keychain', category: 'cat-keychain', stock: 0 },
  { id: 'm1', name: 'Totoro Mini', category: 'cat-mini', stock: 3 },
  { id: 'f1', name: 'Glurak Figure', category: 'cat-figure', stock: 5 }
]

export const card = (page, name) => page.locator('h3', { hasText: name })
export const prizeSheet = page => page.getByRole('dialog', { name: /^Gatcha prizes/ })
export const prizeMovements = api => api.db.stock_movements.filter(movement => /^Gatcha prize/.test(movement.note))
export const stockOf = (api, id) => api.db.budget_tracket_catalog.find(article => article.id === id).stock

export async function openGatchaShop (page, api, { articles = GATCHA_ARTICLES, deals = [] } = {}) {
  api.seed({ categories: GATCHA_CATEGORIES, articles, deals })
  await gotoReady(page, '/catalog')
}

// Adds each article the given number of times and checks out (through the cart sheet on phones)
export async function checkout (page, cart) {
  for (const [name, times] of Object.entries(cart)) {
    for (let i = 0; i < times; i++) await card(page, name).click()
  }
  if (page.viewportSize().width < 1024) await page.getByRole('button', { name: /View cart/ }).click()
  await page.getByRole('button', { name: 'Add to Balance' }).click()
}
```

Create `tests/e2e/gatcha.spec.js` (Task 4 adds the picker's tests to it):

```js
import { test, expect } from './fixtures.js'
import { GATCHA, card, checkout, openGatchaShop, stockOf } from './gatcha-data.js'

const sheet = page => page.getByRole('dialog')

test.describe('the gatcha article', () => {
  test('Prize categories lists every category, and ticking one makes the article a gatcha', async ({ page, api }) => {
    await openGatchaShop(page, api, { articles: [{ ...GATCHA, prize_categories: [] }] })
    await expect(page.locator('article', { hasText: 'GatchaPon' })).toContainText('7 left')
    await page.getByRole('button', { name: 'Manage' }).click()
    await card(page, 'GatchaPon').click()
    const prizes = sheet(page).getByRole('group', { name: 'Prize categories' })
    await expect(prizes.getByRole('checkbox')).toHaveCount(5)
    await prizes.getByLabel('Keychain').check()
    await prizes.getByLabel('Mini Figure').check()
    await sheet(page).getByRole('button', { name: 'Save changes' }).click()

    await expect(sheet(page)).toHaveCount(0)
    expect(api.db.budget_tracket_catalog[0].prize_categories).toEqual(['cat-keychain', 'cat-mini'])
    await expect(page.locator('article', { hasText: 'GatchaPon' })).toContainText('Gatcha')
    await expect(page.locator('article', { hasText: 'GatchaPon' })).not.toContainText('7 left')

    // Unticking all of them makes it an ordinary article again
    await card(page, 'GatchaPon').click()
    await expect(prizes.getByLabel('Keychain')).toBeChecked()
    await prizes.getByLabel('Keychain').uncheck()
    await prizes.getByLabel('Mini Figure').uncheck()
    await sheet(page).getByRole('button', { name: 'Save changes' }).click()
    await expect(sheet(page)).toHaveCount(0)
    expect(api.db.budget_tracket_catalog[0].prize_categories).toEqual([])
    await expect(page.locator('article', { hasText: 'GatchaPon' })).toContainText('7 left')
  })

  test('a gatcha sells at its category price with a sale line and no stock movement', async ({ page, api }) => {
    await openGatchaShop(page, api)
    await checkout(page, { GatchaPon: 2, 'Pikachu Keychain': 1 })

    await expect.poll(() => api.posted.length).toBe(1)
    expect(api.posted[0].amount).toBe(12)
    expect(api.posted[0].items.map(line => [line.article, line.quantity, line.lineTotal])).toEqual([
      ['g1', 2, 8],
      ['k1', 1, 4]
    ])
    await expect.poll(() => api.db.stock_movements.filter(movement => movement.id.length === 15).map(movement => movement.article)).toEqual(['k1'])
    expect(stockOf(api, 'g1')).toBe(7)
    await expect.poll(() => stockOf(api, 'k1')).toBe(1)
  })

  test('a deal on the gatcha category applies as for any article', async ({ page, api }) => {
    await openGatchaShop(page, api, {
      deals: [{ id: 'deal-gatcha', name: 'GatchaPon 2 for 7', type: 'bundle', categories: ['cat-gatcha'], min_qty: 2, price: 7 }]
    })
    await checkout(page, { GatchaPon: 2 })
    await expect.poll(() => api.posted.length).toBe(1)
    expect(api.posted[0].amount).toBe(7)
    expect(api.posted[0].items[0]).toMatchObject({ article: 'g1', quantity: 2, lineTotal: 8, discount: 1, dealName: 'GatchaPon 2 for 7' })
  })

  test('the cart does not warn about the gatcha\'s own stock', async ({ page, api }) => {
    await openGatchaShop(page, api, { articles: [{ ...GATCHA, stock: 0 }] })
    for (let i = 0; i < 2; i++) await card(page, 'GatchaPon').click()
    if (page.viewportSize().width < 1024) await page.getByRole('button', { name: /View cart/ }).click()
    await expect(page.getByText(/in stock/)).toHaveCount(0)
  })
})
```

- [ ] **Step 3: Run them to verify they fail**

Run: `npx playwright test tests/e2e/gatcha.spec.js`
Expected: 6 failed, 2 passed:
- `'Prize categories lists every category, and ticking one makes the article a gatcha'` fails: there is no `Prize categories` group;
- `'a gatcha sells at its category price with a sale line and no stock movement'` fails: the checkout logs a movement for `g1`;
- `'the cart does not warn about the gatcha\'s own stock'` fails: the cart shows "only 0 in stock";
- `'a deal on the gatcha category applies as for any article'` already passes on both projects. It pins that deals stay as they are.

- [ ] **Step 4: Add Prize categories to the article sheet**

In `components/ArticleSheet.vue`:

1. Replace

```vue
      <div v-if="!article">
        <label for="article-stock" class="label">Starting stock</label>
```

with

```vue
      <fieldset>
        <legend class="label">Prize categories</legend>
        <div class="divide-y divide-line rounded-lg border border-line">
          <label v-for="category in categories" :key="category.id" class="flex min-h-[44px] cursor-pointer items-center gap-3 px-3">
            <input v-model="form.prizeCategories" type="checkbox" :value="category.id" class="h-5 w-5 rounded border-line text-accent focus:ring-accent/30">
            <span class="min-w-0 flex-1 truncate text-sm text-ink">{{ category.name }}</span>
          </label>
        </div>
        <p class="hint">With any category ticked this is a gatcha: after a sale you pick a prize from these categories, and the prize's stock goes down instead</p>
      </fieldset>

      <div v-if="!article">
        <label for="article-stock" class="label">Starting stock</label>
```

2. Replace

```js
import { correctionMovement, newRecordId } from '~/utils/inventory'
```

with

```js
import { correctionMovement, newRecordId } from '~/utils/inventory'
import { prizeCategoriesOf } from '~/utils/gatcha'
```

3. Replace

```js
const emptyForm = () => ({ name: '', category: '', price: '', lowStockThreshold: '2', targetStock: '', startingStock: '', description: '' })
```

with

```js
const emptyForm = () => ({ name: '', category: '', price: '', lowStockThreshold: '2', targetStock: '', startingStock: '', description: '', prizeCategories: [] })
```

4. Replace

```js
        startingStock: '',
        description: article.description || ''
      }
```

with

```js
        startingStock: '',
        description: article.description || '',
        prizeCategories: [...prizeCategoriesOf(article)]
      }
```

5. Replace

```js
    description: form.value.description.trim()
  }
```

with

```js
    description: form.value.description.trim(),
    // An article with prize categories is a gatcha; a category deleted since then is dropped
    prize_categories: form.value.prizeCategories.filter(id => props.categories.some(category => category.id === id))
  }
```

- [ ] **Step 5: Leave the gatcha's own stock alone at the checkout**

In `components/CartPanel.vue`, replace

```vue
          <p v-if="item.quantity > item.stock" class="text-xs font-medium text-warning">
```

with

```vue
          <p v-if="item.quantity > item.stock && !isGatcha(item)" class="text-xs font-medium text-warning">
```

and replace

```js
import { formatCurrency } from '~/utils/currency'
```

with

```js
import { formatCurrency } from '~/utils/currency'
import { isGatcha } from '~/utils/gatcha'
```

In `pages/catalog.vue`:

1. Replace

```vue
              <span class="self-start rounded-full px-2 py-0.5 text-xs font-medium" :class="STOCK_BADGE[stockStatus(product.stock, product.low_stock_threshold)]">
                {{ stockLabel(product) }}
              </span>
```

with

```vue
              <!-- A gatcha's own stock never changes: its prizes' stock does -->
              <span v-if="isGatcha(product)" class="self-start rounded-full bg-accent/10 px-2 py-0.5 text-xs font-medium text-accent">
                Gatcha
              </span>
              <span v-else class="self-start rounded-full px-2 py-0.5 text-xs font-medium" :class="STOCK_BADGE[stockStatus(product.stock, product.low_stock_threshold)]">
                {{ stockLabel(product) }}
              </span>
```

2. Replace

```js
import { stockStatus, saleMovement, newRecordId } from '~/utils/inventory'
```

with

```js
import { stockStatus, saleMovement, newRecordId } from '~/utils/inventory'
import { isGatcha } from '~/utils/gatcha'
```

3. Replace

```js
  // Overselling is allowed: the movement deducts what is left and notes the rest
  const stockMovements = selectedProducts.value.map(product => ({
```

with

```js
  // Overselling is allowed: the movement deducts what is left and notes the rest.
  // A gatcha's own stock is never touched: the prizes picked for it are.
  const stockMovements = selectedProducts.value.filter(product => !isGatcha(product)).map(product => ({
```

4. Replace

```js
    if (product.quantity) product.stock = Math.max(0, product.stock - product.quantity)
```

with

```js
    if (product.quantity && !isGatcha(product)) product.stock = Math.max(0, product.stock - product.quantity)
```

The sale's `items` (`saleLines`) and its amount are unchanged: the gatcha's line carries its revenue, deals included.

- [ ] **Step 6: Run the tests to verify they pass**

Run: `npx playwright test tests/e2e/gatcha.spec.js tests/e2e/catalog.spec.js tests/e2e/deals.spec.js tests/e2e/inventory.spec.js tests/e2e/articles.spec.js`
Expected: `115 passed`, `3 skipped`, no failed tests.

Run: `npm run test:unit`
Expected: `tests 315`, `pass 315`, `fail 0`.

Run: `npx playwright test`
Expected: `597 passed`, `77 skipped`, no failed tests.

- [ ] **Step 7: Commit**

```bash
git add components/ArticleSheet.vue components/CartPanel.vue pages/catalog.vue tests/e2e/fake-pocketbase.js tests/e2e/fixtures.js tests/e2e/gatcha-data.js tests/e2e/gatcha.spec.js
git commit -m "Let an article with prize categories be a gatcha whose own stock the checkout leaves alone"
```

---

### Task 4: The prize picker, open prizes and offline picks

**Files:**
- Create: `composables/useGatchaPrizes.js`, `components/GatchaPrizeSheet.vue`
- Modify: `pages/catalog.vue` (banner, picker, checkout), `composables/useTransactions.js` (`forgetLocalData`)
- Test: `tests/e2e/gatcha.spec.js`, `tests/e2e/mobile.spec.js`

**Interfaces:**
- Consumes: from `utils/gatcha.js` (Task 2) `NO_PRIZES`, `addPrizes`, `takePrize`, `returnPrize`, `prizeMovement`, `undoPick`, `prizeChoices`, `prizesFor`, `isGatcha`, `readOpenPrizes`, `writeOpenPrizes`, `readOutbox`, `writeOutbox`, `forgetPrizes`; `newRecordId()`; `useInventory().applyMovements`; `tests/e2e/gatcha-data.js` (Task 3).
- Produces:
  - `useGatchaPrizes() → { openPrizes, picks, outbox, addOpenPrizes(prizes), pick(article) → boolean, undo(pick) → boolean, isWaiting(pick) → boolean, endRound(), syncPrizes() → Promise, startPrizeSync() }`, where `openPrizes` is a ref of `{ count, categories }` and `picks` a ref of `[{ id, article, name }]`;
  - `forgetGatchaPrizes({ keepOutbox = true })`, a plain export of the same module;
  - `<GatchaPrizeSheet v-model:open :articles :categories @picked="id" @undone="id">`;
  - the catalog banner has `data-testid="gatcha-banner"` and a **Pick now** button.

- [ ] **Step 1: Write the failing e2e tests**

In `tests/e2e/gatcha.spec.js`, replace the two import lines with

```js
import { test, expect, gotoReady } from './fixtures.js'
import { GATCHA, GATCHA_ARTICLES, card, checkout, openGatchaShop, prizeMovements, prizeSheet, stockOf } from './gatcha-data.js'
```

and append at the end of the file:

```js

test.describe('picking gatcha prizes', () => {
  test('the picker opens after the checkout and each pick is a sale of one prize', async ({ page, api }) => {
    await openGatchaShop(page, api)
    await checkout(page, { GatchaPon: 2 })
    const picker = prizeSheet(page)
    await expect(picker).toHaveAccessibleName('Gatcha prizes · 0 of 2')
    // In stock, from the prize categories, by category and then by name; never the gatcha itself
    await expect(picker.getByRole('region', { name: 'Keychain' }).getByRole('button')).toHaveText([/^Pikachu Keychain\s*2 left$/, /^Zubat Keychain\s*1 left$/])
    await expect(picker.getByRole('region', { name: 'Mini Figure' }).getByRole('button')).toHaveText([/^Totoro Mini\s*3 left$/])
    await expect(picker.getByText('Evoli Keychain')).toHaveCount(0)
    await expect(picker.getByText('Glurak Figure')).toHaveCount(0)
    await expect(picker.getByRole('button', { name: /^GatchaPon/ })).toHaveCount(0)

    await picker.getByRole('button', { name: /^Pikachu Keychain/ }).click()
    await expect(picker).toHaveAccessibleName('Gatcha prizes · 1 of 2')
    await expect(picker.getByRole('button', { name: /^Pikachu Keychain/ })).toContainText('1 left')
    await expect(picker.getByRole('region', { name: 'Picked' })).toContainText('Pikachu Keychain')
    await expect(picker.getByRole('button', { name: 'Undo Pikachu Keychain' })).toBeVisible()
    await expect.poll(() => prizeMovements(api).map(m => [m.article, m.change, m.reason, m.note])).toEqual([['k1', -1, 'sale', 'Gatcha prize']])
    await expect.poll(() => stockOf(api, 'k1')).toBe(1)

    await picker.getByRole('button', { name: /^Totoro Mini/ }).click()
    await expect(picker.getByRole('status')).toHaveText('All prizes picked')
    await expect(picker).toHaveCount(0)
    await expect(page.getByTestId('gatcha-banner')).toHaveCount(0)
    await expect.poll(() => prizeMovements(api).length).toBe(2)
    // The gatcha's own stock never moved
    expect(stockOf(api, 'g1')).toBe(7)
    await expect(page.locator('article', { hasText: 'Pikachu Keychain' })).toContainText('1 left')
  })

  test('the search filters the prizes by name', async ({ page, api }) => {
    await openGatchaShop(page, api)
    await checkout(page, { GatchaPon: 1 })
    const picker = prizeSheet(page)
    await picker.getByRole('textbox', { name: 'Search prizes' }).fill('zu')
    await expect(picker.getByRole('button', { name: /left$/ })).toHaveText([/^Zubat Keychain/])
    await picker.getByRole('textbox', { name: 'Search prizes' }).fill('nothing')
    await expect(picker.getByText('No prizes match your search')).toBeVisible()
  })

  test('several gatchas list the union of their prize categories, and every pick counts', async ({ page, api }) => {
    await openGatchaShop(page, api, {
      articles: [
        ...GATCHA_ARTICLES,
        { id: 'g2', name: 'Coaster Gatcha', category: 'cat-gatcha', stock: 0, prize_categories: ['cat-coaster'] },
        { id: 'c1', name: 'Moon Coaster', category: 'cat-coaster', stock: 4 }
      ]
    })
    await checkout(page, { GatchaPon: 1, 'Coaster Gatcha': 1 })
    const picker = prizeSheet(page)
    await expect(picker).toHaveAccessibleName('Gatcha prizes · 0 of 2')
    await expect(picker.getByRole('region')).toHaveCount(3)
    await picker.getByRole('button', { name: /^Moon Coaster/ }).click()
    await picker.getByRole('button', { name: /^Moon Coaster/ }).click()
    await expect(picker.getByRole('status')).toHaveText('All prizes picked')
    await expect.poll(() => prizeMovements(api).map(m => m.article)).toEqual(['c1', 'c1'])
  })

  test('Later keeps the open prizes in a banner, Pick now reopens them, and a second checkout adds up', async ({ page, api }) => {
    await openGatchaShop(page, api)
    await checkout(page, { GatchaPon: 1 })
    await prizeSheet(page).getByRole('button', { name: 'Later' }).click()
    await expect(prizeSheet(page)).toHaveCount(0)
    await expect(page.getByTestId('gatcha-banner')).toContainText('1 gatcha prize to pick')

    await checkout(page, { GatchaPon: 1 })
    await expect(prizeSheet(page)).toHaveAccessibleName('Gatcha prizes · 0 of 2')
    await prizeSheet(page).getByRole('button', { name: /^Zubat Keychain/ }).click()
    await prizeSheet(page).getByRole('button', { name: 'Later' }).click()
    await expect(page.getByTestId('gatcha-banner')).toContainText('1 gatcha prize to pick')

    // Kept on the device across a reload
    await page.reload()
    await expect(page.getByTestId('gatcha-banner')).toContainText('1 gatcha prize to pick')
    await page.getByTestId('gatcha-banner').getByRole('button', { name: 'Pick now' }).click()
    await expect(prizeSheet(page)).toHaveAccessibleName('Gatcha prizes · 0 of 1')
  })

  test('undo before the pick synced drops it; after it synced it records a correction', async ({ page, api, context }) => {
    await openGatchaShop(page, api)
    await checkout(page, { GatchaPon: 2 })
    const picker = prizeSheet(page)

    await picker.getByRole('button', { name: /^Pikachu Keychain/ }).click()
    await expect.poll(() => prizeMovements(api).length).toBe(1)
    await expect(picker.getByText('Waiting to sync')).toHaveCount(0)
    await picker.getByRole('button', { name: 'Undo Pikachu Keychain' }).click()
    await expect(picker).toHaveAccessibleName('Gatcha prizes · 0 of 2')
    await expect(picker.getByRole('button', { name: /^Pikachu Keychain/ })).toContainText('2 left')
    await expect.poll(() => prizeMovements(api).map(m => [m.article, m.change, m.reason, m.note])).toEqual([
      ['k1', -1, 'sale', 'Gatcha prize'],
      ['k1', 1, 'correction', 'Gatcha prize undone']
    ])
    await expect.poll(() => stockOf(api, 'k1')).toBe(2)

    await context.setOffline(true)
    await picker.getByRole('button', { name: /^Zubat Keychain/ }).click()
    await expect(picker.getByRole('region', { name: 'Picked' })).toContainText('Waiting to sync')
    await picker.getByRole('button', { name: 'Undo Zubat Keychain' }).click()
    await expect(picker.getByRole('region', { name: 'Picked' })).toHaveCount(0)
    await context.setOffline(false)
    await picker.getByRole('button', { name: /^Totoro Mini/ }).click()
    await expect.poll(() => prizeMovements(api).map(m => m.article)).toEqual(['k1', 'k1', 'm1'])
    expect(stockOf(api, 'k2')).toBe(1)
  })

  test('an offline checkout opens the picker, and its picks sync when the connection returns', async ({ page, api, context }) => {
    await openGatchaShop(page, api)
    await context.setOffline(true)
    await checkout(page, { GatchaPon: 1, 'Totoro Mini': 1 })
    const picker = prizeSheet(page)
    await expect(picker).toHaveAccessibleName('Gatcha prizes · 0 of 1')
    // The checkout's own sale already counts in the stock the picker shows
    await expect(picker.getByRole('button', { name: /^Totoro Mini/ })).toContainText('2 left')
    await picker.getByRole('button', { name: /^Pikachu Keychain/ }).click()
    await expect(picker.getByRole('region', { name: 'Picked' })).toContainText('Waiting to sync')
    expect(prizeMovements(api)).toEqual([])

    await context.setOffline(false)
    await expect.poll(() => prizeMovements(api).map(m => [m.article, m.change])).toEqual([['k1', -1]])
    await expect.poll(() => api.posted.length).toBe(1)
    expect(api.posted[0].items.map(line => line.article)).toEqual(['g1', 'm1'])
    await expect.poll(() => stockOf(api, 'k1')).toBe(1)
    expect(stockOf(api, 'g1')).toBe(7)
  })

  test('a pick whose reply was lost is sent again once, and an undo meanwhile still balances it', async ({ page, api, context }) => {
    await openGatchaShop(page, api)
    await checkout(page, { GatchaPon: 1 })
    await expect.poll(() => api.posted.length).toBe(1)
    // The movement is stored, then recomputing the stock fails: the pick stays queued as tried
    api.fail('budget_tracket_catalog', 500)
    const picker = prizeSheet(page)
    await picker.getByRole('button', { name: /^Pikachu Keychain/ }).click()
    await expect.poll(() => prizeMovements(api).length).toBe(1)
    await expect(picker.getByRole('region', { name: 'Picked' })).toContainText('Waiting to sync')
    await picker.getByRole('button', { name: 'Undo Pikachu Keychain' }).click()

    api.fail('budget_tracket_catalog', 0)
    await context.setOffline(true)
    await context.setOffline(false)
    await expect.poll(() => prizeMovements(api).map(m => [m.article, m.change])).toEqual([['k1', -1], ['k1', 1]])
    await expect.poll(() => stockOf(api, 'k1')).toBe(2)
  })

  test('logging out clears the open prizes from the device', async ({ page, api }) => {
    await openGatchaShop(page, api)
    await checkout(page, { GatchaPon: 1 })
    await prizeSheet(page).getByRole('button', { name: 'Later' }).click()
    await expect(page.getByTestId('gatcha-banner')).toBeVisible()
    await expect.poll(() => api.posted.length).toBe(1)
    await gotoReady(page, '/settings#api')
    await page.getByRole('button', { name: 'Log out' }).click()
    await page.waitForURL(url => url.pathname === '/login')
    expect(await page.evaluate(() => localStorage.getItem('akinai-gatcha-open'))).toBeNull()
  })
})

test.describe('visitors', () => {
  test.use({ owner: false })

  test('see no banner, even with prizes left on the device', async ({ page, api }) => {
    await page.addInitScript(() => localStorage.setItem('akinai-gatcha-open', JSON.stringify({ count: 2, categories: ['cat-keychain'] })))
    await openGatchaShop(page, api)
    await expect(page.getByRole('heading', { name: 'GatchaPon' })).toBeVisible()
    await expect(page.getByTestId('gatcha-banner')).toHaveCount(0)
  })
})
```

In `tests/e2e/mobile.spec.js`, replace

```js
import { CONVENTIONS, convention, openCalendar } from './calendar-data.js'
```

with

```js
import { CONVENTIONS, convention, openCalendar } from './calendar-data.js'
import { GATCHA, GATCHA_CATEGORIES, checkout, prizeSheet } from './gatcha-data.js'
```

and, inside `test.describe('phone layout sweep', …)`, directly above the block

```js
  for (const dark of [false, true]) {
    test(`the calendar fits at 375px with long names, in Upcoming, Month and the sheet${dark ? ' (dark)' : ''}`, async ({ page, api }) => {
```

add:

```js
  for (const dark of [false, true]) {
    test(`the gatcha prize picker and its banner fit at 375px with long names${dark ? ' (dark)' : ''}`, async ({ page, api }) => {
      await page.addInitScript((dark) => {
        localStorage.setItem('budget-tracker-settings', JSON.stringify({ display: { darkMode: dark } }))
      }, dark)
      const long = 'Supercalifragilisticexpialidocious-Keychain-With-A-Very-Long-Unbroken-Name'
      api.seed({
        categories: GATCHA_CATEGORIES,
        articles: [GATCHA, { id: 'k1', name: long, category: 'cat-keychain', stock: 1234567 }]
      })
      await gotoReady(page, '/catalog')
      const fits = async (label) => {
        const scrollWidth = await page.evaluate(() => document.documentElement.scrollWidth)
        expect(scrollWidth, label).toBeLessThanOrEqual(page.viewportSize().width)
        expect(await smallTargets(page), label).toEqual([])
      }
      await checkout(page, { GatchaPon: 2 })
      const picker = prizeSheet(page)
      await picker.getByRole('button', { name: new RegExp(`^${long}`) }).click()
      await expect(picker.getByRole('button', { name: `Undo ${long}` })).toBeVisible()
      await fits('picker')
      expect(await picker.evaluate(el => el.scrollWidth > el.clientWidth)).toBe(false)
      await picker.getByRole('button', { name: 'Later' }).click()
      await expect(page.getByTestId('gatcha-banner')).toContainText('1 gatcha prize to pick')
      await fits('banner')
    })
  }
```

- [ ] **Step 2: Run them to verify they fail**

Run: `npx playwright test tests/e2e/gatcha.spec.js tests/e2e/mobile.spec.js`
Expected: 18 failed. The 8 new owner tests in `gatcha.spec.js` fail on both projects (there is no `Gatcha prizes` dialog and no banner), and so do the two 375px picker tests on `mobile`. `'see no banner, even with prizes left on the device'` and the Task 3 tests pass.

- [ ] **Step 3: Create the prize state**

Create `composables/useGatchaPrizes.js`:

```js
import { ref } from 'vue'
import { usePocketBase } from './usePocketBase'
import { useInventory } from './useInventory'
import { newRecordId } from '~/utils/inventory'
import {
  NO_PRIZES,
  addPrizes,
  takePrize,
  returnPrize,
  prizeMovement,
  undoPick,
  readOpenPrizes,
  writeOpenPrizes,
  readOutbox,
  writeOutbox,
  forgetPrizes
} from '~/utils/gatcha'

// One state for the whole app, kept on this device:
// - open: the prizes still to pick ({ count, categories });
// - picks: the prizes picked since the last time all were picked, for "k of N", Picked and Undo;
// - outbox: the prize movements (and undos) that have not reached the server yet, in order.
const open = ref(NO_PRIZES)
const picks = ref([])
const outbox = ref([])
// Movement ids whose request is out right now
const sending = ref([])
let loaded = false
let syncRun = null
let syncAgain = false
let listening = false

// localStorage only exists in the browser, so the state is read on first use there
const load = () => {
  if (loaded) return
  loaded = true
  open.value = readOpenPrizes(localStorage)
  outbox.value = readOutbox(localStorage)
}

const save = () => {
  writeOpenPrizes(localStorage, open.value)
  writeOutbox(localStorage, outbox.value)
}

// The fields PocketBase stores; `tried` only lives on this device
const bodyOf = ({ id, article, change, reason, note }) => ({ id, article, change, reason, note })

// Logging out forgets the open prizes and the picks. Waiting movements stay queued, like sales that have
// not synced, and go out after the next login; "Clear All Local Data" (keepOutbox: false) drops them too.
export function forgetGatchaPrizes ({ keepOutbox = true } = {}) {
  loaded = true
  open.value = NO_PRIZES
  picks.value = []
  outbox.value = keepOutbox ? readOutbox(localStorage) : []
  forgetPrizes(localStorage, { keepOutbox })
}

export const useGatchaPrizes = () => {
  const pb = usePocketBase()
  const { applyMovements } = useInventory()

  // Sends the outbox in order, one movement at a time, and stops at the first failure so an undo never
  // overtakes its pick. A movement id the server already has counts as sent (createMovement), so a
  // resend after a lost reply records nothing twice.
  const runSync = async () => {
    do {
      syncAgain = false
      for (const queued of [...outbox.value]) {
        if (!navigator.onLine || !pb.authStore.isValid) return
        // Undone while waiting: it left the outbox and must not go out
        if (!outbox.value.some(item => item.id === queued.id)) continue
        outbox.value = outbox.value.map(item => (item.id === queued.id ? { ...item, tried: true } : item))
        save()
        sending.value = [...sending.value, queued.id]
        try {
          await applyMovements([bodyOf(queued)])
        } catch {
          return
        } finally {
          sending.value = sending.value.filter(id => id !== queued.id)
        }
        outbox.value = outbox.value.filter(item => item.id !== queued.id)
        save()
      }
    } while (syncAgain)
  }

  const syncPrizes = () => {
    load()
    if (syncRun) {
      syncAgain = true
      return syncRun
    }
    if (!outbox.value.length) return Promise.resolve()
    syncRun = runSync().finally(() => { syncRun = null })
    return syncRun
  }

  // From the catalog's onMounted: load the device's state, send what waits, and send again whenever
  // the connection comes back (once per app)
  const startPrizeSync = () => {
    load()
    if (!listening) {
      listening = true
      window.addEventListener('online', () => syncPrizes())
    }
    syncPrizes()
  }

  const addOpenPrizes = (prizes) => {
    load()
    // A round that ended (none open) starts over with an empty Picked list
    if (!open.value.count) picks.value = []
    open.value = addPrizes(open.value, prizes)
    save()
  }

  // One prize for `article`: a sale of 1, queued on the device and sent right away when online
  const pick = (article) => {
    load()
    if (open.value.count < 1) return false
    const movement = prizeMovement(newRecordId(), article.id)
    outbox.value = [...outbox.value, movement]
    open.value = takePrize(open.value)
    picks.value = [...picks.value, { id: movement.id, article: article.id, name: article.name }]
    save()
    syncPrizes()
    return true
  }

  // A pick that never left the device is dropped. One that was sent, is being sent or was tried before
  // (its request may have reached the server) stays queued and gets a +1 correction behind it.
  const undo = (item) => {
    load()
    if (!picks.value.some(entry => entry.id === item.id)) return false
    const queued = outbox.value.find(movement => movement.id === item.id)
    const mayHaveLanded = sending.value.includes(item.id) || !!queued?.tried
    outbox.value = undoPick(outbox.value, item, { sending: mayHaveLanded, id: newRecordId() })
    picks.value = picks.value.filter(entry => entry.id !== item.id)
    open.value = returnPrize(open.value)
    save()
    syncPrizes()
    return true
  }

  const isWaiting = item => outbox.value.some(movement => movement.id === item.id)

  // The sheet closed: once every prize is picked, the round is over and Picked starts empty next time
  const endRound = () => {
    if (!open.value.count) picks.value = []
  }

  return { openPrizes: open, picks, outbox, addOpenPrizes, pick, undo, isWaiting, endRound, syncPrizes, startPrizeSync }
}
```

- [ ] **Step 4: Create the picker**

Create `components/GatchaPrizeSheet.vue`:

```vue
<template>
  <BottomSheet :open="open" :title="title" @update:open="$emit('update:open', $event)">
    <div class="space-y-4">
      <p v-if="allPicked" role="status" class="rounded-lg bg-income/10 px-3 py-2 text-sm font-medium text-income">All prizes picked</p>

      <template v-else>
        <div class="relative">
          <AppIcon name="search" class="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-muted" />
          <input v-model="query" type="text" class="input pl-9" placeholder="Search prizes..." aria-label="Search prizes" autocomplete="off">
        </div>

        <p v-if="!groups.length" class="text-sm text-ink-muted">
          {{ query.trim() ? 'No prizes match your search' : 'No prize articles in stock' }}
        </p>
        <section v-for="group in groups" :key="group.category.id" :aria-label="group.category.name">
          <h3 class="mb-1 text-xs font-medium uppercase tracking-wide text-ink-muted">{{ group.category.name }}</h3>
          <ul class="divide-y divide-line rounded-lg border border-line">
            <li v-for="article in group.articles" :key="article.id">
              <button
                type="button"
                class="flex min-h-[44px] w-full items-center justify-between gap-3 px-3 py-2 text-left hover:bg-muted focus:outline-none focus-visible:ring-2 focus-visible:ring-accent/50"
                @click="choose(article)"
              >
                <span class="min-w-0 break-words text-sm font-medium text-ink">{{ article.name }}</span>
                <span class="shrink-0 text-xs tabular-nums text-ink-muted">{{ article.stock }} left</span>
              </button>
            </li>
          </ul>
        </section>
      </template>

      <section v-if="picks.length" aria-label="Picked">
        <h3 class="mb-1 text-xs font-medium uppercase tracking-wide text-ink-muted">Picked</h3>
        <ul class="divide-y divide-line rounded-lg border border-line">
          <li v-for="item in picks" :key="item.id" class="flex items-center justify-between gap-2 py-1 pl-3 pr-1">
            <div class="min-w-0">
              <p class="break-words text-sm font-medium text-ink">{{ item.name }}</p>
              <p v-if="isWaiting(item)" class="text-xs text-ink-muted">Waiting to sync</p>
            </div>
            <BaseButton variant="ghost" :aria-label="`Undo ${item.name}`" @click="undoOne(item)">Undo</BaseButton>
          </li>
        </ul>
      </section>

      <BaseButton v-if="!allPicked" variant="secondary" block @click="$emit('update:open', false)">Later</BaseButton>
    </div>
  </BottomSheet>
</template>

<script setup>
import { ref, computed, watch, onBeforeUnmount } from 'vue'
import { useGatchaPrizes } from '~/composables/useGatchaPrizes'
import { prizeChoices } from '~/utils/gatcha'

const props = defineProps({
  open: { type: Boolean, default: false },
  // The catalog's articles, with the stock it shows
  articles: { type: Array, required: true },
  categories: { type: Array, required: true }
})
const emit = defineEmits(['update:open', 'picked', 'undone'])

// How long "All prizes picked" shows before the sheet closes
const CLOSE_AFTER_MS = 1200

const { openPrizes, picks, pick, undo, isWaiting, endRound } = useGatchaPrizes()

const query = ref('')
const allPicked = computed(() => openPrizes.value.count === 0 && picks.value.length > 0)
const title = computed(() => `Gatcha prizes · ${picks.value.length} of ${picks.value.length + openPrizes.value.count}`)
const groups = computed(() => prizeChoices({
  articles: props.articles,
  categories: props.categories,
  prizeCategories: openPrizes.value.categories,
  query: query.value
}))

const choose = (article) => {
  if (pick(article)) emit('picked', article.id)
}

const undoOne = (item) => {
  if (undo(item)) emit('undone', item.article)
}

// Every prize picked: say so, then close after a moment, unless an Undo opened one again meanwhile
let closeTimer = null
watch(allPicked, (done) => {
  clearTimeout(closeTimer)
  if (done && props.open) closeTimer = setTimeout(() => { if (allPicked.value) emit('update:open', false) }, CLOSE_AFTER_MS)
})

watch(() => props.open, (isOpen) => {
  if (isOpen) {
    query.value = ''
    return
  }
  clearTimeout(closeTimer)
  endRound()
})

onBeforeUnmount(() => clearTimeout(closeTimer))
</script>
```

Each prize category is a `<section aria-label>`, so it is a named region (tests find `Keychain`, `Mini Figure` and `Picked` by role). Every row is a full-width button of at least 44px.

- [ ] **Step 5: Wire the picker and the banner into the catalog**

In `pages/catalog.vue`:

1. Replace

```vue
        <div class="mb-4 space-y-3">
          <div class="relative">
```

with

```vue
        <div v-if="isOwner && openPrizes.count > 0" class="card mb-4 flex flex-wrap items-center justify-between gap-3 px-4 py-3" data-testid="gatcha-banner">
          <p class="min-w-0 text-sm font-medium text-ink">{{ prizeBanner }}</p>
          <BaseButton @click="isPrizeSheetOpen = true">Pick now</BaseButton>
        </div>

        <div class="mb-4 space-y-3">
          <div class="relative">
```

2. Replace

```vue
    <ArticleSheet
      v-model:open="isEditorOpen"
```

with

```vue
    <GatchaPrizeSheet
      v-if="isOwner"
      v-model:open="isPrizeSheetOpen"
      :articles="products"
      :categories="categories"
      @picked="id => changeStock(id, -1)"
      @undone="id => changeStock(id, 1)"
    />

    <ArticleSheet
      v-model:open="isEditorOpen"
```

3. Replace

```js
import { ref, computed, watch, onMounted, onBeforeUnmount } from 'vue'
import { useTransactions } from '~/composables/useTransactions'
```

with

```js
import { ref, computed, watch, nextTick, onMounted, onBeforeUnmount } from 'vue'
import { useTransactions } from '~/composables/useTransactions'
import { useGatchaPrizes } from '~/composables/useGatchaPrizes'
```

4. Replace

```js
import { isGatcha } from '~/utils/gatcha'
```

with

```js
import { isGatcha, prizesFor } from '~/utils/gatcha'
```

5. Replace

```js
const onStockChanged = (id, stock) => {
```

with

```js
// A prize picked (or undone) shows in the catalog's stock at once; the server follows when it syncs
const changeStock = (id, by) => {
  const product = products.value.find(item => item.id === id)
  if (product) product.stock = Math.max(0, Number(product.stock) + by)
}

const { openPrizes, addOpenPrizes, startPrizeSync } = useGatchaPrizes()
const isPrizeSheetOpen = ref(false)
const prizeBanner = computed(() => (openPrizes.value.count === 1 ? '1 gatcha prize to pick' : `${openPrizes.value.count} gatcha prizes to pick`))

const onStockChanged = (id, stock) => {
```

6. In `submitToBalance`, replace

```js
  const total = totalAmount.value
  const productNames = selectedProducts.value
```

with

```js
  const total = totalAmount.value
  // One prize per gatcha unit, picked right after the checkout
  const prizes = prizesFor(selectedProducts.value)
  const productNames = selectedProducts.value
```

and replace

```js
  isCartOpen.value = false
  toast(`Added ${formatCurrency(total)} to balance`)
}
```

with

```js
  isCartOpen.value = false
  toast(`Added ${formatCurrency(total)} to balance`)
  if (prizes.count) {
    addOpenPrizes(prizes)
    // Opens once the cart sheet has let go of the page
    nextTick(() => { isPrizeSheetOpen.value = true })
  }
}
```

`addTransaction` is not awaited (as before): it never throws and queues the sale when it cannot send it, so the picker opens after an offline checkout too.

7. Replace

```js
onMounted(() => {
  fetchProducts()
```

with

```js
onMounted(() => {
  fetchProducts()
  // Open prizes from earlier, and picks still waiting to sync (sent only with the owner's session)
  startPrizeSync()
```

`isOwner` is not settled yet in the page's `onMounted` (`app.vue` restores the session in its own `onMounted`, which runs after every child). So `startPrizeSync` runs for everyone, and the sync itself checks `pb.authStore.isValid`.

- [ ] **Step 6: Forget the open prizes on logout**

In `composables/useTransactions.js`, replace

```js
import { useInventory } from './useInventory'
```

with

```js
import { useInventory } from './useInventory'
import { forgetGatchaPrizes } from './useGatchaPrizes'
```

and in `forgetLocalData`, replace

```js
    // The calendar's offline copy goes with the rest of the owner's data
    forgetCopy(localStorage)
```

with

```js
    // The calendar's offline copy goes with the rest of the owner's data
    forgetCopy(localStorage)
    // So do the open gatcha prizes; prize movements still waiting stay queued like the sales
    forgetGatchaPrizes({ keepOutbox: keepQueue })
```

Logout calls `forgetLocalData()`, and *Clear All Local Data* calls `forgetLocalData({ keepQueue: false })` (`pages/settings.vue`), so both are covered.

- [ ] **Step 7: Run the tests to verify they pass**

Run: `npx playwright test tests/e2e/gatcha.spec.js tests/e2e/mobile.spec.js`
Expected: `85 passed`, `59 skipped` (the sweep skips itself on `chromium`), no failed tests.

Run: `npm run test:unit`
Expected: `tests 315`, `pass 315`, `fail 0` (`no-raw-colours` included).

Run: `npx playwright test`
Expected: `617 passed`, `79 skipped`, no failed tests.

- [ ] **Step 8: Commit**

```bash
git add composables/useGatchaPrizes.js components/GatchaPrizeSheet.vue pages/catalog.vue composables/useTransactions.js tests/e2e/gatcha.spec.js tests/e2e/mobile.spec.js
git commit -m "Pick gatcha prizes after the checkout, offline too, with open prizes kept on the device"
```

---

### Task 5: Reminder delivery, the run's log line and the status line

**Files:**
- Modify: `utils/pushHosts.js` (`pushHost`, `pushServiceName`)
- Modify: `server/utils/reminderJob.js` (`deliver`, `runReminderJob`, new `deviceProblem`, `runLogLine`, `deliveryProblem`, `reminderStatus`, `createReminderRunner`)
- Modify: `server/api/push/status.get.js` (`lastProblem`, `devices`), `server/api/push/test.post.js` (log line)
- Modify: `utils/push.js` (`statusText`), `components/NotificationSettings.vue` (reload the status after turning on or off)
- Test: `tests/unit/reminder-job.test.js`, `tests/unit/push.test.js`, `tests/e2e/fixtures.js` (notifier answer), `tests/e2e/notifications.spec.js`

**Interfaces:**
- Consumes: `isPushEndpointAllowed`, `dueReminders`, `markFor`, `messageFor` (unchanged); the notifier store `{ listConventions, listActiveArticles, listSubscriptions, deleteSubscription, markReminders }`.
- Produces:
  - `pushHost(endpoint) → string` (`'unknown host'` for an unreadable one) and `pushServiceName(host) → 'Google' | 'Apple' | 'Mozilla' | 'Microsoft' | 'A push service'`;
  - `deviceProblem(endpoint, error?) → { host, status }`, where status is the HTTP code as text, `'no answer'` or `'blocked'`;
  - `runReminderJob(...) → { sent, skipped, missed, failed, waiting, removed, removals: [{ host, status }], errors: [{ host, status }], stateErrors: string[] }`. `errors` used to be strings;
  - `runLogLine(summary) → string | null`, `deliveryProblem(summary) → string | null`;
  - `reminderStatus = { lastRun, lastError, lastProblem }`; the runner logs with `log.info` and `log.error`;
  - `GET /api/push/status` → `{ configured, feed, publicKey, lastRun, lastError, lastProblem, devices: number | null }`;
  - `statusText(status)` reads `devices` and `lastProblem`.

- [ ] **Step 1: Write the failing unit tests**

In `tests/unit/reminder-job.test.js`:

1. Replace the import line of `reminderJob.js` with

```js
import { runReminderJob, createReminderRunner, createPushSender, forgetSubscription, deviceProblem, runLogLine, deliveryProblem, PUSH_TTL_S } from '../../server/utils/reminderJob.js'
```

2. Replace

```js
const PHONE = { id: 'sub000000000001', endpoint: 'https://fcm.googleapis.com/fcm/send/phone', keys: { p256dh: 'p', auth: 'a' } }
const TABLET = { id: 'sub000000000002', endpoint: 'https://fcm.googleapis.com/fcm/send/tablet', keys: { p256dh: 'p', auth: 'a' } }
const remindersOf = (store, id) => store.db.conventions.find(item => item.id === id).reminders
```

with

```js
const PHONE = { id: 'sub000000000001', endpoint: 'https://fcm.googleapis.com/fcm/send/phone', keys: { p256dh: 'p', auth: 'a' } }
const TABLET = { id: 'sub000000000002', endpoint: 'https://fcm.googleapis.com/fcm/send/tablet', keys: { p256dh: 'p', auth: 'a' } }
const IPHONE = { id: 'sub000000000003', endpoint: 'https://web.push.apple.com/QGuiYsecret-device-token', keys: { p256dh: 'iphone-p256dh', auth: 'iphone-auth' } }
const remindersOf = (store, id) => store.db.conventions.find(item => item.id === id).reminders
// A log that keeps every line, and one that drops them
const recordingLog = () => {
  const lines = []
  return { lines, info: line => lines.push(line), error: line => lines.push(line) }
}
const QUIET = { info () {}, error () {} }
const EMPTY_SUMMARY = { sent: 0, skipped: 0, missed: 0, failed: 0, waiting: 0, removed: 0, removals: [], errors: [], stateErrors: [] }
```

3. In `'due reminders are sent to every device and recorded as sent'`, replace

```js
  assert.deepEqual(summary, { sent: 1, skipped: 0, missed: 0, failed: 0, removed: 0, errors: [], stateErrors: [] })
```

with

```js
  assert.deepEqual(summary, { ...EMPTY_SUMMARY, sent: 1 })
```

4. In `'a reminder no device could get stays unsent for the next run, and the error is reported'`, replace

```js
  assert.deepEqual(summary.errors, ['push 500'])
```

with

```js
  assert.deepEqual(summary.errors, [{ host: 'fcm.googleapis.com', status: '500' }])
```

5. Replace the whole test `'without any device a due reminder still counts as sent'` with:

```js
test('without any device a due reminder waits, until a device is registered or it is a day late', async () => {
  const store = fakeStore({ conventions: [convention('dokomi', 'interested', [reminder('r', 'custom', iso(10, 29, 9))])] })
  const summary = await runReminderJob({ store, send: fakeSend().send, now: NOW })
  assert.deepEqual(summary, { ...EMPTY_SUMMARY, waiting: 1 })
  assert.equal(remindersOf(store, 'dokomi')[0].sent_at, undefined)
  // Still waiting an hour later
  await runReminderJob({ store, send: fakeSend().send, now: local(10, 29, 10, 5) })
  assert.equal(remindersOf(store, 'dokomi')[0].sent_at, undefined)
  // A device turns notifications on: the next run sends it
  store.db.subscriptions.push(PHONE)
  const { sent, send } = fakeSend()
  await runReminderJob({ store, send, now: local(10, 29, 10, 10) })
  assert.equal(sent.length, 1)
  assert.equal(remindersOf(store, 'dokomi')[0].sent_at, local(10, 29, 10, 10).toISOString())

  // Nobody turned one on within a day: missed, as before
  const late = fakeStore({ conventions: [convention('dokomi', 'interested', [reminder('r', 'custom', iso(10, 29, 9))])] })
  await runReminderJob({ store: late, send: fakeSend().send, now: NOW })
  const missed = await runReminderJob({ store: late, send: fakeSend().send, now: local(10, 30, 9, 5) })
  assert.equal(missed.missed, 1)
  assert.deepEqual(remindersOf(late, 'dokomi')[0], reminder('r', 'custom', iso(10, 29, 9), { sent_at: local(10, 30, 9, 5).toISOString(), missed: true }))
})

test('when every device turns out to be gone the reminder waits, as with no devices', async () => {
  const store = fakeStore({
    conventions: [convention('dokomi', 'interested', [reminder('a', 'custom', iso(10, 29, 9)), reminder('b', 'custom', iso(10, 29, 9))])],
    subscriptions: [PHONE, IPHONE]
  })
  const summary = await runReminderJob({ store, send: fakeSend({ [PHONE.endpoint]: pushError(404), [IPHONE.endpoint]: pushError(410) }).send, now: NOW })
  assert.deepEqual(summary, {
    ...EMPTY_SUMMARY,
    waiting: 2,
    removed: 2,
    removals: [{ host: 'fcm.googleapis.com', status: '404' }, { host: 'web.push.apple.com', status: '410' }]
  })
  assert.deepEqual(store.db.subscriptions, [])
  assert.deepEqual(remindersOf(store, 'dokomi').map(item => item.sent_at), [undefined, undefined])
})

```

6. Replace the whole test `'a device failure is shown in the status line even though the run finished'` with:

```js
test('a device failure is shown in the status line even though the run finished', async () => {
  const store = fakeStore({ conventions: [convention('dokomi', 'interested', [reminder('r', 'custom', iso(10, 29, 9))])], subscriptions: [PHONE] })
  const status = { lastRun: null, lastError: null, lastProblem: null }
  const runner = createReminderRunner({ store, send: fakeSend({ [PHONE.endpoint]: pushError(500) }).send, status, log: QUIET })
  await runner.run(NOW)
  assert.deepEqual(status, { lastRun: NOW.toISOString(), lastError: null, lastProblem: 'Google answered 500 for a device' })
})
```

7. Replace the whole test `'a 410 device whose deletion answers 404 still marks the reminder'` with:

```js
test('a 410 device whose deletion answers 404 counts as removed, and the reminder waits for a device', async () => {
  const store = fakeStore({
    conventions: [convention('dokomi', 'interested', [reminder('r', 'custom', iso(10, 29, 9))])],
    subscriptions: [PHONE]
  })
  store.deleteSubscription = async () => { throw Object.assign(new Error('not found'), { status: 404 }) }
  const summary = await runReminderJob({ store, send: fakeSend({ [PHONE.endpoint]: pushError(410) }).send, now: NOW })
  assert.deepEqual([summary.sent, summary.waiting, summary.removed, summary.failed, summary.errors, summary.stateErrors], [0, 1, 1, 0, [], []])
  assert.equal(remindersOf(store, 'dokomi')[0].sent_at, undefined)
})
```

8. Replace the whole test `'the status line says whether a device or the saved reminder state failed'` with the block below. It contains that test and four new ones:

```js
test('the status line says whether a device or the saved reminder state failed', async () => {
  const conventions = [convention('dokomi', 'interested', [reminder('r', 'custom', iso(10, 29, 9))])]
  const device = { lastRun: null, lastError: null, lastProblem: null }
  await createReminderRunner({ store: fakeStore({ conventions, subscriptions: [PHONE] }), send: fakeSend({ [PHONE.endpoint]: pushError(500) }).send, status: device, log: QUIET }).run(NOW)
  assert.deepEqual([device.lastError, device.lastProblem], [null, 'Google answered 500 for a device'])

  const state = { lastRun: null, lastError: null, lastProblem: null }
  const store = fakeStore({ conventions, subscriptions: [PHONE] })
  store.markReminders = async () => { throw new Error('PocketBase is unreachable') }
  const log = recordingLog()
  await createReminderRunner({ store, send: fakeSend().send, status: state, log }).run(NOW)
  assert.equal(state.lastError, 'Could not save reminder state: PocketBase is unreachable')
  assert.deepEqual(log.lines, ['[reminders] sent 1, removed 0, failed 0', '[reminders] Could not save reminder state: PocketBase is unreachable'])
})

test('every run that sends, removes or fails writes one line with the push host and status only', async () => {
  const store = fakeStore({
    conventions: [convention('dokomi', 'interested', [reminder('r', 'custom', iso(10, 29, 9))])],
    subscriptions: [PHONE, IPHONE, TABLET]
  })
  const log = recordingLog()
  const send = fakeSend({ [PHONE.endpoint]: pushError(403), [IPHONE.endpoint]: pushError(410) }).send
  const runner = createReminderRunner({ store, send, status: { lastRun: null, lastError: null, lastProblem: null }, log })
  await runner.run(NOW)
  assert.deepEqual(log.lines, ['[reminders] sent 1, removed 1 (410 web.push.apple.com), failed 1 (403 fcm.googleapis.com)'])
  // Never the endpoint's path, the keys or the push service's own message
  for (const secret of ['/fcm/send', 'QGuiYsecret', 'iphone-p256dh', 'iphone-auth', 'push 403']) {
    assert.ok(!log.lines.join('\n').includes(secret), secret)
  }
  // A run with nothing to do writes nothing
  await runner.run(local(10, 29, 9, 10))
  assert.equal(log.lines.length, 1)
})

test('a run whose reminders wait for a device says so in its line', async () => {
  const log = recordingLog()
  const store = fakeStore({ conventions: [convention('dokomi', 'interested', [reminder('r', 'custom', iso(10, 29, 9))])] })
  await createReminderRunner({ store, send: fakeSend().send, status: { lastRun: null, lastError: null, lastProblem: null }, log }).run(NOW)
  assert.deepEqual(log.lines, ['[reminders] sent 0, removed 0, failed 0, waiting 1 (no device)'])
})

test('the last delivery problem stays on the status line until a later run delivers without one', async () => {
  const store = fakeStore({
    conventions: [convention('dokomi', 'interested', [reminder('a', 'custom', iso(10, 29, 9)), reminder('b', 'custom', iso(10, 29, 12))])],
    subscriptions: [IPHONE, PHONE]
  })
  const status = { lastRun: null, lastError: null, lastProblem: null }
  const runner = createReminderRunner({ store, send: fakeSend({ [IPHONE.endpoint]: pushError(410) }).send, status, log: QUIET })
  await runner.run(NOW)
  assert.equal(status.lastProblem, 'Apple answered 410 for a device; it was removed')
  // Nothing due: the problem stays
  await runner.run(local(10, 29, 9, 10))
  assert.equal(status.lastProblem, 'Apple answered 410 for a device; it was removed')
  // The next reminder reaches the phone without trouble
  await runner.run(local(10, 29, 12, 1))
  assert.equal(status.lastProblem, null)
})

test('device problems name the push service and its answer, never the address', () => {
  assert.deepEqual(deviceProblem(IPHONE.endpoint, pushError(410)), { host: 'web.push.apple.com', status: '410' })
  // A timeout or a dropped connection has no status code
  assert.deepEqual(deviceProblem(PHONE.endpoint, new Error('socket hang up https://fcm.googleapis.com/fcm/send/phone')), { host: 'fcm.googleapis.com', status: 'no answer' })
  // An address that is not a push service is removed without being contacted
  assert.deepEqual(deviceProblem('https://169.254.169.254/latest'), { host: '169.254.169.254', status: 'blocked' })
  assert.deepEqual(deviceProblem('not a url'), { host: 'unknown host', status: 'blocked' })

  const summary = problems => ({ ...EMPTY_SUMMARY, ...problems })
  assert.equal(deliveryProblem(summary({ errors: [{ host: 'fcm.googleapis.com', status: 'no answer' }] })), 'Google did not answer for a device')
  assert.equal(deliveryProblem(summary({ errors: [{ host: 'updates.push.services.mozilla.com', status: '413' }] })), 'Mozilla answered 413 for a device')
  assert.equal(deliveryProblem(summary({ removals: [{ host: 'wns2-par02p.notify.windows.com', status: '404' }] })), 'Microsoft answered 404 for a device; it was removed')
  assert.equal(deliveryProblem(summary({ removals: [{ host: '169.254.169.254', status: 'blocked' }] })), 'A device without a supported push service was removed')
  assert.equal(deliveryProblem(summary({ sent: 2 })), null)
  assert.equal(runLogLine(summary({ skipped: 3 })), null)
  assert.equal(runLogLine(summary({ missed: 1 })), '[reminders] sent 0, removed 0, failed 0, missed 1')
  // The same answer from the same service is listed once
  assert.equal(runLogLine(summary({ errors: [{ host: 'fcm.googleapis.com', status: '500' }, { host: 'fcm.googleapis.com', status: '500' }] })), '[reminders] sent 0, removed 0, failed 2 (500 fcm.googleapis.com)')
})
```

The other tests stay. `'the runner keeps the last run…'`, `'the runner never runs twice…'` and `'a run that hangs…'` pass a log with only `error`; their runs send nothing, so `log.info` is never called.

In `tests/unit/push.test.js`, append after the existing `statusText` test:

```js

test('the status line says when no device has notifications on, and the last delivery problem', () => {
  const lastRun = new Date(2026, 9, 14, 13, 5).toISOString()
  assert.equal(statusText({ configured: true, lastRun, lastError: null, devices: 0 }), 'No device has notifications on')
  assert.equal(statusText({ configured: true, lastRun: null, lastError: null, devices: 0 }), 'No device has notifications on')
  assert.equal(
    statusText({ configured: true, lastRun, lastError: null, lastProblem: 'Apple answered 410 for a device; it was removed', devices: 1 }),
    'Reminders last checked Wed 14 Oct, 13:05 · Apple answered 410 for a device; it was removed'
  )
  // The server could not count the devices: the usual line
  assert.equal(statusText({ configured: true, lastRun, lastError: null, lastProblem: null, devices: null }), 'Reminders last checked Wed 14 Oct, 13:05')
})
```

- [ ] **Step 2: Run them to verify they fail**

Run: `npm run test:unit`
Expected: `tests 296`, `pass 294`, `fail 2`:
- `tests/unit/reminder-job.test.js` as a whole: `SyntaxError: The requested module '../../server/utils/reminderJob.js' does not provide an export named 'deliveryProblem'`;
- `the status line says when no device has notifications on, and the last delivery problem`.

- [ ] **Step 3: Name the push host and its company**

Append to `utils/pushHosts.js` (it uses the file's existing `PUSH_HOST` constant):

```js

// The host of a push endpoint, for the server log and the status line. The rest of the address identifies
// the device and is never shown or logged.
export function pushHost (endpoint) {
  try {
    return new URL(endpoint).hostname.toLowerCase().replace(/\.+$/, '') || 'unknown host'
  } catch {
    return 'unknown host'
  }
}

const SERVICE_NAMES = [['.push.apple.com', 'Apple'], ['.push.services.mozilla.com', 'Mozilla'], ['.notify.windows.com', 'Microsoft']]

// "Apple answered 410 …": the company behind a push host, for the Settings status line
export function pushServiceName (host) {
  if (host === PUSH_HOST) return 'Google'
  return SERVICE_NAMES.find(([suffix]) => host.endsWith(suffix))?.[1] ?? 'A push service'
}
```

- [ ] **Step 4: Keep undelivered reminders waiting, and log each run**

In `server/utils/reminderJob.js`:

1. Replace

```js
import { isPushEndpointAllowed } from './access.js'
```

with

```js
import { isPushEndpointAllowed } from './access.js'
import { pushHost, pushServiceName } from '../../utils/pushHosts.js'
```

2. Replace everything from the line `// A device the push service no longer knows, or one whose endpoint is not a public https address: its` up to (not including) the line ``// web-push behind the job's `send`: VAPID details per call, so tests can pass a fake module`` with:

```js
// A device the push service no longer knows is deleted
const isGone = error => error?.statusCode === 404 || error?.statusCode === 410

// What the log and the status line say about one device: its push service's host and that service's
// answer ('blocked' for an address that is not a push service, 'no answer' when none came). Never the
// endpoint's path, its keys or an error message, which may quote them.
export const deviceProblem = (endpoint, error = null) => ({
  host: pushHost(endpoint),
  status: error ? (error.statusCode ? String(error.statusCode) : 'no answer') : 'blocked'
})

// Deleting a device that is already deleted is fine
export async function forgetSubscription (store, id) {
  try {
    await store.deleteSubscription(id)
  } catch (error) {
    if (error?.status !== 404) throw error
  }
}

async function forget ({ store, subscription, subscriptions, summary, problem }) {
  await forgetSubscription(store, subscription.id)
  subscriptions.splice(subscriptions.indexOf(subscription), 1)
  summary.removed++
  summary.removals.push(problem)
}

// Sends one message to every device: 'sent' when at least one got it, 'failed' when one could not be
// reached (it is tried again next run), 'waiting' when there was no device left to send to. A device whose
// push service answers 404 or 410, or whose address is not a push service, is deleted.
async function deliver ({ store, send, subscriptions, message, summary }) {
  let delivered = 0
  let failed = 0
  for (const subscription of [...subscriptions]) {
    try {
      if (!isPushEndpointAllowed(subscription.endpoint)) {
        await forget({ store, subscription, subscriptions, summary, problem: deviceProblem(subscription.endpoint) })
        continue
      }
      await send(subscription, message)
      delivered++
    } catch (error) {
      if (isGone(error)) {
        try {
          await forget({ store, subscription, subscriptions, summary, problem: deviceProblem(subscription.endpoint, error) })
        } catch (deleteError) {
          failed++
          summary.stateErrors.push(deleteError?.message || String(deleteError))
        }
      } else {
        failed++
        summary.errors.push(deviceProblem(subscription.endpoint, error))
      }
    }
  }
  if (delivered > 0) return 'sent'
  return failed > 0 ? 'failed' : 'waiting'
}

// Returns { sent, skipped, missed, failed, waiting, removed, removals, errors, stateErrors }:
// - `waiting` reminders found no device (none registered, or every one turned out gone) and stay unsent;
// - `failed` reminders could not reach a device and stay unsent;
// - `removals` and `errors` are the devices deleted and the devices that could not be reached ({ host, status });
// - `stateErrors` are PocketBase failures (deleting a device, saving the marks).
// An unsent reminder is tried again on every run until it is 24 hours late and counts as missed.
// The marks of a convention are written right after its pushes, so a failed write for one convention
// never makes the others go out twice.
export async function runReminderJob ({ store, send, now = new Date() }) {
  const summary = { sent: 0, skipped: 0, missed: 0, failed: 0, waiting: 0, removed: 0, removals: [], errors: [], stateErrors: [] }
  const due = dueReminders(await store.listConventions(), now)
  if (!due.length) return summary
  const sending = due.filter(item => item.action === 'send')
  const articles = sending.some(item => item.reminder.kind === 'stock') ? await store.listActiveArticles() : []
  const subscriptions = sending.length ? await store.listSubscriptions() : []

  const byConvention = new Map()
  for (const item of due) byConvention.set(item.convention.id, [...(byConvention.get(item.convention.id) ?? []), item])
  for (const [id, items] of byConvention) {
    const marks = []
    for (const { convention, reminder, action } of items) {
      if (action === 'send') {
        const message = messageFor({ convention, reminder, articles, now })
        const outcome = await deliver({ store, send, subscriptions, message, summary })
        if (outcome !== 'sent') {
          summary[outcome]++
          continue
        }
        summary.sent++
      } else {
        summary[action === 'skip' ? 'skipped' : 'missed']++
      }
      marks.push({ id: reminder.id, at: reminder.at, ...markFor(action, now) })
    }
    if (!marks.length) continue
    try {
      await store.markReminders(id, marks)
    } catch (error) {
      summary.stateErrors.push(error?.message || String(error))
    }
  }
  return summary
}

const listed = problems => [...new Set(problems.map(({ status, host }) => `${status} ${host}`))].join(', ')

// The run's line in the server log, or null for a run that sent, removed, failed and left waiting nothing:
// "[reminders] sent 1, removed 1 (410 web.push.apple.com), failed 0"
export function runLogLine (summary) {
  const failed = summary.errors.length
  if (!summary.sent && !summary.removed && !failed && !summary.waiting && !summary.missed) return null
  const parts = [
    `sent ${summary.sent}`,
    `removed ${summary.removed}${summary.removed ? ` (${listed(summary.removals)})` : ''}`,
    `failed ${failed}${failed ? ` (${listed(summary.errors)})` : ''}`
  ]
  if (summary.waiting) parts.push(`waiting ${summary.waiting} (no device)`)
  if (summary.missed) parts.push(`missed ${summary.missed}`)
  return `[reminders] ${parts.join(', ')}`
}

// The run's delivery problem for the status line, or null: a device that could not be reached comes first
export function deliveryProblem (summary) {
  const failure = summary.errors.at(-1)
  if (failure) {
    const service = pushServiceName(failure.host)
    return failure.status === 'no answer' ? `${service} did not answer for a device` : `${service} answered ${failure.status} for a device`
  }
  const removal = summary.removals.at(-1)
  if (!removal) return null
  if (removal.status === 'blocked') return 'A device without a supported push service was removed'
  return `${pushServiceName(removal.host)} answered ${removal.status} for a device; it was removed`
}

// What Settings shows: the last finished run, the error of the latest run if it failed, and the last
// delivery problem until a later run delivers without one
export const reminderStatus = { lastRun: null, lastError: null, lastProblem: null }

// Runs the job, never two at once, and keeps the status. Every run that sends, removes, fails or waits
// writes one line to the log; a failure is logged and kept for the status line, and the next run simply
// tries again.
export function createReminderRunner ({ store, send, status = reminderStatus, log = console, capMs = RUN_CAP_MS }) {
  let running = null
  const run = (now = new Date()) => {
    if (running) return running
    let timer
    const cap = new Promise((resolve, reject) => {
      timer = setTimeout(() => reject(new Error('The reminder run took too long')), capMs)
    })
    running = Promise.race([runReminderJob({ store, send, now }), cap])
      .then((summary) => {
        status.lastRun = now.toISOString()
        const problem = deliveryProblem(summary)
        if (problem) status.lastProblem = problem
        else if (summary.sent) status.lastProblem = null
        status.lastError = summary.stateErrors.length ? `Could not save reminder state: ${summary.stateErrors[0]}` : null
        const line = runLogLine(summary)
        if (line) log.info(line)
        if (status.lastError) log.error(`[reminders] ${status.lastError}`)
        return summary
      })
      .catch((error) => {
        status.lastError = error?.message || String(error)
        log.error(`[reminders] ${status.lastError}`)
        return null
      })
      .finally(() => {
        clearTimeout(timer)
        running = null
      })
    return running
  }
  return { run, status }
}
```

`createPushSender`, the constants and `TEST_MESSAGE` stay as they are. `server/plugins/reminders.js` passes no `log`, so the runner uses `console`, and pm2 keeps `console.info` in the out log.

- [ ] **Step 5: Report the devices and the problem to Settings**

Replace the whole of `server/api/push/status.get.js` with:

```js
// GET /api/push/status: is push set up on the server, and how did the reminder job do?
// Unconfigured, it answers without asking PocketBase anything.
import { notifierSettings } from '../../utils/notifierSettings.js'
import { requireCaller } from '../../utils/requireCaller.js'
import { useNotifier } from '../../utils/notifier.js'
import { reminderStatus } from '../../utils/reminderJob.js'

export default defineEventHandler(async (event) => {
  const settings = notifierSettings(process.env)
  if (!settings.push) return { configured: false, feed: settings.feed }
  await requireCaller(event, settings)
  // How many devices get reminders; null when PocketBase can't say right now
  const devices = await useNotifier(settings).listSubscriptions().then(list => list.length, () => null)
  return {
    configured: true,
    feed: settings.feed,
    publicKey: settings.publicKey,
    lastRun: reminderStatus.lastRun,
    lastError: reminderStatus.lastError,
    lastProblem: reminderStatus.lastProblem,
    devices
  }
})
```

In `server/api/push/test.post.js`, replace

```js
import { createPushSender, forgetSubscription, TEST_MESSAGE } from '../../utils/reminderJob.js'
```

with

```js
import { createPushSender, deviceProblem, forgetSubscription, TEST_MESSAGE } from '../../utils/reminderJob.js'
```

and replace

```js
  } catch (error) {
    if (error?.statusCode === 404 || error?.statusCode === 410) {
      await forgetSubscription(store, subscription.id)
      throw createError({ statusCode: 410, statusMessage: 'This device has to turn notifications on again' })
    }
    throw createError({ statusCode: 502, statusMessage: 'The push service did not accept the notification' })
  }
```

with

```js
  } catch (error) {
    // Host and status only: the endpoint's path and keys never reach the log
    const { host, status } = deviceProblem(subscription.endpoint, error)
    if (error?.statusCode === 404 || error?.statusCode === 410) {
      await forgetSubscription(store, subscription.id)
      console.info(`[push] test: removed a device (${status} ${host})`)
      throw createError({ statusCode: 410, statusMessage: 'This device has to turn notifications on again' })
    }
    console.info(`[push] test: failed (${status} ${host})`)
    throw createError({ statusCode: 502, statusMessage: 'The push service did not accept the notification' })
  }
```

In `utils/push.js`, replace the whole `statusText` function (with its comment) with:

```js
// The status line under Notifications; '' while it loads. `devices` is null when the server can't tell.
export function statusText (status) {
  if (!status) return ''
  if (!status.configured) return "Notifications aren't configured on the server"
  if (status.devices === 0) return 'No device has notifications on'
  if (status.lastError) return `Last check failed: ${status.lastError}`
  if (!status.lastRun) return "Reminders haven't been checked yet"
  const checked = `Reminders last checked ${formatMoment(new Date(status.lastRun))}`
  return status.lastProblem ? `${checked} · ${status.lastProblem}` : checked
}
```

- [ ] **Step 6: Run the unit tests**

Run: `npm run test:unit`
Expected: `tests 321`, `pass 321`, `fail 0`.

Run the time-zone loop and the Node 20 run from Working setup.
Expected: `fail 0` three times; `# pass 321` and `# fail 0` on Node 20.

- [ ] **Step 7: Write the failing e2e tests**

In `tests/e2e/fixtures.js`, replace

```js
      notifier: { configured: false, feed: false, publicKey: TEST_VAPID_KEY, lastRun: null, lastError: null, secret: 'feedsecret', testStatus: 200, tests: [] }
```

with

```js
      // `devices` is the server's count of devices with notifications on (null: it could not tell), and
      // `lastProblem` the reminder job's last delivery problem.
      notifier: { configured: false, feed: false, publicKey: TEST_VAPID_KEY, lastRun: null, lastError: null, lastProblem: null, devices: null, secret: 'feedsecret', testStatus: 200, tests: [] }
```

and replace

```js
        return json(200, { configured: true, feed: state.feed, publicKey: state.publicKey, lastRun: state.lastRun, lastError: state.lastError })
```

with

```js
        return json(200, { configured: true, feed: state.feed, publicKey: state.publicKey, lastRun: state.lastRun, lastError: state.lastError, lastProblem: state.lastProblem, devices: state.devices })
```

`devices` stays `null` unless a test sets it, so the existing status-line tests keep their texts.

In `tests/e2e/notifications.spec.js`, directly above `test('blocked notifications explain how to allow them again'`, add:

```js
  test('with no device on the server the status line says so, until this device turns notifications on', async ({ page, api }) => {
    api.enable()
    Object.assign(api.notifier, { configured: true, lastRun: '2026-10-14T11:05:00.000Z', devices: 0 })
    await stubPush(page)
    await open(page)
    await expect(status(page)).toHaveText('No device has notifications on')
    // The server counts the new device once it is stored
    api.notifier.devices = 1
    await page.getByRole('button', { name: 'Turn on notifications on this device' }).click()
    await expect(page.getByText('Notifications are on for this device')).toBeVisible()
    await expect(status(page)).toHaveText('Reminders last checked Wed 14 Oct, 13:05')
    api.notifier.devices = 0
    await page.getByRole('button', { name: 'Turn off' }).click()
    await expect(status(page)).toHaveText('No device has notifications on')
  })

  test('the last delivery problem follows the last check', async ({ page, api }) => {
    api.enable()
    Object.assign(api.notifier, {
      configured: true,
      lastRun: '2026-10-14T11:05:00.000Z',
      lastProblem: 'Apple answered 410 for a device; it was removed',
      devices: 1
    })
    await stubPush(page)
    await open(page)
    await expect(status(page)).toHaveText('Reminders last checked Wed 14 Oct, 13:05 · Apple answered 410 for a device; it was removed')
  })

```

(The owner's phone is Android Chrome, so `fcm.googleapis.com`. The Apple text here is only the spec's example of a problem line.)

- [ ] **Step 8: Run them to verify they fail**

Run: `npx playwright test tests/e2e/notifications.spec.js`
Expected: 2 failed, 40 passed. `'with no device on the server the status line says so, until this device turns notifications on'` fails on both projects: the status is not loaded again after *Turn on*, so the line stays `No device has notifications on`. `'the last delivery problem follows the last check'` already passes, because Step 5 changed `statusText`.

- [ ] **Step 9: Reload the status after turning notifications on or off**

In `components/NotificationSettings.vue`, in `run`, replace

```js
  try {
    await action()
    if (done) toast(done)
  } catch (err) {
```

with

```js
  try {
    await action()
    if (done) toast(done)
    // Turning a device on or off changes "No device has notifications on"; a failed reload keeps the old line
    if (name !== 'test') await loadStatus().catch(() => {})
  } catch (err) {
```

- [ ] **Step 10: Run the tests to verify they pass**

Run: `npx playwright test tests/e2e/notifications.spec.js tests/e2e/settings.spec.js`
Expected: no failed tests; `notifications.spec.js` has 42 passed.

Run: `npm run test:unit`
Expected: `tests 321`, `pass 321`, `fail 0`.

Run: `npx playwright test`
Expected: `621 passed`, `79 skipped`, no failed tests.

- [ ] **Step 11: Commit**

```bash
git add utils/pushHosts.js server/utils/reminderJob.js server/api/push/status.get.js server/api/push/test.post.js utils/push.js components/NotificationSettings.vue tests/unit/reminder-job.test.js tests/unit/push.test.js tests/e2e/fixtures.js tests/e2e/notifications.spec.js
git commit -m "Keep reminders waiting while no device can get them, log each run and show the last delivery problem"
```

---

### Task 6: Register a device again when the server lost it, and the README

The owner saw "Notifications are on for this device" in Settings although PocketBase had no `push_subscriptions` record for the phone. The job then found 0 devices. `refreshState` derives "on" from the browser alone: permission plus a browser subscription with the current key. This task makes Settings check the server too, and puts a lost record back.

**Files:**
- Modify: `composables/usePushNotifications.js` (new `createRecord`, `ensureRegistered`; `refreshState({ checkServer })`; `turnOn` uses `createRecord`)
- Modify: `components/NotificationSettings.vue` (`load`)
- Modify: `README.md`
- Test: `tests/e2e/notifications.spec.js`

**Interfaces:**
- Consumes: `isPushEndpointAllowed`, `deviceName`; the owner's `pb` client; `loadStatus()`; the `devices` count from Task 5.
- Produces: `refreshState({ checkServer = false } = {}) → Promise<'' | 'recreated' | 'unregistered'>`. Without `checkServer` it behaves as before and returns `''`. Callers that ignore the result (`run`'s error path) are unaffected.

- [ ] **Step 1: Write the failing e2e tests**

In `tests/e2e/notifications.spec.js`:

1. Replace

```js
import { test, expect, gotoReady } from './fixtures.js'
```

with

```js
import { test, expect, gotoReady, TEST_VAPID_KEY } from './fixtures.js'
```

2. Replace

```js
const open = page => gotoReady(page, '/settings#notifications')
```

with

```js
const open = page => gotoReady(page, '/settings#notifications')
// The bytes of the server's key, for a browser subscription made with it
const CURRENT_KEY = [...Buffer.from(TEST_VAPID_KEY, 'base64url')]
```

3. Directly above `test('blocked notifications explain how to allow them again'`, add:

```js
  test('a device the browser has on but the server does not know is registered again on load', async ({ page, api }) => {
    api.enable()
    Object.assign(api.notifier, { configured: true })
    await stubPush(page, { permission: 'granted', existingKey: CURRENT_KEY })
    await open(page)
    await expect(page.getByText('Notifications are on for this device')).toBeVisible()
    await expect.poll(() => api.db.push_subscriptions.length).toBe(1)
    expect(api.db.push_subscriptions[0]).toMatchObject({ endpoint: ENDPOINT, keys: { p256dh: 'test-p256dh', auth: 'test-auth' } })
    await expect(page.getByRole('alert')).toHaveCount(0)
    // A second load finds the record and creates nothing
    await page.reload()
    await expect(page.getByText('Notifications are on for this device')).toBeVisible()
    expect(api.db.push_subscriptions).toHaveLength(1)
  })

  test('a device that cannot be registered again shows off, with a message', async ({ page, api }) => {
    api.enable()
    Object.assign(api.notifier, { configured: true })
    api.fail('push_subscriptions', 500)
    await stubPush(page, { permission: 'granted', existingKey: CURRENT_KEY })
    await open(page)
    await expect(page.getByRole('alert')).toHaveText("This device isn't registered on the server. Turn notifications on again.")
    await expect(page.getByRole('button', { name: 'Turn on notifications on this device' })).toBeVisible()
    await expect(page.getByText('Notifications are on for this device')).toHaveCount(0)
    expect(api.db.push_subscriptions).toEqual([])
  })

  test('a browser subscription outside the allowed push services is never registered', async ({ page, api }) => {
    api.enable()
    Object.assign(api.notifier, { configured: true })
    await stubPush(page, { permission: 'granted', existingKey: CURRENT_KEY, endpoint: 'https://push.example.com/x' })
    await open(page)
    await expect(page.getByRole('button', { name: 'Turn on notifications on this device' })).toBeVisible()
    expect(api.requests.filter(request => request.path.includes('push_subscriptions'))).toEqual([])
  })

  test('offline, the browser\'s own state is shown without asking the server', async ({ page, api }) => {
    api.enable()
    Object.assign(api.notifier, { configured: true })
    await stubPush(page, { permission: 'granted', existingKey: CURRENT_KEY })
    // The device reports no connection while Settings loads
    await page.addInitScript(() => Object.defineProperty(navigator, 'onLine', { configurable: true, get: () => false }))
    await open(page)
    await expect(page.getByText('Notifications are on for this device')).toBeVisible()
    expect(api.requests.filter(request => request.path.includes('push_subscriptions'))).toEqual([])
    expect(api.db.push_subscriptions).toEqual([])
  })
```

The stub's subscription uses `ENDPOINT` (`https://fcm.googleapis.com/fcm/send/test-device`), like the owner's Android Chrome phone.

- [ ] **Step 2: Run them to verify they fail**

Run: `npx playwright test tests/e2e/notifications.spec.js`
Expected: 6 failed, 44 passed. The first three new tests fail on both projects: Settings shows "on" from the browser alone, creates no record and shows no message. The offline test already passes, since offline Settings never asks the server.

- [ ] **Step 3: Check the server record when Settings loads**

In `composables/usePushNotifications.js`:

1. Replace the whole `refreshState` function, from `  // Works out this device's state; never throws` to its closing `  }`, with:

```js
  // Stores this device's subscription on the server. The endpoint is unique: a record that is already
  // there counts as stored. Any other failure throws.
  const createRecord = async (endpoint, keys) => {
    try {
      await pb.collection(SUBSCRIPTIONS).create({ endpoint, keys, device: deviceName(navigator.userAgent) })
    } catch (error) {
      if (!(error?.status === 400 && error.response?.data?.endpoint)) throw error
    }
  }

  // The browser can hold a subscription the server never stored (a save that was lost): it would look "on"
  // and get nothing. Re-creates the missing record; false when this device cannot be registered.
  const ensureRegistered = async (subscription) => {
    const { endpoint, keys } = subscription.toJSON()
    if (!isPushEndpointAllowed(endpoint)) return false
    const records = await pb.collection(SUBSCRIPTIONS).getFullList({ filter: pb.filter('endpoint = {:endpoint}', { endpoint }) })
    if (records.length) return true
    await createRecord(endpoint, keys)
    return 'recreated'
  }

  // Works out this device's state; never throws. With `checkServer` (Settings, online, as the owner) an
  // "on" device must also be on the server. Returns 'recreated' when its record was put back, and
  // 'unregistered' when that failed (the state is then 'off').
  const refreshState = async ({ checkServer = false } = {}) => {
    const supported = support()
    if (supported !== 'ok') {
      state.value = supported
      return ''
    }
    if (Notification.permission === 'denied') {
      state.value = 'denied'
      return ''
    }
    let subscription = null
    try {
      subscription = await currentSubscription()
    } catch {
      state.value = 'off'
      return ''
    }
    const on = !!subscription && usesCurrentKey(subscription) && Notification.permission === 'granted'
    if (!on || !checkServer || !navigator.onLine || !pb.authStore.isValid) {
      state.value = on ? 'on' : 'off'
      return ''
    }
    try {
      const registered = await ensureRegistered(subscription)
      state.value = registered ? 'on' : 'off'
      if (!registered) return 'unregistered'
      return registered === 'recreated' ? 'recreated' : ''
    } catch {
      state.value = 'off'
      return 'unregistered'
    }
  }
```

2. In `turnOn`, replace

```js
    try {
      await pb.collection(SUBSCRIPTIONS).create({ endpoint, keys, device: deviceName(navigator.userAgent) })
    } catch (error) {
      // The endpoint is unique: this device is already on the server
      if (!(error?.status === 400 && error.response?.data?.endpoint)) {
        // Not stored, so not on: don't leave a browser subscription the server doesn't know
        if (created) await subscription.unsubscribe().catch(() => {})
        throw error
      }
    }
```

with

```js
    try {
      await createRecord(endpoint, keys)
    } catch (error) {
      // Not stored, so not on: don't leave a browser subscription the server doesn't know
      if (created) await subscription.unsubscribe().catch(() => {})
      throw error
    }
```

In `components/NotificationSettings.vue`:

1. Replace

```js
const { toast } = useToast()
```

with

```js
const { toast } = useToast()

const UNREGISTERED = "This device isn't registered on the server. Turn notifications on again."
```

2. In `load`, replace

```js
    const current = await loadStatus()
    // The server's key is known now: a subscription made with another key is not "on"
    await refreshState()
```

with

```js
    const current = await loadStatus()
    // The server's key is known now: a subscription made with another key is not "on". An "on" device
    // must also be registered on the server; a missing record is put back
    const registration = await refreshState({ checkServer: current.configured })
    if (registration === 'unregistered') error.value = UNREGISTERED
    if (registration === 'recreated') await loadStatus().catch(() => {})
```

`load` returns before this when the device is offline, so offline Settings keeps the browser's own state. The check needs the owner's session (`pb.authStore.isValid`) and a configured server. It never creates a record for an endpoint outside the allowed push services. A record re-created on load counts for `devices`, which is why the status is loaded again.

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx playwright test tests/e2e/notifications.spec.js tests/e2e/settings.spec.js tests/e2e/auth.spec.js`
Expected: no failed tests; `notifications.spec.js` has 50 passed.

- [ ] **Step 5: Describe the release in the README**

In `README.md`:

1. In the table under "What Akinai does", replace

```markdown
| **Catalog and deals** | Articles with photos, categories with base prices, and the stock of each article. Cart deals ("Keychain 2 for 7", "Big items") are applied at checkout. Every stock change is recorded as a movement. |
```

with

```markdown
| **Catalog and deals** | Articles with photos, categories with base prices, and the stock of each article, set with one "Stock now" field. Cart deals ("Keychain 2 for 7", "Big items") are applied at checkout. A gatcha (an article with prize categories) asks for its prizes right after the checkout, also offline; the prizes' stock goes down, not the gatcha's. Every stock change is recorded as a movement. |
```

2. Directly above the line `## Credits`, after the convention calendar rollout and its paragraph on the calendar link, add:

```markdown
### Rollout: gatcha prizes and reminder delivery

Run these yourself, in this order.

1. **Schema.** Run `npm run pb:migrate`. The dry run should list only `add to "budget_tracket_catalog": prize_categories`. Then run `npm run pb:migrate -- --apply`. The rules do not change, so no `--apply-rules` is needed. Run it **before** the deploy: until the field exists, PocketBase ignores the prize categories the app saves.
2. **Deploy.** Push to `main`.
3. **The gatcha.** In the catalog, tap *Manage*, open GatchaPon, tick its prize categories and tap *Save changes*. Its card now shows `Gatcha`. Its own stock no longer changes. If it should not count in Reports → Stock value, set it to 0 once with *Stock now*.
4. **Notifications.** Open Settings → Notifications on the phone. A phone that showed "on" without a record on the server is registered again here. The status line should read `Reminders last checked …`, not `No device has notifications on`.
5. **The log.** Once a reminder is due, `pm2 logs budget-tracker` shows one line per run, for example `[reminders] sent 1, removed 0, failed 0`. While no device is registered, a due reminder waits (`waiting 1 (no device)`) instead of being used up, until it is more than 24 hours late.

```

- [ ] **Step 6: Run everything**

Run: `grep -c "prize_categories" README.md`
Expected: `1`.

Run: `npm run test:unit`
Expected: `tests 321`, `pass 321`, `fail 0`.

Run the time-zone loop and the Node 20 run from Working setup.
Expected: `fail 0` three times; `# pass 321` and `# fail 0` on Node 20.

Run: `npx playwright test`
Expected: `629 passed`, `79 skipped`, no failed tests.

- [ ] **Step 7: Commit**

```bash
git add composables/usePushNotifications.js components/NotificationSettings.vue tests/e2e/notifications.spec.js README.md
git commit -m "Register a device again when the server lost its record, and add the gatcha rollout to the README"
```

---

## Spec coverage

| Spec | Where |
|---|---|
| Success 1, gatcha article: Prize categories multi-select, gatcha = any prize category, price, deal and sale line as usual, no stock movement for the gatcha | Task 2 (`isGatcha`), Task 3 (sheet, checkout, e2e incl. the deal) |
| Success 2, picker after checkout (also offline): `Gatcha prizes · k of N`, list (active, stock > 0, grouped, sorted, stock shown), search, union of several gatchas, pick = `sale` −1 `Gatcha prize`, stock drops at once, Picked with Undo, undo before/after sync, `All prizes picked` and close, Later | Task 2 (`prizesFor`, `prizeChoices`, `prizeMovement`, `undoPick`), Task 4 (composable, sheet, e2e) |
| Success 3, open prizes: local storage as count plus categories, banner `N gatcha prizes to pick` with Pick now, adding up, cleared on logout | Task 2 (`addPrizes`, storage), Task 4 (banner, `forgetGatchaPrizes`, e2e) |
| Success 4, offline: queued and sent when the connection returns, device-made ids, `Waiting to sync` | Task 4 (outbox, `online` listener, e2e offline and lost reply) |
| Success 5, Stock now (printed above, correction below, `Stock unchanged`, `Enter how many are in stock now`, no note; starting stock and history unchanged) | Task 1 |
| Success 6, reminder delivery: no device waits, all gone waits, missed after 24 h, one log line with host and status, removed devices logged, status line (`No device has notifications on`, last delivery problem until the next good delivery) | Task 5; Task 6 (a device that only the browser had on) |
| Success 7, 375px, 44px, light and dark, semantic tokens | Task 4 (`mobile.spec.js` picker and banner, dark and light), all components use tokens (`no-raw-colours`) |
| Data model: `prize_categories` relation, multiple, optional, no cascade, `addFields` with the gap, rules unchanged | Task 2 (`pb-plan`, tests incl. "the prize categories change no access rules") |
| Reports and deals stay as they are | Task 2 (prize never a Top-article sale; runs out counts it), Task 3 (deal test) |
| Owner bug: "on" in Settings without a server record | Task 6 |
