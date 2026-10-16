# Card Payments on the SumUp Solo Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** The owner taps **Pay by card** in the cart or on Home, the total appears on the shop's SumUp Solo, and an approved card books the sale automatically, exactly once, exactly as *Add to Balance* would and marked as card; a declined, cancelled or failed payment books nothing; Reports split takings into card, cash and other.

**Architecture:**
- **Pure rules** live in plain ES modules and are unit-tested with `node:test`:
  - `utils/checkout.js` (new): the one booking of a sale (`checkoutBooking`, `homeBooking`, `saleTransaction`), shared by *Add to Balance*, the Home form and an approved card payment;
  - `utils/reports/common.js`, `marketDay.js`, `money.js`: the card / cash / other split;
  - `scripts/lib/pb-plan.mjs`: the `card_payments` collection, the two sale fields and the notifier's field-limited update rule;
  - `server/utils/sumup.js` (new): **the only module that talks to SumUp**, plain `fetch`, errors reduced to a kind and a status;
  - `server/utils/cardSettings.js` (new) and `server/utils/cardPayments.js` (new): the settings, the charge, the callback check, *Cancel on terminal*, the status mapping and the single-flight backup poll, with SumUp and PocketBase passed in.
- **Server** (Nitro, the existing pm2 process): `/api/card/{terminal,pair,unpair,charge,cancel,refresh}` (owner only, `requireCaller(…, { ownerOnly: true })`), `/api/card/callback/:id/:token` (per-payment token, constant time, body ignored) and `server/plugins/cardPayments.js`, which runs the 15 s backup poll.
  - **Two levels of configuration:** card payments work with the four `SUMUP_*` keys, `POCKETBASE_URL` and `OWNER_ID`: the owner's routes create and update the payment with the **owner's own token**, and the open sheet's `refresh` (every 2 s) asks SumUp for the result. With the notifier login as well (the server), the return URL and the backup poll settle payments nobody is watching.
  - A payment taken with a SumUp **sandbox** merchant (`sandbox: true`, asked once per process) is marked `[Sandbox] ` in SumUp and on the booked sale.
- **App:**
  - `composables/useCheckout.js` (new): `bookSale(booking, payment)` books the transaction and the gatcha prizes;
  - `composables/useCardPayments.js` (new): the card routes, `watch(id)` (refreshes the payment through the server every 2 s, reading the record when that fails), `bookPayment`/`bookApproved` (exactly once, by the payment's record id; pending payments are refreshed first);
  - `components/CardPaymentSheet.vue` (new), `components/CardTerminalSettings.vue` (new), the buttons in `components/CartPanel.vue` and `components/TransactionForm.vue`, and `components/reports/PaymentSplit.vue` (new).
- **Owner tooling:** `scripts/sumup-sandbox-check.mjs` (`npm run sumup:sandbox-check`), run only by hand against a SumUp **sandbox** account.
- **Tests:** unit tests inject a fake SumUp client and a fake store; e2e fakes `/api/card/*` in the browser (like `api.notifier` fakes the push routes) and runs against the in-memory fake PocketBase. Nothing automated ever reaches SumUp.

**Tech Stack:** Nuxt 3.21 / Vue 3.5 `<script setup>`, Nitro (h3), Tailwind 3.4 semantic tokens, PocketBase 0.22 with `pocketbase@0.21.5`, plain `fetch` to SumUp's Cloud API (no SumUp SDK), `node:test`, Playwright against the fake PocketBase.

**Spec:** `docs/superpowers/specs/2026-10-16-sumup-card-payments-design.md`

## Global Constraints

- **SumUp is never called by anything an implementer runs:** not live, not sandbox. Unit tests inject a fake client or a fake `fetch`; e2e fakes `/api/card/*` in the browser (`api.card` in `tests/e2e/fixtures.js`). The only code that may reach SumUp from a developer machine is `npm run sumup:sandbox-check`, and **only the owner runs it, or an implementer with the owner's explicit go in this session** (Task 7, Step 12).
- **Never read, print or `cat` `.env`** (it holds the owner's SumUp sandbox keys). Never print key values or tokens anywhere.
- **Never contact pocket.lasseharm.space.** Never run `pb:migrate` in any form, not even `--help` (`node --check` and the offline `planSchema` print in Task 1 are fine).
- **Never stop the `nuxt dev` server on :3000**, and never start a server that loads the repo's `.env` (`nuxt preview`, Playwright's `webServer`, a second `nuxt dev` in the repo). A scratch server runs only from a `git archive` copy **without** `.env` (Task 5, Step 9). If new Tailwind classes do not apply on :3000, `touch tailwind.config.js`.
- **Secrets:** `SUMUP_API_KEY`, `SUMUP_AFFILIATE_KEY`, the notifier password and callback tokens never go into `NUXT_PUBLIC_*`, a log line, an error message or a response. Server logs carry only the payment id, its status and SumUp's ids: `[card] <id> approved (TEENSK4W2K)`.
- **Strings** (verbatim from the spec): `Pay by card · <total>`, `Pay by card`, `Needs a connection`, `Waiting for card · <amount>`, `Cancel on terminal`, `Paid ✓`, `Card declined`, `Cancelled`, `The payment didn't go through`, `Still waiting for the terminal`, `Keep waiting`, `Card payment of <amount> booked`, `The terminal didn't answer. Check that it's on and online.`, `Pair terminal`, `Unpair`, `Card payments aren't configured on the server`, `Card`, `Cash`, `Other`.
- **Exactly once:** a card sale's `recordId` is its `card_payments` record id (15 characters, `[a-z0-9]`); it books from the booking stored with the payment, never from the live cart; `booked_transaction` is set after booking.
- **Payment method:** `card` (with `sumup_transaction`) for card payments; `cash` for *Add to Balance* in the cart and for income from the Home form; empty for commission income, expenses and older entries.
- **Data model (PocketBase 0.22):** `card_payments` as in the spec, created locked; `--apply-rules` opens it (list/view/update: owner or notifier; create/delete: owner). The notifier's update rule allows only `status`, `sumup_checkout`, `sumup_transaction`, through the `@request.data.<field>:isset = false` pattern used for conventions. `budget_tracker_transactions` gains `payment_method` (select `card`/`cash`, optional) and `sumup_transaction` (text, optional). Schema changes only through `scripts/pb-migrate.mjs`; `pocketbase/schema.json` is never edited by hand.
- **Stock** changes only as `stock_movements` (through `useInventory().applyMovements`, which `addTransaction` calls); never patch an article's `stock`.
- **Conventions:**
  - Vue 3 `<script setup>`; 2-space indent, single quotes, no semicolons; imports ordered Vue, components, composables, utilities.
  - Semantic colour tokens only (`surface`, `card`, `muted`, `line`, `ink`, `ink-muted`, `accent`, `income`, `expense`, `warning`); no raw gray/blue classes, no `dark:` classes, no `darkMode` ternaries. `tests/unit/no-raw-colours.test.js` enforces this.
  - 44px tap targets; 375px without horizontal scroll, light and dark; `formatCurrency()` for money.
  - Data access through the PocketBase SDK (`usePocketBase`), except the transaction POST that `useTransactions` already makes with `fetch`.
- **Unit tests also pass on Node 20** (`TZ=UTC npx -y node@20 --test tests/unit/*.test.js`) and in the default time zone, `Pacific/Auckland` and `Europe/Berlin`.
- **Git:** only `git add <files you changed>` and `git commit`. NEVER `git stash`, `reset`, `checkout`, `restore`, `clean`, `rebase` or `merge`. Commit messages end with `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.
- **Baselines before Task 1:** unit 334 pass; e2e (`npx playwright test`) 734 passed, 82 skipped, 0 failed.

## Review Focus

1. **The app closes, or loses signal, while the customer pays.** The approval arrives with nobody watching. Expected: the next start (or the connection's return) books it once, with `Card payment of <amount> booked`; a sale that already reached the server is only marked, never booked twice. *Pinned in Task 7: "the next start books it once, with a toast, and marks it booked", "a payment whose sale is already on the server is only marked booked", "one approved while offline is booked when the connection returns".*
2. ***Cancel on terminal* races a card that just went through.** Marking it cancelled would lose a paid sale. Expected: it ends `approved` and is booked; when there was nothing left to stop and SumUp has no result yet, the status stays pending for the poll. *Pinned in Task 4: "Cancel on terminal stops the checkout and records cancelled, or approved when the card went through".*
3. **A forged or replayed callback** (wrong token, unknown id, a body claiming success). Expected: 404 for a wrong token or id, and the body is never read: the status always comes from SumUp's transactions API. *Pinned in Task 4: "the callback needs the payment's own token; anything else is no match", "the callback token is stored as its hash and compared in constant time"; Task 5, Step 9: the scratch-server smoke test.*
4. **Amounts that are not clean euros** (`0.1 + 0.2`, `19.9`, `0`, `'12'`, `NaN`). Expected: the terminal gets whole cents (`30`, `1990`); zero, negative, non-numbers and absurd amounts are refused before anything reaches SumUp. *Pinned in Task 4: "a charge needs a known source, an amount above 0 and the booking, and always says Akinai sale".*
5. **A payment that never settles** (SumUp never heard of it, SumUp unreachable, the server restarted, or no notifier login on the laptop, so no return URL and no poll). Expected: the sheet asks after 120 s; its refresh keeps asking every 2 s and a failed refresh changes nothing; the next start refreshes pending payments; the server (with the notifier) keeps checking every 15 s and picks up pending payments after a restart; a payment is marked failed after 10 minutes unless SumUp says it is still pending. *Pinned in Task 4: "after 10 minutes a payment SumUp does not know is failed, unless SumUp says it is still pending", "refresh: … SumUp not answering is a safe 502 and changes nothing", "the poll is single-flight, checks at most 10 a run, and forgets settled payments"; Task 7: "after 120 s without a result it asks; Keep waiting waits on and the payment still lands", "one left pending (no return URL, no poll) is refreshed on the next start and booked once".*

## Decisions the spec leaves open

1. **Who writes the record.** The spec's charge route creates the record "through the notifier", but its rules make create owner-only. The owner's routes (charge, cancel, refresh) create and update it **with the caller's (owner's) own token** (`createOwnerStore`, PocketBase's REST API); updates still send only `status`, `sumup_checkout`, `sumup_transaction`. The notifier only reads and records SumUp's answer for the return URL and the poll. **Flag:** this is how both spec lines hold at once, and it is what lets the laptop work without the notifier.
2. **The client reference.** SumUp generates the reader checkout's `client_transaction_id` itself, so our record id travels as the affiliate's `foreign_transaction_id` (required by SumUp's schema). SumUp's `client_transaction_id` is stored in `sumup_checkout`. Results are looked up by `client_transaction_id` when known, else by `foreign_transaction_id` = our record id (both are documented query parameters of the transactions API).
3. **Status mapping** (SumUp transaction `status` → ours): `SUCCESSFUL` and `REFUNDED` → `approved`, `FAILED` → `declined`, `CANCELLED` → `cancelled`, `PENDING`, missing or unknown → still `pending`. `failed` is ours: SumUp refused or did not answer the charge, or 10 minutes passed without SumUp knowing the payment. **Flag:** SumUp's transactions API does not tell a declined card from other failures, and SumUp sends a terminated checkout as `failed`; a cancel **on the Solo itself** may therefore show `Card declined`. The sandbox checklist asks the owner to note which.
4. **`sumup_transaction`** stores SumUp's `transaction_code` (the code the SumUp app and the receipt show), else SumUp's `id`.
5. **What SumUp sees:** every checkout's description is `Akinai sale`, also from Home. Typed descriptions (which may name a customer) stay in Akinai.
6. **The return URL** is `https://<host>/api/card/callback/<record id>/<token>`, where `<host>` is the request's host (nginx passes `Host $host`). A host SumUp cannot reach (localhost, an IP address, a name without a dot) gets no return URL; the backup poll finds the result. The record stores the token's **SHA-256**, not the token, so reading the record never gives the URL away; the comparison hashes both sides and uses `timingSafeEqual` (`sameText`).
7. **Owner check.** The card routes use `requireCaller(event, settings, { ownerOnly: true })` (new option: the notifier is refused too). Like `/api/push/status`, `GET /api/card/terminal` answers `{ configured: false, paired: false, reader: null }` without a token when the server is not configured, so Settings can say so. The callback has no owner check (SumUp calls it).
8. **Configuration, decided by the owner: the in-app sandbox test runs on the laptop (`nuxt dev`).** `configured` (card payments work) needs the four `SUMUP_*` keys, `POCKETBASE_URL` and `OWNER_ID`; `SUMUP_API_URL` must be https, the merchant code letters and digits. `background` (return URL and backup poll) additionally needs `NOTIFIER_EMAIL` and `NOTIFIER_PASSWORD`; without them the callback answers 404, the poll does not start and the log says `[card] return URL and backup poll off, missing: NOTIFIER_EMAIL, NOTIFIER_PASSWORD`, nothing worse. The laptop's `.env` may hold the sandbox `SUMUP_*` keys, `POCKETBASE_URL` and `OWNER_ID` (no secrets), **never the notifier login**; the README's rule is narrowed to the real secrets (`NOTIFIER_*`, `VAPID_*`, `CALENDAR_SECRET`, live SumUp keys).
9. **Results without a return URL.** The open sheet calls `POST /api/card/refresh { id }` every 2 s: the server reads the payment with the owner's token, asks SumUp (same lookup and mapping as the poll) and writes a changed result with the owner's token. A refresh SumUp cannot answer is a safe 502 and changes nothing (the sheet then reads the record itself); the 10-minute rule applies as in the poll. **Flag (beyond the owner's brief):** on catalog/Home start and on `online`, the app also refreshes every still-pending payment before booking approved ones, so a payment whose sheet was closed on the laptop is settled and booked on the next start.
10. **The backup poll** (with the notifier login) runs in the built server and in `nuxt dev` when configured so; it asks nobody while nothing is pending. Every 15 s; at most 10 payments and 12 s per run; a run asked for during a run follows it (the callback uses this); payments left pending by a restart are listed once at start. Ten minutes after a payment's `created`, no answer or "unknown to SumUp" means `failed`; only SumUp saying `PENDING` keeps it open.
11. **Sandbox marker.** The server asks SumUp once per process whether the merchant is a sandbox (`GET /v1/merchants/{code}` → `sandbox: true`; a failed question counts as "no" and is asked again). A sandbox payment's `card_payments.description` and the booked sale's description get the prefix `[Sandbox] ` (the stored booking is marked at the charge), so the README can tell the owner exactly which test sales to delete.
12. ***Cancel on terminal*.** After SumUp accepts the terminate (it has no confirmation), the server looks the transaction up once: `SUCCESSFUL` → `approved` (booked), otherwise `cancelled`. When there was nothing to stop (SumUp answers 400/404/409: the customer already paid or cancelled), it records only a result SumUp already knows and otherwise leaves the payment pending for the poll. An offline reader keeps it pending and answers `The terminal didn't answer. Check that it's on and online.`
13. **Pairing.** The code is trimmed, spaces and dashes are removed and it is upper-cased; 8 or 9 letters and digits (SumUp's documented length), else `Enter the code the Solo shows` without asking SumUp. A code SumUp rejects (404, 400, 409, 422) → 400 `That code didn't work. Start pairing on the Solo again and enter the new code.` One terminal only: with one paired, pairing answers 409 `A terminal is already paired. Unpair it first.` The reader is named `Akinai`. A status SumUp cannot give shows `Status unknown`.
14. **Copy the spec does not give:** `Sending to the terminal...`, `Nothing was booked`, `Done`, `Close`, `Card payment` (sheet title), `Card terminal` (Settings section, subtitle `The SumUp Solo that takes card payments`, list entry `SumUp Solo for card payments`), `Pairing code`, the hint `On the Solo, open Connections → API → Connect: it shows the code. The code expires after 5 minutes.`, `Terminal paired`, `Terminal unpaired`, `Loading the terminal...`, `Online`, `Offline`, `Status unknown`, `Pair the terminal in Settings first`, `SumUp didn't answer. Try again.`, `Could not save the payment. Try again.`, `Could not read the payment. Try again.`, `Unknown payment`, the `[Sandbox] ` prefix, `Enter an amount above 0`, `Unknown payment source`, `Missing the sale to book`, `The cart is too large for one payment`, Reports cards `Takings by payment` / `Income by payment` with the note `Older entries and commission income count as Other`.
15. **The sheet** cannot be dismissed while the terminal has the payment (`BottomSheet` gets a `dismissible` prop: no close button, backdrop and Escape do nothing); with a sheet over another (the card sheet over Home's form) only the top one takes the keyboard. `Paid ✓` stays until **Done**; then Home's form closes, and in the cart a gatcha's prize picker opens. The charge request gives up after 45 s, so the sheet never spins for ever.
16. **The button offline.** The last known `configured`/`paired` flags are kept in `localStorage` (`akinai-card-terminal`, never the reader id), so *Pay by card* shows disabled with `Needs a connection` offline. The buttons reuse the terminal state for 5 minutes (each check asks SumUp twice); Settings always asks.
17. **Limits:** at most 10 000 € per card payment; the stored booking at most 200 kB (the json field's `maxSize`).
18. **Reports:** Market day and Money get a card listing Card, Cash and Other with their share in whole percent. **Flag:** the CSV export is unchanged.
19. **Test sales.** The laptop test books real entries into the production books (PocketBase is the same). **Flag:** they carry `[Sandbox] `, and the README tells the owner to delete them (sales, their stock movements, the card payments) afterwards.
20. **No SumUp SDK.** `@sumup/sdk` exists (pre-1.0), but Akinai needs seven calls; plain `fetch` adds no dependency, keeps every request visible in one 100-line module and is trivially faked in unit tests.

## SumUp API shapes

Checked on 2026-10-16 against SumUp's public documentation (developer.sumup.com: API reference *Readers*, *Transactions*, *Merchants*; guide *Cloud API*; the `@sumup/sdk` type reference on jsr.io). `server/utils/sumup.js` holds every request, so a correction touches one module and its test.

| Call | Shape used | Source |
|---|---|---|
| Auth | `Authorization: Bearer <SUMUP_API_KEY>`, base `https://api.sumup.com` | docs |
| Errors | `application/problem+json` `{ type, title, status, detail, instance? }`; reader offline: 422 with type `…/problem/reader-offline`, title `Reader Offline` (documented for terminate) | docs |
| Merchant | `GET /v1/merchants/{merchant_code}` → `{ …, sandbox: boolean }` (the `[Sandbox] ` marker and the sandbox check) | docs |
| List readers | `GET /v0.1/merchants/{code}/readers` → `{ items: [{ id (30 chars, rdr_…), name, status: unknown/processing/paired/expired, device: { identifier, model: solo/virtual-solo }, … }] }` | docs |
| Pair | `POST /v0.1/merchants/{code}/readers { pairing_code (8–9 chars), name }` → Reader; 404 no pending reader for the code; 409 not pending | docs |
| Status | `GET …/readers/{id}/status` → `{ data: { status: ONLINE/OFFLINE, state, battery_level, … } }` | docs |
| Unpair | `DELETE …/readers/{id}`; 404 when gone | docs |
| Checkout | `POST …/readers/{id}/checkout { total_amount: { value, currency: 'EUR', minor_unit: 2 }, description, return_url (https), affiliate: { app_id, key, foreign_transaction_id } }` → `{ data: { client_transaction_id } }`; reader must be online; 60 s to start | docs |
| Terminate | `POST …/readers/{id}/terminate`, no body, no confirmation; only while the reader waits for the cardholder | docs |
| Result | `GET /v2.1/merchants/{code}/transactions?client_transaction_id=…` (or `foreign_transaction_id=…`) → `{ id, transaction_code, status: SUCCESSFUL/CANCELLED/FAILED/PENDING/REFUNDED, … }`; 404 `{ error_code: 'NOT_FOUND', message }` | docs |
| Callback | POST to `return_url` with `{ id, event_type: 'solo.transaction.updated', payload: { client_transaction_id, merchant_code, status, failure_reason? }, timestamp }`; **not signed** | docs; Akinai never reads it |

**Not verified against the live sandbox:** a read-only sandbox probe was prepared during planning but blocked by the planning session's permissions, so every row above is from the documentation. **Assumptions for the owner's sandbox check (Task 7, Step 12):** that `foreign_transaction_id` finds the transaction of a reader checkout; that a checkout to an offline reader answers 422 `reader-offline`; which status a cancel on the Solo produces; that the sandbox uses `https://api.sumup.com` and its merchant has `sandbox: true`; that the Cloud API works for the owner's German merchant.

## Working setup

- **Dev server and e2e:**
  - A `nuxt dev` server serves this checkout on :3000 and Playwright reuses it (`reuseExistingServer`). Never stop it. Nitro picks up new and changed server routes and utils without a restart; a **new plugin** (`server/plugins/cardPayments.js`) starts only at the next restart, which is fine: the e2e tests never reach the server's card routes.
  - The first run after edits may hit cold-compile timeouts. Re-run a failing test once on its own before investigating. The full suite takes about three minutes.
- **Unit tests:** `npm run test:unit`, then the time zones and Node 20:

  ```bash
  for tz in "" Pacific/Auckland Europe/Berlin; do TZ=$tz node --test tests/unit/*.test.js 2>&1 | grep -E 'ℹ (tests|pass|fail) [0-9]+$'; done
  TZ=UTC npx -y node@20 --test tests/unit/*.test.js 2>&1 | grep -E '^# (tests|pass|fail)'
  ```

  All four must show `fail 0`.
- **e2e:**
  - `npx playwright test <files>` runs the `chromium` project (1280px) and `mobile` (Pixel 7). `mobile.spec.js` skips itself on `chromium`.
  - The fake PocketBase (`tests/e2e/fake-pocketbase.js`) holds exactly the posted body fields; records the app creates get `DEFAULTS`. Transactions posted by the app are in `api.posted`.
  - `context.setOffline(true/false)` fires the window `offline`/`online` events.
  - The card routes are answered by `api.card` (Task 6): `api.pairTerminal()` configures the server with a paired Solo; a charge creates its `card_payments` record (`pay000000000001`, `pay000000000002`, …) in the fake PocketBase; `api.settleCard(status, sumupTransaction)` records SumUp's result on the latest one, as the server would; `refresh` answers the record as stored (`api.card.refreshes` counts the calls, `refreshStatus` fails them, `onRefresh(payment)` plays SumUp's answer).
- **Modules:** `utils/` and `server/utils/` are plain ES modules with relative `.js` imports, so `node --test` loads them. Vue files import them as `~/utils/...`. Components under `components/` (top level) are auto-imported; `components/reports/*` are imported explicitly.
- **Snapshot:** `pocketbase/schema.json` is the live snapshot. The migration tests hold before and after the owner's `--apply` refreshes it.

## File map

| File | Responsibility | Task |
|---|---|---|
| `scripts/lib/pb-plan.mjs`, `scripts/pb-migrate.mjs`, `tests/unit/pb-plan.test.js` | `card_payments`, `payment_method`, `sumup_transaction`, the rules | 1 |
| `utils/checkout.js`, `tests/unit/checkout.test.js` | the one booking of a sale | 2 |
| `composables/useCheckout.js` | `bookSale`: transaction plus gatcha prizes | 2 |
| `utils/transactions.js`, `composables/useTransactions.js`, `tests/unit/transactions.test.js` | the payment method travels to and from the server | 2 |
| `pages/catalog.vue`, `components/TransactionForm.vue` | cash through the shared booking | 2 |
| `tests/e2e/catalog.spec.js`, `tests/e2e/transactions.spec.js`, `tests/e2e/commissions.spec.js` | cash, empty for expenses and commissions | 2 |
| `utils/reports/common.js`, `utils/reports/marketDay.js`, `utils/reports/money.js`, `tests/unit/reports.test.js` | the split | 3 |
| `components/reports/PaymentSplit.vue`, `components/reports/MarketDayReport.vue`, `components/reports/MoneyReport.vue`, `tests/e2e/reports.spec.js` | the split in Reports | 3 |
| `server/utils/cardSettings.js`, `server/utils/sumup.js`, `tests/unit/sumup.test.js` | settings and the SumUp client | 4 |
| `server/utils/cardPayments.js`, `server/utils/notifier.js`, `tests/unit/card-payments.test.js`, `tests/unit/reminder-job.test.js` | charge, callback, cancel, poll | 4 |
| `server/utils/requireCaller.js`, `tests/unit/require-caller.test.js` | `ownerOnly` | 5 |
| `server/utils/card.js`, `server/api/card/*.js` (incl. `refresh.post.js`), `server/api/card/callback/[id]/[token].post.js`, `server/plugins/cardPayments.js` | the routes, the refresh and the poll | 5 |
| `scripts/sumup-sandbox-check.mjs`, `package.json` | the owner's sandbox check | 5 |
| `composables/useCardPayments.js`, `components/CardTerminalSettings.vue`, `pages/settings.vue`, `utils/icons.js` | the card routes in the app, Settings → Card terminal | 6 |
| `tests/e2e/fake-pocketbase.js`, `tests/e2e/fixtures.js`, `tests/e2e/card-terminal.spec.js`, `tests/e2e/mobile.spec.js` | faked card routes, Settings e2e | 6 |
| `components/BottomSheet.vue`, `components/CardPaymentSheet.vue`, `components/CartPanel.vue`, `pages/catalog.vue`, `components/TransactionForm.vue`, `pages/index.vue` | Pay by card, the sheet, booking on start | 7 |
| `tests/e2e/card-payments.spec.js`, `tests/e2e/mobile.spec.js` | e2e for paying by card, 375px | 7 |
| `README.md`, `.env.example` | features, env, rollout, sandbox checklist | 7 |

---

### Task 1: The `card_payments` collection, the two sale fields and their rules

**Files:**
- Modify: `scripts/lib/pb-plan.mjs` (constants at the top, `rulesFor`, `planSchema`, `planRules`)
- Modify: `scripts/pb-migrate.mjs` (header, imports, `writeSnapshot`, `migrateRules` messages)
- Test: `tests/unit/pb-plan.test.js`

**Interfaces:**
- Consumes: nothing new.
- Produces:
  - `CARD_PAYMENTS = 'card_payments'` and `CARD_NOTIFIER_FIELDS = ['status', 'sumup_checkout', 'sumup_transaction']` exported from `scripts/lib/pb-plan.mjs` (Task 4's unit test compares the server's copy with this one);
  - `planSchema` creates `card_payments` (locked) and adds `payment_method`, `sumup_transaction` to `budget_tracker_transactions`, each only when missing;
  - `planRules` sets the `card_payments` rules, the notifier's update limited to the three fields; the "still allow the notifier" guard covers `card_payments` too.

- [ ] **Step 1: Write the failing tests**

In `tests/unit/pb-plan.test.js`:

Replace

```js
  TRANSACTIONS,
  CATEGORY_SEED,
```

with

```js
  TRANSACTIONS,
  CARD_PAYMENTS,
  CATEGORY_SEED,
```

In the test `'plans the new collections, article fields and optional price'`, replace

```js
    'createCollection:push_subscriptions',
    `addFields:${ARTICLES}`,
    `updateField:${ARTICLES}.price`,
    `addFields:${TRANSACTIONS}`
  ])
  assert.deepEqual(ops[7].fields.map(field => field.name), ['category', 'stock', 'low_stock_threshold', 'target_stock', 'prize_categories'])
```

with

```js
    'createCollection:push_subscriptions',
    `createCollection:${CARD_PAYMENTS}`,
    `addFields:${ARTICLES}`,
    `updateField:${ARTICLES}.price`,
    `addFields:${TRANSACTIONS}`
  ])
  assert.deepEqual(ops[8].fields.map(field => field.name), ['category', 'stock', 'low_stock_threshold', 'target_stock', 'prize_categories'])
```

In the test `'rules pin the owner record id, close sign-up first, and apply only once'`, replace

```js
    'setRules:conventions',
    'setRules:push_subscriptions'
  ])
```

with

```js
    'setRules:conventions',
    'setRules:push_subscriptions',
    `setRules:${CARD_PAYMENTS}`
  ])
```

Replace the whole test `'transactions gain an optional sale date, sale lines and sale time'` with:

```js
test('transactions gain an optional sale date, sale lines, sale time, payment method and SumUp transaction', () => {
  const op = planSchema(current()).find(item => item.op === 'addFields' && item.collection === TRANSACTIONS)
  assert.deepEqual(op.fields, [DATE_FIELD, ITEMS_FIELD, SOLD_AT_FIELD, PAYMENT_METHOD_FIELD, SUMUP_TRANSACTION_FIELD])
  assert.ok(new RegExp(DATE_FIELD.options.pattern).test('2026-10-14'))
  assert.equal(describeOp(op), `add to "${TRANSACTIONS}": date, items, sold_at, payment_method, sumup_transaction`)
})
```

Directly below the line `const SOLD_AT_FIELD = { name: 'sold_at', type: 'date', required: false, presentable: false, options: { min: '', max: '' } }`, add:

```js
const PAYMENT_METHOD_FIELD = { name: 'payment_method', type: 'select', required: false, presentable: false, options: { maxSelect: 1, values: ['card', 'cash'] } }
const SUMUP_TRANSACTION_FIELD = { name: 'sumup_transaction', type: 'text', required: false, presentable: false, options: { min: null, max: null, pattern: '' } }
```

Replace the whole test `'the live schema needs nothing beyond the commission payment fields'` with (it holds before and after the owner's `--apply` refreshes the snapshot):

```js
test('the live schema needs nothing beyond the card payments', () => {
  const hasCard = live().some(collection => collection.name === CARD_PAYMENTS)
  const ops = planSchema(live())
  assert.deepEqual(opKeys(ops), hasCard ? [] : [`createCollection:${CARD_PAYMENTS}`, `addFields:${TRANSACTIONS}`])
  assert.deepEqual(planSchema(simulate(live(), ops)), [])
})
```

In the test `'the notifier may read and update conventions and read and delete subscriptions, nothing else'`, replace

```js
  // Every other collection keeps the owner rules
  const others = ops.filter(op => !CALENDAR.includes(op.collection))
  assert.deepEqual(others, planRules(afterSchema, OWNER_ID).filter(op => !CALENDAR.includes(op.collection)))
```

with

```js
  // Every other collection keeps the owner rules (card payments: see below)
  const withNotifier = [...CALENDAR, CARD_PAYMENTS]
  const others = ops.filter(op => !withNotifier.includes(op.collection))
  assert.deepEqual(others, planRules(afterSchema, OWNER_ID).filter(op => !withNotifier.includes(op.collection)))
```

Append at the end of the file:

```js

// Card payments on the SumUp Solo (spec 2026-10-16)
const CARD_FIELDS = ['amount', 'description', 'source', 'cart', 'status', 'sumup_checkout', 'sumup_transaction', 'booked_transaction', 'callback_token']
const withoutCard = collections => withoutFields(collections.filter(collection => collection.name !== CARD_PAYMENTS), ['payment_method', 'sumup_transaction'])
// The notifier records SumUp's answer only: status, sumup_checkout and sumup_transaction
const CARD_NOTIFIER_UPDATE = `(${OWNER_EXPR}) || (${NOTIFIER_EXPR} && ${['amount', 'description', 'source', 'cart', 'booked_transaction', 'callback_token'].map(name => `@request.data.${name}:isset = false`).join(' && ')})`

test('card payments are created locked, with a required status and a 200 kB cart', () => {
  const op = planSchema(current()).find(item => item.op === 'createCollection' && item.name === CARD_PAYMENTS)
  const field = name => op.body.schema.find(f => f.name === name)
  assert.deepEqual(op.body.schema.map(f => [f.name, f.type, f.required]), [
    ['amount', 'number', true],
    ['description', 'text', false],
    ['source', 'select', false],
    ['cart', 'json', false],
    ['status', 'select', true],
    ['sumup_checkout', 'text', false],
    ['sumup_transaction', 'text', false],
    ['booked_transaction', 'text', false],
    ['callback_token', 'text', false]
  ])
  assert.deepEqual(field('amount').options, { min: 0.01, max: null, noDecimal: false })
  assert.deepEqual(field('source').options, { maxSelect: 1, values: ['cart', 'home'] })
  assert.deepEqual(field('status').options, { maxSelect: 1, values: ['pending', 'approved', 'declined', 'cancelled', 'failed'] })
  assert.deepEqual(field('cart').options, { maxSize: 200000 })
  assert.deepEqual(rulesOf(op.body), LOCKED_RULES)
})

test('without the card payment changes the live schema needs the collection and the two sale fields, and only once', () => {
  const before = withoutCard(upToDate())
  const ops = planSchema(before)
  assert.deepEqual(opKeys(ops), [`createCollection:${CARD_PAYMENTS}`, `addFields:${TRANSACTIONS}`])
  assert.deepEqual(ops[1].fields, [PAYMENT_METHOD_FIELD, SUMUP_TRANSACTION_FIELD])
  assert.equal(describeOp(ops[0]), `create collection "${CARD_PAYMENTS}" (${CARD_FIELDS.join(', ')})`)
  assert.equal(describeOp(ops[1]), `add to "${TRANSACTIONS}": payment_method, sumup_transaction`)
  assert.deepEqual(planSchema(simulate(before, ops)), [])
})

test('the notifier may read card payments and set only their status and SumUp ids; the owner does the rest', () => {
  const ruled = simulate(withoutCard(upToDate()), planRules(withoutCard(upToDate()), OWNER_ID, NOTIFIER_ID))
  const withCard = simulate(ruled, planSchema(ruled))
  const ops = planRules(withCard, OWNER_ID, NOTIFIER_ID)
  // Only the new collection's rules change
  assert.deepEqual(opKeys(ops), [`setRules:${CARD_PAYMENTS}`])
  assert.deepEqual(ops[0].rules, { listRule: OWNER_OR_NOTIFIER, viewRule: OWNER_OR_NOTIFIER, createRule: OWNER_EXPR, updateRule: CARD_NOTIFIER_UPDATE, deleteRule: OWNER_EXPR })
  for (const name of ['status', 'sumup_checkout', 'sumup_transaction']) assert.ok(!ops[0].rules.updateRule.includes(`@request.data.${name}:`), name)
  assert.deepEqual(planRules(simulate(withCard, ops), OWNER_ID, NOTIFIER_ID), [])
  // A field added to the live collection later is refused to the notifier too
  const grown = withCard.map(collection => collection.name === CARD_PAYMENTS
    ? { ...collection, schema: [...collection.schema, { name: 'tip', type: 'number' }] }
    : collection)
  assert.ok(planRules(grown, OWNER_ID, NOTIFIER_ID).find(op => op.collection === CARD_PAYMENTS).rules.updateRule.includes('@request.data.tip:isset = false'))
})

test('without a notifier card payments belong to the owner alone, and a later run without --notifier keeps it', () => {
  const afterSchema = simulate(current(), planSchema(current()))
  const ownerOnly = planRules(afterSchema, OWNER_ID).find(op => op.collection === CARD_PAYMENTS)
  assert.deepEqual(ownerOnly.rules, { listRule: OWNER_EXPR, viewRule: OWNER_EXPR, createRule: OWNER_EXPR, updateRule: OWNER_EXPR, deleteRule: OWNER_EXPR })
  // Only card payments still naming the notifier: dropping it silently is refused
  const cardOnly = simulate(afterSchema, [{ op: 'setRules', collection: CARD_PAYMENTS, rules: { listRule: OWNER_OR_NOTIFIER } }])
  assert.throws(() => planRules(cardOnly, OWNER_ID), new RegExp(`still allow the notifier ${NOTIFIER_ID}`))
})
```

- [ ] **Step 2: Run them to verify they fail**

Run: `node --test tests/unit/pb-plan.test.js`
Expected: the file fails as a whole: `SyntaxError: The requested module '../../scripts/lib/pb-plan.mjs' does not provide an export named 'CARD_PAYMENTS'`.

- [ ] **Step 3: Implement the plan**

In `scripts/lib/pb-plan.mjs`, replace

```js
export const TRANSACTIONS = 'budget_tracker_transactions'
```

with

```js
export const TRANSACTIONS = 'budget_tracker_transactions'
export const CARD_PAYMENTS = 'card_payments'
// The only card payment fields the server's notifier account may write
export const CARD_NOTIFIER_FIELDS = ['status', 'sumup_checkout', 'sumup_transaction']
```

Replace

```js
// The notifier only marks reminders sent, so its convention updates may set no field but `reminders`;
// the field list comes from the live collection, so a field added later is refused to it as well.
const rulesFor = (ownerId, notifierId = null, conventionFields = []) => {
  const O = ownerRule(ownerId)
  if (notifierId && notifierId === ownerId) throw new Error('The notifier must be a different account from the owner')
  const ON = notifierId ? `(${O}) || (${ownerRule(notifierId)})` : O
  const untouched = conventionFields.filter(name => name !== 'reminders').map(name => `@request.data.${name}:isset = false`)
  const notifierUpdate = notifierId ? `(${O}) || (${[ownerRule(notifierId), ...untouched].join(' && ')})` : O
```

with

```js
// The notifier only marks reminders sent, so its convention updates may set no field but `reminders`;
// the field list comes from the live collection, so a field added later is refused to it as well.
// Card payments work the same way: the notifier records SumUp's answer (status and SumUp's ids) and nothing else.
const rulesFor = (ownerId, notifierId = null, conventionFields = [], cardFields = []) => {
  const O = ownerRule(ownerId)
  if (notifierId && notifierId === ownerId) throw new Error('The notifier must be a different account from the owner')
  const ON = notifierId ? `(${O}) || (${ownerRule(notifierId)})` : O
  // The owner may write anything; the notifier only an update that leaves every other field unset
  const limitedUpdate = (fields, allowed) => {
    if (!notifierId) return O
    const untouched = fields.filter(name => !allowed.includes(name)).map(name => `@request.data.${name}:isset = false`)
    return `(${O}) || (${[ownerRule(notifierId), ...untouched].join(' && ')})`
  }
```

Replace

```js
    conventions: { listRule: ON, viewRule: ON, createRule: O, updateRule: notifierUpdate, deleteRule: O },
    push_subscriptions: { listRule: ON, viewRule: ON, createRule: O, updateRule: null, deleteRule: ON }
  }
```

with

```js
    conventions: { listRule: ON, viewRule: ON, createRule: O, updateRule: limitedUpdate(conventionFields, ['reminders']), deleteRule: O },
    push_subscriptions: { listRule: ON, viewRule: ON, createRule: O, updateRule: null, deleteRule: ON },
    [CARD_PAYMENTS]: { listRule: ON, viewRule: ON, createRule: O, updateRule: limitedUpdate(cardFields, CARD_NOTIFIER_FIELDS), deleteRule: O }
  }
```

In `planSchema`, directly above the line `  const missing = []`, add:

```js
  // Card payments on the SumUp Solo: one record per payment, written by the server's card routes
  if (!byName(collections, CARD_PAYMENTS)) {
    ops.push({
      op: 'createCollection',
      name: CARD_PAYMENTS,
      body: {
        name: CARD_PAYMENTS,
        type: 'base',
        schema: [
          number('amount', { required: true, min: 0.01 }),
          text('description'),
          select('source', ['cart', 'home']),
          // What booking the sale needs: the cart's lines, deals, stock movements and gatcha prizes, or the Home form's fields
          json('cart', { maxSize: 200000 }),
          select('status', ['pending', 'approved', 'declined', 'cancelled', 'failed'], true),
          text('sumup_checkout'),
          text('sumup_transaction'),
          text('booked_transaction'),
          // SHA-256 of the return URL's per-payment secret, never the secret itself
          text('callback_token')
        ],
        indexes: [],
        ...LOCKED
      }
    })
  }

```

Replace

```js
    if (!findField(transactions, 'sold_at')) added.push(date('sold_at'))
    if (added.length)
```

with

```js
    if (!findField(transactions, 'sold_at')) added.push(date('sold_at'))
    // Card or cash; empty for commission income, expenses and older entries. A card sale also names SumUp's transaction
    if (!findField(transactions, 'payment_method')) added.push(select('payment_method', ['card', 'cash']))
    if (!findField(transactions, 'sumup_transaction')) added.push(text('sumup_transaction'))
    if (added.length)
```

In `planRules`, replace

```js
    for (const name of ['conventions', 'push_subscriptions']) {
```

with

```js
    for (const name of ['conventions', 'push_subscriptions', CARD_PAYMENTS]) {
```

and replace

```js
  const conventionFields = (byName(collections, 'conventions')?.schema ?? []).map(field => field.name)
  return Object.entries(rulesFor(ownerId, notifierId, conventionFields))
```

with

```js
  const fieldsOf = name => (byName(collections, name)?.schema ?? []).map(field => field.name)
  return Object.entries(rulesFor(ownerId, notifierId, fieldsOf('conventions'), fieldsOf(CARD_PAYMENTS)))
```

- [ ] **Step 4: The migration script names the new collection**

In `scripts/pb-migrate.mjs`, make these replacements:

- `// the convention calendar, gatcha prize categories and owner-only rules.` → `// the convention calendar, gatcha prize categories, card payments and owner-only rules.`
- `//                                      reminder account read conventions and push subscriptions (needs --owner)` → `//                                      reminder account read conventions, push subscriptions and card payments (needs --owner)`
- in the import list, `  TRANSACTIONS,` → `  TRANSACTIONS,` followed by a new line `  CARD_PAYMENTS,`
- in `writeSnapshot`, `'conventions', 'push_subscriptions', ARTICLES, TRANSACTIONS])` → `'conventions', 'push_subscriptions', CARD_PAYMENTS, ARTICLES, TRANSACTIONS])`
- in `migrateRules`, replace

  ```js
      ? `Notifier: ${notifier.email} (${notifier.id}), may read conventions and push subscriptions`
      : 'No --notifier: conventions and push subscriptions stay owner-only (the reminder job cannot read them)')
  ```

  with

  ```js
      ? `Notifier: ${notifier.email} (${notifier.id}), may read conventions, push subscriptions and card payments`
      : 'No --notifier: conventions, push subscriptions and card payments stay owner-only (reminders and card payments cannot work)')
  ```

  and

  ```js
      ? `Rules applied. Only the owner can write now; the notifier ${notifier.email} can read conventions, mark reminders sent and remove dead push subscriptions.`
  ```

  with

  ```js
      ? `Rules applied. Only the owner can write now; the notifier ${notifier.email} can read conventions, mark reminders sent, remove dead push subscriptions and record card payment results.`
  ```

Run: `node --check scripts/pb-migrate.mjs`
Expected: no output.

- [ ] **Step 5: Run the tests and print the offline plan**

Run: `npm run test:unit`
Expected: `tests 338`, `pass 338`, `fail 0`.

Then print what `--apply` will do against the live snapshot (offline, no network):

```bash
node --input-type=module -e "
import { readFileSync } from 'node:fs'
import { planSchema, planRules, simulate, describeOp } from './scripts/lib/pb-plan.mjs'
const live = JSON.parse(readFileSync('pocketbase/schema.json'))
const ops = planSchema(live)
ops.forEach(op => console.log(describeOp(op)))
planRules(simulate(live, ops), 'inkcup9s1klsdur', '5v501ljt410r70k').forEach(op => console.log(describeOp(op)))
"
```

Expected exactly:

```
create collection "card_payments" (amount, description, source, cart, status, sumup_checkout, sumup_transaction, booked_transaction, callback_token)
add to "budget_tracker_transactions": payment_method, sumup_transaction
set access rules on "card_payments"
```

Then the time zones and Node 20 (Working setup): all `fail 0`.

- [ ] **Step 6: Commit**

```bash
git add scripts/lib/pb-plan.mjs scripts/pb-migrate.mjs tests/unit/pb-plan.test.js
git commit -m "Plan the card_payments collection and the sale's payment method, with the notifier limited to SumUp's answer

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 2: One booking for every sale, and the payment method on it

**Files:**
- Create: `utils/checkout.js`, `composables/useCheckout.js`
- Modify: `utils/transactions.js` (`fromRecord`), `composables/useTransactions.js` (`postTransaction` body, `uploadOrphan`)
- Modify: `pages/catalog.vue` (imports, `pricedCart`, `submitToBalance`), `components/TransactionForm.vue` (`handleSubmit`)
- Test: `tests/unit/checkout.test.js` (new), `tests/unit/transactions.test.js`, `tests/e2e/catalog.spec.js`, `tests/e2e/transactions.spec.js`, `tests/e2e/commissions.spec.js`

**Interfaces:**
- Consumes: `priceCart` (`utils/deals.js`), `saleLines` (`utils/reports/lines.js`), `saleMovement`, `newRecordId` (`utils/inventory.js`), `isGatcha`, `prizesFor` (`utils/gatcha.js`), `localDate` (`utils/transactions.js`), `useTransactions().addTransaction`, `useGatchaPrizes().addOpenPrizes`.
- Produces:
  - `cartLines(products) → priceCart lines`;
  - `checkoutBooking({ products, pricedCart, deals, newId?, now? }) → { description, amount, date, items, sold_at, stockMovements, prizes }` (JSON-safe: Task 7 stores it in `card_payments.cart`);
  - `homeBooking({ description, amount, notes?, now? }) → { description, amount, notes, date }`;
  - `saleTransaction(booking, { paymentMethod: 'card' | 'cash', sumupTransaction?, recordId? }) → addTransaction input` (throws for another method);
  - `useCheckout().bookSale(booking, payment) → Promise` (the transaction, plus `addOpenPrizes(booking.prizes)` when it owes prizes);
  - history entries and posts carry `payment_method` and `sumup_transaction` when set.

- [ ] **Step 1: Write the failing unit tests**

Create `tests/unit/checkout.test.js`:

```js
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { priceCart } from '../../utils/deals.js'
import { formatCurrency as eur } from '../../utils/currency.js'
import { cartLines, checkoutBooking, homeBooking, saleTransaction } from '../../utils/checkout.js'

const KEYCHAIN = { id: 'cat-keychain', name: 'Keychain', base_price: 4 }
const GATCHA_CATEGORY = { id: 'cat-gatcha', name: 'GatchaPon', base_price: 4 }
const DEAL = { id: 'deal-key', name: 'Keychain 2 for 7', type: 'bundle', categories: ['cat-keychain'], min_qty: 2, price: 7 }
const article = (id, name, category, extra = {}) =>
  ({ id, name, category: category.id, expand: { category }, price: 0, stock: 5, prize_categories: [], ...extra })
const CART = [
  { ...article('k1', 'Pikachu Keychain', KEYCHAIN), quantity: 2 },
  { ...article('k2', 'Zubat Keychain', KEYCHAIN, { stock: 0 }), quantity: 1 },
  { ...article('g1', 'GatchaPon', GATCHA_CATEGORY, { prize_categories: ['cat-keychain'] }), quantity: 2 }
]
// Local time: the sale's day is the device's day
const NOW = new Date(2026, 9, 16, 23, 30)
let next = 0
const ids = () => `mv${String(++next).padStart(13, '0')}`
const book = () => {
  next = 0
  return checkoutBooking({ products: CART, pricedCart: priceCart(cartLines(CART), [DEAL]), deals: [DEAL], newId: ids, now: NOW })
}

test('a cart books its description, lines, deals, stock movements and gatcha prizes', () => {
  const booking = book()
  assert.equal(booking.description, `3D Printing Products:\nPikachu Keychain (${eur(4)} × 2)\nZubat Keychain (${eur(4)} × 1)\nGatchaPon (${eur(4)} × 2)\nDeals: Keychain 2 for 7 (−${eur(1)})`)
  assert.equal(booking.amount, 19)
  assert.equal(booking.date, '2026-10-16')
  assert.equal(booking.sold_at, NOW.toISOString())
  assert.deepEqual(booking.items.map(line => [line.article, line.quantity, line.lineTotal, line.discount, line.dealName]), [
    ['k1', 2, 8, 0.66, 'Keychain 2 for 7'],
    ['k2', 1, 4, 0.34, 'Keychain 2 for 7'],
    ['g1', 2, 8, 0, '']
  ])
  // The gatcha's own stock never moves; an article out of stock records its oversell
  assert.deepEqual(booking.stockMovements, [
    { id: 'mv0000000000001', article: 'k1', change: -2, reason: 'sale', note: '' },
    { id: 'mv0000000000002', article: 'k2', change: 0, reason: 'sale', note: 'oversold by 1' }
  ])
  assert.deepEqual(booking.prizes, { count: 2, categories: ['cat-keychain'] })
})

test('cash and card book the same sale; card adds SumUp and the payment id', () => {
  const booking = book()
  const cash = saleTransaction(booking, { paymentMethod: 'cash' })
  const card = saleTransaction(booking, { paymentMethod: 'card', sumupTransaction: 'TEENSK4W2K', recordId: 'pay000000000001' })
  const { prizes, ...sale } = booking
  assert.deepEqual(cash, { ...sale, payment_method: 'cash' })
  assert.deepEqual(card, { ...sale, payment_method: 'card', sumup_transaction: 'TEENSK4W2K', recordId: 'pay000000000001' })
  assert.throws(() => saleTransaction(booking, { paymentMethod: 'cheque' }), /Unknown payment method: cheque/)
})

test('a booking survives a JSON round trip unchanged, as stored with a card payment', () => {
  const booking = book()
  assert.deepEqual(JSON.parse(JSON.stringify(booking)), booking)
  assert.deepEqual(saleTransaction(JSON.parse(JSON.stringify(booking)), { paymentMethod: 'card' }), saleTransaction(booking, { paymentMethod: 'card' }))
})

test('the Home quick entry books its description, amount and notes on the device\'s day', () => {
  assert.deepEqual(homeBooking({ description: 'Market sale', amount: '25', notes: 'n', now: NOW }), { description: 'Market sale', amount: 25, notes: 'n', date: '2026-10-16' })
  assert.deepEqual(saleTransaction(homeBooking({ description: 'Print', amount: 12.5, now: NOW }), { paymentMethod: 'cash' }),
    { description: 'Print', amount: 12.5, notes: '', date: '2026-10-16', payment_method: 'cash' })
})
```

In `tests/unit/transactions.test.js`, directly above the test `'fromRecord uses the local calendar date of the UTC created stamp'`, add:

```js
test('fromRecord keeps the payment method and SumUp transaction, and leaves them out when empty', () => {
  const card = fromRecord({ id: 'c', description: 'Sale', amount: 19, created: '2026-10-16 10:00:00.000Z', payment_method: 'card', sumup_transaction: 'TEENSK4W2K' })
  assert.deepEqual([card.payment_method, card.sumup_transaction], ['card', 'TEENSK4W2K'])
  // PocketBase answers an unset select or text as ''
  const old = fromRecord({ id: 'o', description: 'Sale', amount: 19, created: '2026-10-16 10:00:00.000Z', payment_method: '', sumup_transaction: '' })
  assert.ok(!('payment_method' in old) && !('sumup_transaction' in old))
})

```

- [ ] **Step 2: Run them to verify they fail**

Run: `npm run test:unit`
Expected: `fail 2`: `checkout.test.js` as a whole (`Cannot find module '…/utils/checkout.js'`) and `'fromRecord keeps the payment method and SumUp transaction, and leaves them out when empty'`.

- [ ] **Step 3: Write the booking module**

Create `utils/checkout.js`:

```js
// The booking of a sale, shared by Add to Balance (cash) and Pay by card, so the two can never drift apart.
// A card payment stores its booking with the payment and books exactly that once the card is approved.
import { formatCurrency } from './currency.js'
import { effectivePrice } from './pricing.js'
import { saleLines } from './reports/lines.js'
import { saleMovement, newRecordId } from './inventory.js'
import { isGatcha, prizesFor } from './gatcha.js'
import { localDate } from './transactions.js'

export const PAYMENT_METHODS = ['card', 'cash']

const listPrice = product => effectivePrice(product, product.expand?.category)

// The cart's articles as priceCart lines; an article's own price (> 0) is an override that skips deals
export const cartLines = products => products.map(product => ({
  articleId: product.id,
  name: product.name,
  quantity: product.quantity,
  categoryId: product.category,
  // Stored on the sale's lines, so the reports can name the category even after it changes
  categoryName: product.expand?.category?.name ?? '',
  basePrice: product.expand?.category?.base_price ?? 0,
  override: Number(product.price) > 0 ? Number(product.price) : 0
}))

// A cart checkout: `products` are the cart's articles (quantity > 0, with the stock the catalog shows),
// `pricedCart` is priceCart(cartLines(products), deals). Movement ids are made here, so booking the same
// booking again (a retry, or a card payment booked on another device) never moves stock twice.
export function checkoutBooking ({ products, pricedCart, deals = [], newId = newRecordId, now = new Date() }) {
  const names = products
    .map(product => `${product.name} (${formatCurrency(listPrice(product))} × ${product.quantity})`)
    .join('\n')
  const dealNote = pricedCart.applied.length
    ? `\nDeals: ${pricedCart.applied.map(deal => `${deal.name} (−${formatCurrency(deal.saving)})`).join(', ')}`
    : ''
  return {
    description: `3D Printing Products:\n${names}${dealNote}`,
    amount: pricedCart.total,
    date: localDate(now),
    // The lines and the time of the sale for the reports: Σ lineTotal − Σ discount = amount
    items: saleLines(pricedCart, deals),
    sold_at: now.toISOString(),
    // Overselling is allowed: the movement deducts what is left and notes the rest.
    // A gatcha's own stock is never touched: the prizes picked for it are.
    stockMovements: products.filter(product => !isGatcha(product)).map(product => ({
      id: newId(),
      article: product.id,
      ...saleMovement(product.stock, product.quantity)
    })),
    // One prize per gatcha unit, picked right after the checkout
    prizes: prizesFor(products)
  }
}

// An income typed into the Home quick entry
export const homeBooking = ({ description, amount, notes = '', now = new Date() }) =>
  ({ description, amount: Number(amount), notes, date: localDate(now) })

// What addTransaction gets for a booking: cash, or card with SumUp's transaction and the card payment's
// record id as the sale's own id (so a second booking of the same payment is a duplicate the server refuses)
export function saleTransaction (booking, { paymentMethod, sumupTransaction = '', recordId = '' }) {
  if (!PAYMENT_METHODS.includes(paymentMethod)) throw new Error(`Unknown payment method: ${paymentMethod}`)
  const { prizes, ...sale } = booking
  return {
    ...sale,
    payment_method: paymentMethod,
    ...(sumupTransaction ? { sumup_transaction: sumupTransaction } : {}),
    ...(recordId ? { recordId } : {})
  }
}
```

In `utils/transactions.js`, in `fromRecord`, replace

```js
  ...(record.sold_at ? { sold_at: record.sold_at } : {}),
```

with

```js
  ...(record.sold_at ? { sold_at: record.sold_at } : {}),
  // Card or cash for Reports; empty on commission income, expenses and older entries
  ...(record.payment_method ? { payment_method: record.payment_method } : {}),
  ...(record.sumup_transaction ? { sumup_transaction: record.sumup_transaction } : {}),
```

- [ ] **Step 4: Run the unit tests**

Run: `npm run test:unit`
Expected: `tests 343`, `pass 343`, `fail 0`. Then the time zones and Node 20: all `fail 0`.

- [ ] **Step 5: Write the failing e2e assertions**

In `tests/e2e/catalog.spec.js`, test `'adds selected products to the balance as one transaction'`, replace

```js
    expect(api.posted[0].description).toContain('Phone Stand')

    // Cart is cleared afterwards
```

with

```js
    expect(api.posted[0].description).toContain('Phone Stand')
    // Add to Balance is a cash sale
    expect(api.posted[0].payment_method).toBe('cash')
    expect(api.posted[0].sumup_transaction).toBeUndefined()

    // Cart is cleared afterwards
```

In the test `'checks out from the cart sheet on phones'`, replace

```js
    expect(api.posted[0].amount).toBe(29)
    await expect(sheet).toHaveCount(0)
```

with

```js
    expect(api.posted[0].amount).toBe(29)
    expect(api.posted[0].payment_method).toBe('cash')
    await expect(sheet).toHaveCount(0)
```

In `tests/e2e/transactions.spec.js`, replace

```js
    expect(api.posted[0]).toMatchObject({ description: 'Market sale', amount: 25 })
```

with

```js
    // Income typed on Home is cash
    expect(api.posted[0]).toMatchObject({ description: 'Market sale', amount: 25, payment_method: 'cash' })
```

and in `'records expenses as negative amounts'` replace

```js
    expect(api.posted[0].amount).toBe(-7.5)
```

with

```js
    expect(api.posted[0].amount).toBe(-7.5)
    // An expense has no payment method
    expect(api.posted[0].payment_method).toBeUndefined()
```

In `tests/e2e/commissions.spec.js`, test `'Paid books one income with the customer name, its lines and time, and stores its id'`, directly below `    expect(api.posted[0].date).toMatch(/^\d{4}-\d{2}-\d{2}$/)` add:

```js
    // Commission income has no payment method (it is paid outside the stall)
    expect(api.posted[0].payment_method).toBeUndefined()
```

- [ ] **Step 6: Run them to verify they fail**

Run: `npx playwright test tests/e2e/catalog.spec.js tests/e2e/transactions.spec.js`
Expected: 4 failures, each on the payment method (`Received: undefined`): `'adds selected products to the balance as one transaction'` (chromium), `'checks out from the cart sheet on phones'` (mobile) and `'adds an income transaction and syncs it to the API'` (both projects). The expense and commission assertions already pass.

- [ ] **Step 7: Send the payment method, and book through the shared booking**

In `composables/useTransactions.js`, in `postTransaction`, replace

```js
          items: Array.isArray(data.items) && data.items.length ? data.items : undefined,
          sold_at: data.sold_at || undefined
        })
```

with

```js
          items: Array.isArray(data.items) && data.items.length ? data.items : undefined,
          sold_at: data.sold_at || undefined,
          // Card or cash, and SumUp's transaction for a card sale; a server without these fields ignores them
          payment_method: data.payment_method || undefined,
          sumup_transaction: data.sumup_transaction || undefined
        })
```

In `uploadOrphan`, replace

```js
      await addTransaction({ description: entry.description, amount: entry.amount, notes: entry.notes || '', date: entry.date, items: entry.items, sold_at: entry.sold_at })
```

with

```js
      await addTransaction({ description: entry.description, amount: entry.amount, notes: entry.notes || '', date: entry.date, items: entry.items, sold_at: entry.sold_at, payment_method: entry.payment_method, sumup_transaction: entry.sumup_transaction })
```

Create `composables/useCheckout.js`:

```js
import { useTransactions } from './useTransactions'
import { useGatchaPrizes } from './useGatchaPrizes'
import { saleTransaction } from '~/utils/checkout'

// Books a sale: its transaction (sent now, or queued while offline) and, for a cart, the gatcha prizes it owes.
// Add to Balance, the Home form and an approved card payment all book through bookSale, so they book the same.
export const useCheckout = () => {
  const { addTransaction } = useTransactions()
  const { addOpenPrizes } = useGatchaPrizes()

  // payment: { paymentMethod: 'cash' | 'card', sumupTransaction?, recordId? }. Resolves once the sale is
  // stored on the server or queued; addTransaction never throws.
  const bookSale = (booking, payment) => {
    const done = addTransaction(saleTransaction(booking, payment))
    if (booking.prizes?.count) addOpenPrizes(booking.prizes)
    return done
  }

  return { bookSale }
}
```

In `pages/catalog.vue`:

Replace

```js
import { ref, computed, watch, nextTick, onMounted, onBeforeUnmount } from 'vue'
import { useTransactions } from '~/composables/useTransactions'
import { useGatchaPrizes } from '~/composables/useGatchaPrizes'
import { localDate } from '~/utils/transactions'
import { useArticles } from '~/composables/useArticles'
```

with

```js
import { ref, computed, watch, nextTick, onMounted, onBeforeUnmount } from 'vue'
import { useCheckout } from '~/composables/useCheckout'
import { useGatchaPrizes } from '~/composables/useGatchaPrizes'
import { useArticles } from '~/composables/useArticles'
```

Replace

```js
import { priceCart, describeDeal, dealForCategory } from '~/utils/deals'
import { saleLines } from '~/utils/reports/lines'
import { stockStatus, saleMovement, newRecordId } from '~/utils/inventory'
import { isGatcha, prizesFor } from '~/utils/gatcha'
```

with

```js
import { priceCart, describeDeal, dealForCategory } from '~/utils/deals'
import { cartLines, checkoutBooking } from '~/utils/checkout'
import { stockStatus } from '~/utils/inventory'
import { isGatcha } from '~/utils/gatcha'
```

Replace

```js
const { openPrizes, outbox: prizeOutbox, addOpenPrizes, startPrizeSync, syncedStocks, pendingChange } = useGatchaPrizes()
```

with

```js
const { openPrizes, outbox: prizeOutbox, startPrizeSync, syncedStocks, pendingChange } = useGatchaPrizes()
```

Replace the `cartLines` computed and `pricedCart` (from the comment `// Cart lines in the shape priceCart expects; …` through `const pricedCart = computed(() => priceCart(cartLines.value, deals.value))`) with:

```js
const pricedCart = computed(() => priceCart(cartLines(selectedProducts.value), deals.value))
```

Replace everything from `const { addTransaction } = useTransactions()` through the closing `}` of `submitToBalance` (the line before `// Ctrl/Cmd+F focuses search, Ctrl/Cmd+S focuses sort`) with:

```js
const { bookSale } = useCheckout()
const { toast } = useToast()

// The cart's booking, the same for Add to Balance and Pay by card
const currentBooking = () => checkoutBooking({ products: selectedProducts.value, pricedCart: pricedCart.value, deals: deals.value })

// A booked checkout on this page: the catalog's stock follows at once (the server's follows when the sale
// syncs), the cart empties, and the gatcha prizes are picked
const finishCheckout = (booking) => {
  const moved = new Set(booking.stockMovements.map(movement => movement.article))
  for (const line of booking.items) {
    const product = products.value.find(item => item.id === line.article)
    if (product && moved.has(line.article)) product.stock = Math.max(0, product.stock - line.quantity)
  }
  products.value.forEach((product) => { product.quantity = 0 })
  isCartOpen.value = false
  // Opens once the cart sheet has let go of the page
  if (booking.prizes.count) nextTick(() => { isPrizeSheetOpen.value = true })
}

const submitToBalance = () => {
  if (selectedProducts.value.length === 0) return
  const booking = currentBooking()
  bookSale(booking, { paymentMethod: 'cash' })
  finishCheckout(booking)
  toast(`Added ${formatCurrency(booking.amount)} to balance`)
}
```

(`isGatcha` stays imported: the card badge uses it. `priceOf` stays: the cards and the cart show it.)

In `components/TransactionForm.vue`:

Replace

```js
import { ref, watch, onBeforeUnmount } from 'vue'
import { useTransactions } from '~/composables/useTransactions'
import { localDate } from '~/utils/transactions'
```

with

```js
import { ref, watch, onBeforeUnmount } from 'vue'
import { useTransactions } from '~/composables/useTransactions'
import { useCheckout } from '~/composables/useCheckout'
import { localDate } from '~/utils/transactions'
import { homeBooking } from '~/utils/checkout'
```

Replace `const { addTransaction, isLoading } = useTransactions()` with:

```js
const { addTransaction, isLoading } = useTransactions()
const { bookSale } = useCheckout()
```

Replace

```js
  // addTransaction saves locally first and never throws; API failures surface via apiError
  await addTransaction({
    id: Date.now(),
    description: transactionDescription.value.trim(),
    amount: transactionType.value === 'expense' ? -amount : amount,
    date: localDate(),
    notes: transactionNotes.value
  })
```

with

```js
  // Both save locally first and never throw; API failures surface via apiError. Income typed here is cash
  // (Pay by card books its own); an expense has no payment method.
  if (transactionType.value === 'income') {
    await bookSale(homeBooking({ description: transactionDescription.value.trim(), amount, notes: transactionNotes.value }), { paymentMethod: 'cash' })
  } else {
    await addTransaction({ description: transactionDescription.value.trim(), amount: -amount, date: localDate(), notes: transactionNotes.value })
  }
```

- [ ] **Step 8: Run the e2e tests, with the checkout's neighbours**

Run: `npx playwright test tests/e2e/catalog.spec.js tests/e2e/transactions.spec.js tests/e2e/gatcha.spec.js tests/e2e/commissions.spec.js tests/e2e/deals.spec.js`
Expected: all pass (240 passed, 4 skipped). The gatcha and deals specs prove the shared booking still books lines, deals, stock movements and prizes as before.

- [ ] **Step 9: Commit**

```bash
git add utils/checkout.js composables/useCheckout.js utils/transactions.js composables/useTransactions.js pages/catalog.vue components/TransactionForm.vue tests/unit/checkout.test.js tests/unit/transactions.test.js tests/e2e/catalog.spec.js tests/e2e/transactions.spec.js tests/e2e/commissions.spec.js
git commit -m "Book every sale through one booking, and mark cart and Home income as cash

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 3: Card, cash and other in Reports

**Files:**
- Modify: `utils/reports/common.js`, `utils/reports/marketDay.js` (`dayReport`), `utils/reports/money.js` (`moneySeries`)
- Create: `components/reports/PaymentSplit.vue`
- Modify: `components/reports/MarketDayReport.vue`, `components/reports/MoneyReport.vue`
- Test: `tests/unit/reports.test.js`, `tests/e2e/reports.spec.js`

**Interfaces:**
- Consumes: entries with optional `payment_method` (Task 2's `fromRecord` keeps it in the cached list, so Money works offline too).
- Produces:
  - `paymentMethodOf(transaction) → 'card' | 'cash' | 'other'` and `paymentSplit(transactions) → { card, cash, other }` (euros, income only, added in cents) in `utils/reports/common.js`;
  - `dayReport(…).byMethod` and `moneySeries(…).incomeByMethod`, both `{ card, cash, other }`;
  - `<PaymentSplit :split prefix>` rendering `data-testid="<prefix>-card|cash|other"`.

- [ ] **Step 1: Write the failing unit tests**

In `tests/unit/reports.test.js`, in the test `'a day report adds takings, items and sales, per hour from sold_at or else created'`, replace

```js
  assert.deepEqual(dayReport({ transactions: TRANSACTIONS, day: '2026-10-10' }), {
    takings: 37, items: 3, sales: 1, perHour: Array.from({ length: 24 }, (_, hour) => (hour === 14 ? 37 : 0))
  })
```

with

```js
  assert.deepEqual(dayReport({ transactions: TRANSACTIONS, day: '2026-10-10' }), {
    takings: 37, items: 3, sales: 1, perHour: Array.from({ length: 24 }, (_, hour) => (hour === 14 ? 37 : 0)), byMethod: { card: 0, cash: 0, other: 37 }
  })
```

Append at the end of the file:

```js

// Card or cash (spec 2026-10-16): older entries and commission income count as Other
const paid = (id, date, amount, method, extra = {}) =>
  ({ id, description: `Sale ${id}`, amount, notes: '', date, ...(method ? { payment_method: method } : {}), ...extra })
const PAID = [
  paid('p1', '2026-10-14', 19.9, 'card', { sumup_transaction: 'TEENSK4W2K' }),
  paid('p2', '2026-10-14', 10.1, 'cash'),
  paid('p3', '2026-10-14', 0.1, 'cash'),
  // Commission income, and an unknown method from a hand-edited record
  paid('p4', '2026-10-14', 30, ''),
  paid('p5', '2026-10-14', 2, 'cheque'),
  // An expense paid by card is no takings
  paid('p6', '2026-10-14', -15, 'card'),
  paid('p7', '2026-10-13', 5, 'card'),
  paid('p8', '2026-09-30', 7, 'cash')
]

test('a market day splits its takings into card, cash and other, to the cent', () => {
  const report = dayReport({ transactions: PAID, day: '2026-10-14' })
  assert.deepEqual(report.byMethod, { card: 19.9, cash: 10.2, other: 32 })
  assert.equal(report.takings, 62.1)
  assert.deepEqual(dayReport({ transactions: PAID, day: '2026-10-01' }).byMethod, { card: 0, cash: 0, other: 0 })
})

test('money splits the period\'s income into card, cash and other, and only the period\'s', () => {
  const money = moneySeries({ transactions: PAID, range: MONTH, bucket: 'week' })
  assert.deepEqual(money.incomeByMethod, { card: 24.9, cash: 10.2, other: 32 })
  assert.equal(money.totals.income, 67.1)
  // The shared history has no payment methods yet: all of it is Other
  assert.deepEqual(moneySeries({ transactions: TRANSACTIONS, range: MONTH }).incomeByMethod, { card: 0, cash: 0, other: 114 })
  assert.deepEqual(moneySeries({ transactions: PAID, range: EMPTY }).incomeByMethod, { card: 0, cash: 0, other: 0 })
})
```

- [ ] **Step 2: Run them to verify they fail**

Run: `node --test tests/unit/reports.test.js`
Expected: 3 failures: the changed day report test (`byMethod` missing) and the two new tests (`undefined` instead of the split).

- [ ] **Step 3: Implement the split**

In `utils/reports/common.js`, replace

```js
// Expenses are negative amounts and never count as sales
export const isIncome = transaction => Number(transaction.amount) > 0
```

with

```js
// Expenses are negative amounts and never count as sales
export const isIncome = transaction => Number(transaction.amount) > 0

// How a sale was paid: card or cash; commission income and entries from before payment methods are Other
export const PAYMENT_SPLIT = ['card', 'cash', 'other']
export const paymentMethodOf = transaction =>
  (transaction.payment_method === 'card' || transaction.payment_method === 'cash' ? transaction.payment_method : 'other')

// Income in euros per payment method, added up in cents: { card, cash, other }. Expenses never count.
export function paymentSplit (transactions) {
  const cents = { card: 0, cash: 0, other: 0 }
  for (const transaction of transactions.filter(isIncome)) cents[paymentMethodOf(transaction)] += toCents(transaction.amount)
  return { card: toEuros(cents.card), cash: toEuros(cents.cash), other: toEuros(cents.other) }
}
```

In `utils/reports/marketDay.js`:
- `import { toCents, toEuros, isIncome, linesOf, saleTime } from './common.js'` → `import { toCents, toEuros, isIncome, linesOf, saleTime, paymentSplit } from './common.js'`
- the comment above `dayReport` gains a third line: `// takings into card, cash and other.` after changing its second line to `// (an old entry queued on this device) counts in the takings but in no hour. byMethod splits the`
- replace `  return { takings: toEuros(cents), items, sales: sales.length, perHour: hours.map(toEuros) }` with

  ```js
    return { takings: toEuros(cents), items, sales: sales.length, perHour: hours.map(toEuros), byMethod: paymentSplit(sales) }
  ```

In `utils/reports/money.js`:
- `import { toCents, toEuros, toDate } from './common.js'` → `import { toCents, toEuros, toDate, paymentSplit } from './common.js'`
- below `// last point is the balance at the end of the period. Japan is 10% of the period's income.` add `// incomeByMethod splits the period's income into card, cash and other.`
- replace

  ```js
    const dated = transactions
      .map(transaction => ({ at: toDate(transaction.date), cents: toCents(transaction.amount) }))
      .filter(transaction => transaction.at)
  ```

  with

  ```js
    const dated = transactions
      .map(transaction => ({ at: toDate(transaction.date), cents: toCents(transaction.amount), transaction }))
      .filter(transaction => transaction.at)
  ```

- replace

  ```js
      japan: toEuros(Math.round(income * 0.1))
    }
  ```

  with

  ```js
      japan: toEuros(Math.round(income * 0.1)),
      incomeByMethod: paymentSplit(dated.filter(item => item.at >= range.start && item.at < range.end).map(item => item.transaction))
    }
  ```

- [ ] **Step 4: Run the unit tests**

Run: `npm run test:unit`
Expected: `tests 345`, `pass 345`, `fail 0`. Then the time zones and Node 20: all `fail 0`. (`reports-csv.test.js` is unchanged: the CSV export does not list the split.)

- [ ] **Step 5: Write the failing e2e test**

In `tests/e2e/reports.spec.js`, directly above the test `'the Stock tab shows stock value, what runs out first, printed vs sold and commissions'`, add:

```js
  test('Market day and Money split the takings into card, cash and other', async ({ page, api }) => {
    await openReports(page, api, {
      before (api) {
        // 14 October: the 37 € sale by card, the 4 € sale in cash; everything older has no payment method
        const sale = id => api.db.budget_tracker_transactions.find(item => item.id === id)
        Object.assign(sale('tx0000000000005'), { payment_method: 'card', sumup_transaction: 'TEENSK4W2K' })
        Object.assign(sale('tx0000000000006'), { payment_method: 'cash' })
      }
    })
    await reportChip(page, 'Market day').click()
    const market = card(page, 'Takings by payment')
    await expect(market).toContainText('Older entries and commission income count as Other')
    await expect(page.getByTestId('market-card')).toContainText('37,00')
    await expect(page.getByTestId('market-cash')).toContainText('4,00')
    await expect(page.getByTestId('market-other')).toContainText('0,00')
    await expect(market).toContainText('90 %')

    await reportChip(page, 'Money').click()
    // 83 € income in October: 37 card, 4 cash, 12 + 30 from before payment methods
    await expect(page.getByTestId('money-card')).toContainText('37,00')
    await expect(page.getByTestId('money-cash')).toContainText('4,00')
    await expect(page.getByTestId('money-other')).toContainText('42,00')
  })

```

- [ ] **Step 6: Run it to verify it fails**

Run: `npx playwright test tests/e2e/reports.spec.js -g "split the takings"`
Expected: 2 failures (both projects), waiting for the `Takings by payment` card.

- [ ] **Step 7: Show the split**

Create `components/reports/PaymentSplit.vue`:

```vue
<template>
  <dl class="divide-y divide-line">
    <div v-for="row in rows" :key="row.id" class="flex items-center justify-between gap-3 px-4 py-3 md:px-5">
      <dt class="min-w-0 truncate text-sm text-ink">{{ row.label }}</dt>
      <dd class="shrink-0 text-sm tabular-nums">
        <span class="font-semibold text-ink" :data-testid="`${prefix}-${row.id}`">{{ formatCurrency(row.value) }}</span>
        <span v-if="row.share !== null" class="text-ink-muted"> · {{ row.share }} %</span>
      </dd>
    </div>
  </dl>
</template>

<script setup>
import { computed } from 'vue'
import { formatCurrency } from '~/utils/currency'

const props = defineProps({
  // paymentSplit(): { card, cash, other } in euros
  split: { type: Object, required: true },
  // data-testid prefix: `<prefix>-card`, `<prefix>-cash`, `<prefix>-other`
  prefix: { type: String, required: true }
})

const LABELS = { card: 'Card', cash: 'Cash', other: 'Other' }

const rows = computed(() => {
  const total = props.split.card + props.split.cash + props.split.other
  return Object.entries(LABELS).map(([id, label]) => ({
    id,
    label,
    value: props.split[id],
    // Whole percent of the total; none when there is nothing to split
    share: total > 0 ? Math.round((props.split[id] / total) * 100) : null
  }))
})
</script>
```

In `components/reports/MarketDayReport.vue`, replace

```vue
      <BaseCard title="Takings per hour" icon="chart">
```

with

```vue
      <BaseCard title="Takings by payment" subtitle="Older entries and commission income count as Other" icon="cash" flush>
        <PaymentSplit :split="report.byMethod" prefix="market" />
      </BaseCard>
      <BaseCard title="Takings per hour" icon="chart">
```

and below `import BarChart from '~/components/charts/BarChart.vue'` add `import PaymentSplit from '~/components/reports/PaymentSplit.vue'`.

In `components/reports/MoneyReport.vue`, replace

```vue
    <BaseCard title="Breakdown" icon="clipboard" flush>
```

with

```vue
    <BaseCard title="Income by payment" subtitle="Older entries and commission income count as Other" icon="cash" flush>
      <PaymentSplit :split="series.incomeByMethod" prefix="money" />
    </BaseCard>
    <BaseCard title="Breakdown" icon="clipboard" flush>
```

and below `import LineChart from '~/components/charts/LineChart.vue'` add `import PaymentSplit from '~/components/reports/PaymentSplit.vue'`.

- [ ] **Step 8: Run the e2e tests**

Run: `npx playwright test tests/e2e/reports.spec.js tests/e2e/mobile.spec.js -g "report|Market|Money|/reports"`
Expected: all pass, including `'every report tab fits at 375px with 44px targets'` (light and dark).

- [ ] **Step 9: Commit**

```bash
git add utils/reports/common.js utils/reports/marketDay.js utils/reports/money.js components/reports/PaymentSplit.vue components/reports/MarketDayReport.vue components/reports/MoneyReport.vue tests/unit/reports.test.js tests/e2e/reports.spec.js
git commit -m "Split Market day takings and Money income into card, cash and other

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 4: The SumUp client and the card payment rules on the server

**Files:**
- Create: `server/utils/cardSettings.js`, `server/utils/sumup.js`, `server/utils/cardPayments.js`
- Modify: `server/utils/notifier.js` (three card payment calls)
- Test: `tests/unit/sumup.test.js` (new), `tests/unit/card-payments.test.js` (new), `tests/unit/reminder-job.test.js`

**Interfaces:**
- Consumes: `notifierSettings(env)` (`server/utils/notifierSettings.js`), `sameText(a, b)` (`server/utils/access.js`), the notifier's `call()` wrapper.
- Produces:
  - `cardSettings(env) → { pocketbaseUrl, ownerId, email, password, apiKey, merchantCode, affiliateKey, appId, apiUrl, configured, background, missing, backgroundMissing }` (`configured`: SumUp keys, `POCKETBASE_URL`, `OWNER_ID`; `background`: also the notifier login; the lists hold names only);
  - `createSumUpClient({ apiKey, merchantCode, apiUrl, affiliate: { appId, key }, fetch?, timeoutMs? })` with `getMerchant()`, `listReaders()`, `createReader({ pairingCode, name })`, `deleteReader(id)`, `readerStatus(id)`, `checkout(readerId, { cents, description, returnUrl, foreignId }) → { client_transaction_id }`, `terminate(readerId)`, `findTransaction({ clientTransactionId?, foreignTransactionId? }) → transaction | null`; errors are `SumUpError { kind, status }`; `isUnreachable(error)`, `isSandboxMerchant(merchant)`;
  - from `server/utils/cardPayments.js`: the copy constants (`NOT_CONFIGURED`, `TERMINAL_UNREACHABLE`, `PAYMENT_FAILED`, `SUMUP_UNREACHABLE`, …), `CARD_POLL_MS`, `GIVE_UP_MS`, `READER_NAME`, `PAIRING_CODE`, `chargeInput(body)`, `statusFromTransaction`, `sumupTransactionOf`, `callbackUrl(host, id, token)`, `hashToken`, `tokenMatches`, `normalisePairingCode`, `terminalStatus({ sumup })`, `pairTerminal({ sumup, code })`, `unpairTerminal({ sumup })`, `markSandbox(input)`, `createSandboxCheck(sumup) → () => Promise<boolean>`, `startCharge({ input, sumup, store, host, isSandbox?, newToken?, log? }) → { id }`, `checkPayment(…) → status`, `refreshPayment({ store, sumup, id, now?, log? }) → { payment }` (no `callback_token`; 404 unknown or not visible; safe 502 when SumUp does not answer, record unchanged), `callbackMatches({ store, id, token })`, `cancelCharge({ store, sumup, id }) → { status }`, `createCardPoller({ store, sumup, … }) → { track, run, loadPending, tracked }`, `createOwnerStore({ pocketbaseUrl, authorization, fetch? }) → { createCardPayment, getCardPayment, updateCardPayment }` (the caller's token; updates send only the three SumUp fields). A card payment store is `{ createCardPayment?, getCardPayment, updateCardPayment, listPendingCardPayments? }`: the owner's or the notifier's. Errors meant for the routes carry `{ statusCode, statusMessage }`;
  - the notifier gains `getCardPayment(id)`, `listPendingCardPayments()`, `updateCardPayment(id, patch)` (sends only `status`, `sumup_checkout`, `sumup_transaction`).

- [ ] **Step 1: Write the failing unit tests**

Create `tests/unit/sumup.test.js` (every value is made up; nothing reaches SumUp):

```js
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { createSumUpClient, SumUpError, isUnreachable, isSandboxMerchant } from '../../server/utils/sumup.js'
import { cardSettings } from '../../server/utils/cardSettings.js'

// Made-up values for the fakes: never a real key, never a real merchant
const KEY = 'test-api-key'
const AFFILIATE = { appId: 'com.example.akinai', key: 'test-affiliate-key' }
const READER = 'rdr_3MSAFM23CK82VSTT4BN6RWSQ65'

// A fetch that answers from a list of [status, body] replies (or throws an Error) and records every request
function fakeFetch (...replies) {
  const requests = []
  const fetch = async (url, options) => {
    requests.push({ url, method: options.method, headers: options.headers, body: options.body ? JSON.parse(options.body) : undefined, signal: options.signal })
    const reply = replies.shift() ?? [200, null]
    if (reply instanceof Error) throw reply
    const [status, body] = reply
    return { ok: status >= 200 && status < 300, status, text: async () => (body === null ? '' : JSON.stringify(body)) }
  }
  return { fetch, requests }
}
const client = fetch => createSumUpClient({ apiKey: KEY, merchantCode: 'MH4H92C7', apiUrl: 'https://api.sumup.test', affiliate: AFFILIATE, fetch })
const problem = (status, title, type = 'https://developer.sumup.com/problem/x') => ({ type, title, status, detail: title })

test('every request carries the API key as a Bearer token, a time limit and the merchant in the path', async () => {
  const { fetch, requests } = fakeFetch([200, { items: [{ id: READER, name: 'Akinai', status: 'paired', device: { identifier: 'S1', model: 'solo' } }] }])
  const readers = await client(fetch).listReaders()
  assert.deepEqual(readers.map(reader => reader.status), ['paired'])
  assert.equal(requests[0].url, 'https://api.sumup.test/v0.1/merchants/MH4H92C7/readers')
  assert.equal(requests[0].method, 'GET')
  assert.equal(requests[0].headers.Authorization, `Bearer ${KEY}`)
  assert.ok(requests[0].signal instanceof AbortSignal)
})

test('pairing posts the code and a name; unpairing deletes the reader; status reads data', async () => {
  const { fetch, requests } = fakeFetch([200, { id: READER, name: 'Akinai', status: 'processing' }], [200, null], [200, { data: { status: 'ONLINE', state: 'IDLE' } }])
  const sumup = client(fetch)
  assert.equal((await sumup.createReader({ pairingCode: 'AB12CD34', name: 'Akinai' })).id, READER)
  await sumup.deleteReader(READER)
  assert.deepEqual(await sumup.readerStatus(READER), { status: 'ONLINE', state: 'IDLE' })
  assert.deepEqual(requests.map(r => [r.method, r.url.replace('https://api.sumup.test/v0.1/merchants/MH4H92C7', '…')]), [
    ['POST', '…/readers'],
    ['DELETE', `…/readers/${READER}`],
    ['GET', `…/readers/${READER}/status`]
  ])
  assert.deepEqual(requests[0].body, { pairing_code: 'AB12CD34', name: 'Akinai' })
})

test('a checkout sends the amount in cents, the description, the return URL and the affiliate with our id', async () => {
  const { fetch, requests } = fakeFetch([201, { data: { client_transaction_id: 'b9f0e2a4-0000-4000-8000-000000000001' } }])
  const data = await client(fetch).checkout(READER, { cents: 1990, description: 'Akinai sale', returnUrl: 'https://akinai.example/api/card/callback/pay000000000001/t', foreignId: 'pay000000000001' })
  assert.equal(data.client_transaction_id, 'b9f0e2a4-0000-4000-8000-000000000001')
  assert.equal(requests[0].url, `https://api.sumup.test/v0.1/merchants/MH4H92C7/readers/${READER}/checkout`)
  assert.deepEqual(requests[0].body, {
    total_amount: { value: 1990, currency: 'EUR', minor_unit: 2 },
    description: 'Akinai sale',
    return_url: 'https://akinai.example/api/card/callback/pay000000000001/t',
    affiliate: { app_id: 'com.example.akinai', key: 'test-affiliate-key', foreign_transaction_id: 'pay000000000001' }
  })
  // No return URL (nuxt dev on localhost): the field is left out
  const second = fakeFetch([201, { data: {} }])
  await client(second.fetch).checkout(READER, { cents: 100, description: 'Akinai sale', returnUrl: null, foreignId: 'pay000000000002' })
  assert.ok(!('return_url' in second.requests[0].body))
})

test('terminate posts to the reader without a body', async () => {
  const { fetch, requests } = fakeFetch([204, null])
  await client(fetch).terminate(READER)
  assert.deepEqual([requests[0].method, requests[0].url, requests[0].body], ['POST', `https://api.sumup.test/v0.1/merchants/MH4H92C7/readers/${READER}/terminate`, undefined])
})

test('a transaction is looked up by client transaction id, else by our id; not found is null', async () => {
  const { fetch, requests } = fakeFetch([200, { id: 'tx-uuid', transaction_code: 'TEENSK4W2K', status: 'SUCCESSFUL' }], [404, { error_code: 'NOT_FOUND', message: 'Resource not found' }])
  const sumup = client(fetch)
  assert.equal((await sumup.findTransaction({ clientTransactionId: 'b9f0 e2', foreignTransactionId: 'pay000000000001' })).transaction_code, 'TEENSK4W2K')
  assert.equal(await sumup.findTransaction({ foreignTransactionId: 'pay000000000001' }), null)
  assert.deepEqual(requests.map(r => r.url), [
    'https://api.sumup.test/v2.1/merchants/MH4H92C7/transactions?client_transaction_id=b9f0%20e2',
    'https://api.sumup.test/v2.1/merchants/MH4H92C7/transactions?foreign_transaction_id=pay000000000001'
  ])
})

test('errors become a kind and a status, and never carry the key or SumUp\'s text', async () => {
  const cases = [
    [[422, problem(422, 'Reader Offline', 'https://developer.sumup.com/problem/reader-offline')], 'offline', 422],
    [[401, problem(401, 'Unauthorized')], 'unauthorized', 401],
    [[404, problem(404, 'Not found')], 'not_found', 404],
    [[409, problem(409, 'Conflict')], 'conflict', 409],
    [[400, problem(400, 'Bad Request')], 'invalid', 400],
    [[422, problem(422, 'Validation failed')], 'invalid', 422],
    [[500, null], 'failed', 500],
    [Object.assign(new Error('The operation timed out.'), { name: 'TimeoutError' }), 'timeout', 0],
    [new TypeError(`fetch failed for Bearer ${KEY}`), 'unreachable', 0]
  ]
  for (const [reply, kind, status] of cases) {
    const { fetch } = fakeFetch(reply)
    await assert.rejects(client(fetch).listReaders(), (error) => {
      assert.ok(error instanceof SumUpError)
      assert.deepEqual([error.kind, error.status], [kind, status])
      assert.ok(!error.message.includes(KEY) && !error.message.includes('Reader Offline'))
      return true
    })
  }
  assert.ok(isUnreachable(new SumUpError('offline')) && isUnreachable(new SumUpError('timeout')) && isUnreachable(new SumUpError('unreachable')))
  assert.ok(!isUnreachable(new SumUpError('invalid')))
})

test('the sandbox check reads the merchant, and only sandbox: true counts as a sandbox', async () => {
  const { fetch, requests } = fakeFetch([200, { merchant_code: 'MH4H92C7', sandbox: true }])
  assert.equal(isSandboxMerchant(await client(fetch).getMerchant()), true)
  assert.equal(requests[0].url, 'https://api.sumup.test/v1/merchants/MH4H92C7')
  for (const merchant of [{ sandbox: false }, { sandbox: 'true' }, {}, null]) assert.equal(isSandboxMerchant(merchant), false)
})

const ENV = {
  POCKETBASE_URL: 'https://pb.example',
  OWNER_ID: 'owner0000000001',
  NOTIFIER_EMAIL: 'notifier@example.com',
  NOTIFIER_PASSWORD: 'test-password',
  SUMUP_API_KEY: KEY,
  SUMUP_MERCHANT_CODE: 'MH4H92C7',
  SUMUP_AFFILIATE_KEY: 'test-affiliate-key',
  SUMUP_AFFILIATE_APP_ID: 'com.example.akinai'
}

test('card payments are configured with the four SumUp keys, POCKETBASE_URL and OWNER_ID; missing lists names only', () => {
  const settings = cardSettings(ENV)
  assert.deepEqual([settings.configured, settings.background], [true, true])
  assert.equal(settings.apiUrl, 'https://api.sumup.com')
  assert.deepEqual([settings.missing, settings.backgroundMissing], [[], []])
  assert.equal(cardSettings({ ...ENV, SUMUP_API_URL: 'https://api.sumup.test/' }).apiUrl, 'https://api.sumup.test')

  const none = cardSettings({})
  assert.deepEqual([none.configured, none.background], [false, false])
  assert.deepEqual(none.missing, ['SUMUP_API_KEY', 'SUMUP_MERCHANT_CODE', 'SUMUP_AFFILIATE_KEY', 'SUMUP_AFFILIATE_APP_ID', 'POCKETBASE_URL', 'OWNER_ID'])
})

test('without the notifier login card payments still work, but the return URL and the poll are off', () => {
  // The laptop's nuxt dev: sandbox keys, POCKETBASE_URL and OWNER_ID, never the notifier login
  const laptop = cardSettings({ ...ENV, NOTIFIER_EMAIL: '', NOTIFIER_PASSWORD: undefined })
  assert.deepEqual([laptop.configured, laptop.background], [true, false])
  assert.deepEqual(laptop.backgroundMissing, ['NOTIFIER_EMAIL', 'NOTIFIER_PASSWORD'])
  // Background work needs card payments configured first
  assert.equal(cardSettings({ ...ENV, SUMUP_API_KEY: '' }).background, false)
})

test('the API key never goes over plain http, and the merchant code must be letters and digits', () => {
  assert.deepEqual(cardSettings({ ...ENV, SUMUP_API_URL: 'http://api.sumup.com' }).missing, ['SUMUP_API_URL'])
  assert.deepEqual(cardSettings({ ...ENV, SUMUP_API_URL: 'https://api.sumup.com/v0.1' }).missing, ['SUMUP_API_URL'])
  assert.deepEqual(cardSettings({ ...ENV, SUMUP_MERCHANT_CODE: '../me' }).missing, ['SUMUP_MERCHANT_CODE'])
  assert.deepEqual(cardSettings({ ...ENV, POCKETBASE_URL: 'http://pb.example' }).missing, ['POCKETBASE_URL'])
})
```

Create `tests/unit/card-payments.test.js`:

```js
import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  CARD_NOTIFIER_FIELDS,
  GIVE_UP_MS,
  chargeInput,
  statusFromTransaction,
  callbackUrl,
  hashToken,
  tokenMatches,
  normalisePairingCode,
  terminalStatus,
  pairTerminal,
  unpairTerminal,
  startCharge,
  checkPayment,
  callbackMatches,
  cancelCharge,
  createCardPoller,
  createOwnerStore,
  refreshPayment,
  markSandbox,
  createSandboxCheck
} from '../../server/utils/cardPayments.js'
import { SumUpError } from '../../server/utils/sumup.js'
import { CARD_NOTIFIER_FIELDS as RULE_FIELDS } from '../../scripts/lib/pb-plan.mjs'

const READER = { id: 'rdr_3MSAFM23CK82VSTT4BN6RWSQ65', name: 'Akinai', status: 'paired', device: { identifier: 'S1', model: 'virtual-solo' } }
const START = Date.parse('2026-10-16T10:00:00.000Z')
const CART = { description: '3D Printing Products:\nPikachu Keychain (4,00 € × 2)', amount: 8, items: [], stockMovements: [], prizes: { count: 0, categories: [] } }
const silent = { info () {}, error () {} }

// A SumUp stand-in: readers, the transactions it knows by our record id, and every call made
function fakeSumUp ({ readers = [READER], transactions = {}, fail = {} } = {}) {
  const calls = []
  const step = async (name, value) => {
    calls.push(name)
    if (fail[name]) throw fail[name]
    return value
  }
  return {
    calls,
    transactions,
    listReaders: () => step('listReaders', structuredClone(readers)),
    readerStatus: () => step('readerStatus', { status: 'ONLINE' }),
    createReader: ({ pairingCode, name }) => step(`createReader ${pairingCode}`, { id: 'rdr_NEW', name, status: 'processing' }),
    deleteReader: id => step(`deleteReader ${id}`, null),
    checkout: (readerId, body) => step(`checkout ${readerId}`, { client_transaction_id: 'ctx-1', body }),
    terminate: readerId => step(`terminate ${readerId}`, null),
    findTransaction: ({ clientTransactionId, foreignTransactionId }) =>
      step(`findTransaction ${clientTransactionId || foreignTransactionId}`, transactions[foreignTransactionId] ?? null)
  }
}

// A card payment store (the owner's or the notifier's) on an in-memory collection; updates may only touch
// the notifier's fields. A create answers the record as pay000000000001 and keeps what was sent in `created`.
function fakeStore (payments = []) {
  const db = new Map(payments.map(payment => [payment.id, structuredClone(payment)]))
  return {
    db,
    updates: [],
    created: [],
    async createCardPayment (data) {
      this.created.push(data)
      return { id: 'pay000000000001', created: '2026-10-16 10:00:00.000Z', ...data }
    },
    async getCardPayment (id) {
      if (!db.has(id)) throw Object.assign(new Error('Not found'), { status: 404 })
      return structuredClone(db.get(id))
    },
    async listPendingCardPayments () { return [...db.values()].filter(payment => payment.status === 'pending') },
    async updateCardPayment (id, patch) {
      assert.deepEqual(Object.keys(patch).filter(key => !CARD_NOTIFIER_FIELDS.includes(key)), [], 'the notifier writes only its fields')
      this.updates.push([id, patch])
      Object.assign(db.get(id), patch)
    }
  }
}
const payment = (id, extra = {}) => ({ id, status: 'pending', amount: 8, source: 'cart', cart: CART, sumup_checkout: '', sumup_transaction: '', booked_transaction: '', callback_token: hashToken('token-1'), created: '2026-10-16 10:00:00.000Z', ...extra })

test('the server writes the same three fields the notifier rule allows', () => {
  assert.deepEqual(CARD_NOTIFIER_FIELDS, RULE_FIELDS)
})

test('a charge needs a known source, an amount above 0 and the booking, and always says Akinai sale', () => {
  assert.deepEqual(chargeInput({ source: 'cart', amount: 19.9, description: 'anything', cart: CART }), { source: 'cart', amount: 19.9, cents: 1990, description: 'Akinai sale', cart: CART })
  // Float noise is rounded to the cent
  assert.equal(chargeInput({ source: 'home', amount: 0.1 + 0.2, cart: {} }).cents, 30)
  const refused = (body, message) => assert.throws(() => chargeInput(body), error => error.statusCode === 400 && error.statusMessage === message)
  for (const amount of [0, -5, 0.004, '12', NaN, Infinity, 10_000_00.01, null]) refused({ source: 'cart', amount, cart: CART }, 'Enter an amount above 0')
  refused({ source: 'till', amount: 5, cart: CART }, 'Unknown payment source')
  refused({ source: 'cart', amount: 5 }, 'Missing the sale to book')
  refused({ source: 'cart', amount: 5, cart: [CART] }, 'Missing the sale to book')
  refused({ source: 'cart', amount: 5, cart: { note: 'x'.repeat(200_001) } }, 'The cart is too large for one payment')
  refused(null, 'Unknown payment source')
})

test('SumUp\'s transaction status becomes the payment\'s status', () => {
  assert.deepEqual(['SUCCESSFUL', 'REFUNDED', 'CANCELLED', 'FAILED', 'PENDING', 'SOMETHING_NEW', undefined].map(status => statusFromTransaction(status ? { status } : null)),
    ['approved', 'approved', 'cancelled', 'declined', 'pending', 'pending', 'pending'])
})

test('the return URL is https on a public host, and none on localhost, IPs or bad hosts', () => {
  assert.equal(callbackUrl('akinai.lasseharm.space', 'pay000000000001', 'tok'), 'https://akinai.lasseharm.space/api/card/callback/pay000000000001/tok')
  for (const host of ['localhost:3000', 'localhost', '127.0.0.1:3668', '192.168.1.20', 'myphone', 'evil.example/x?', '', undefined, 'app.localhost']) {
    assert.equal(callbackUrl(host, 'pay000000000001', 'tok'), null, String(host))
  }
})

test('the callback token is stored as its hash and compared in constant time', () => {
  const stored = hashToken('token-1')
  assert.equal(stored.length, 64)
  assert.ok(!stored.includes('token-1'))
  assert.equal(tokenMatches('token-1', stored), true)
  assert.equal(tokenMatches('token-2', stored), false)
  assert.equal(tokenMatches('token-1', ''), false)
  assert.equal(tokenMatches('token-1', undefined), false)
})

test('the terminal is the first paired reader, with its online status, or unknown when SumUp cannot say', async () => {
  assert.deepEqual(await terminalStatus({ sumup: fakeSumUp() }), { paired: true, reader: { id: READER.id, name: 'Akinai', status: 'online' } })
  assert.deepEqual(await terminalStatus({ sumup: fakeSumUp({ readers: [{ ...READER, status: 'expired' }] }) }), { paired: false, reader: null })
  const old = fakeSumUp({ fail: { readerStatus: new SumUpError('not_found', 404) } })
  assert.equal((await terminalStatus({ sumup: old })).reader.status, 'unknown')
})

test('pairing checks the code first, refuses a second terminal and turns SumUp\'s refusal into a plain message', async () => {
  assert.equal(normalisePairingCode(' ab12-cd 34 '), 'AB12CD34')
  const none = fakeSumUp({ readers: [] })
  assert.equal((await pairTerminal({ sumup: none, code: 'ab12cd34' })).reader.id, 'rdr_NEW')
  assert.deepEqual(none.calls, ['listReaders', 'createReader AB12CD34'])

  for (const code of ['', 'ABC', 'AB12CD34567', 'AB12CD3!', null]) {
    const sumup = fakeSumUp({ readers: [] })
    await assert.rejects(pairTerminal({ sumup, code }), error => error.statusCode === 400 && error.statusMessage === 'Enter the code the Solo shows')
    assert.deepEqual(sumup.calls, [], 'a bad code never reaches SumUp')
  }
  await assert.rejects(pairTerminal({ sumup: fakeSumUp(), code: 'AB12CD34' }), error => error.statusCode === 409)
  for (const kind of ['not_found', 'invalid', 'conflict']) {
    await assert.rejects(pairTerminal({ sumup: fakeSumUp({ readers: [], fail: { 'createReader AB12CD34': new SumUpError(kind, 404) } }), code: 'AB12CD34' }),
      error => error.statusCode === 400 && /didn't work/.test(error.statusMessage))
  }
  await assert.rejects(pairTerminal({ sumup: fakeSumUp({ readers: [], fail: { 'createReader AB12CD34': new SumUpError('timeout') } }), code: 'AB12CD34' }), error => error.statusCode === 502)
})

test('unpairing deletes the paired reader, and a reader already gone is fine', async () => {
  const sumup = fakeSumUp()
  assert.deepEqual(await unpairTerminal({ sumup }), { paired: false, reader: null })
  assert.deepEqual(sumup.calls, ['listReaders', `deleteReader ${READER.id}`])
  await unpairTerminal({ sumup: fakeSumUp({ fail: { [`deleteReader ${READER.id}`]: new SumUpError('not_found', 404) } }) })
})

const INPUT = chargeInput({ source: 'cart', amount: 19.9, cart: CART })

test('a charge creates the pending record as the owner, then sends the checkout with the return URL', async () => {
  const sumup = fakeSumUp()
  const store = fakeStore([payment('pay000000000001')])
  const result = await startCharge({ input: INPUT, sumup, store, host: 'akinai.lasseharm.space', newToken: () => 'token-1', log: silent })
  assert.deepEqual(result, { id: 'pay000000000001' })
  assert.deepEqual(store.created, [{ amount: 19.9, description: 'Akinai sale', source: 'cart', cart: CART, status: 'pending', callback_token: hashToken('token-1') }])
  assert.deepEqual(sumup.calls, ['listReaders', `checkout ${READER.id}`])
  assert.deepEqual(store.updates, [['pay000000000001', { sumup_checkout: 'ctx-1' }]])
})

test('a terminal that is offline or does not answer fails the payment with the terminal message', async () => {
  for (const kind of ['offline', 'timeout', 'unreachable']) {
    const store = fakeStore([payment('pay000000000001')])
    const sumup = fakeSumUp({ fail: { [`checkout ${READER.id}`]: new SumUpError(kind, kind === 'offline' ? 422 : 0) } })
    await assert.rejects(startCharge({ input: INPUT, sumup, store, host: 'akinai.lasseharm.space', log: silent }),
      error => error.statusCode === 502 && error.statusMessage === "The terminal didn't answer. Check that it's on and online.")
    assert.equal(store.db.get('pay000000000001').status, 'failed')
  }
  const store = fakeStore([payment('pay000000000001')])
  await assert.rejects(startCharge({ input: INPUT, sumup: fakeSumUp({ fail: { [`checkout ${READER.id}`]: new SumUpError('invalid', 400) } }), store, host: 'x.example', log: silent }),
    error => error.statusCode === 502 && error.statusMessage === "The payment didn't go through")
  assert.equal(store.db.get('pay000000000001').status, 'failed')
})

test('no paired terminal, or SumUp unreachable before the start, creates no record', async () => {
  for (const sumup of [fakeSumUp({ readers: [] }), fakeSumUp({ fail: { listReaders: new SumUpError('timeout') } })]) {
    const store = fakeStore()
    await assert.rejects(startCharge({ input: INPUT, sumup, store, host: 'x.example', log: silent }), error => [409, 502].includes(error.statusCode))
    assert.deepEqual(store.created, [])
  }
})

test('a check records SumUp\'s result and transaction code once, and leaves a settled payment alone', async () => {
  const store = fakeStore([payment('pay000000000001')])
  const sumup = fakeSumUp({ transactions: { pay000000000001: { id: 'uuid-1', transaction_code: 'TEENSK4W2K', status: 'SUCCESSFUL' } } })
  assert.equal(await checkPayment({ store, sumup, id: 'pay000000000001', now: START + 5000, log: silent }), 'approved')
  assert.deepEqual(store.updates, [['pay000000000001', { status: 'approved', sumup_transaction: 'TEENSK4W2K' }]])
  assert.equal(await checkPayment({ store, sumup, id: 'pay000000000001', now: START + 9000, log: silent }), 'approved')
  assert.equal(store.updates.length, 1)
  // Looked up by SumUp's client transaction id once it is known
  const known = fakeStore([payment('pay000000000002', { sumup_checkout: 'ctx-2' })])
  const lookup = fakeSumUp()
  await checkPayment({ store: known, sumup: lookup, id: 'pay000000000002', now: START, log: silent })
  assert.deepEqual(lookup.calls, ['findTransaction ctx-2'])
})

test('a declined or cancelled card is recorded as such', async () => {
  for (const [status, expected] of [['FAILED', 'declined'], ['CANCELLED', 'cancelled']]) {
    const store = fakeStore([payment('pay000000000001')])
    const sumup = fakeSumUp({ transactions: { pay000000000001: { id: 'uuid-1', transaction_code: 'TX1', status } } })
    assert.equal(await checkPayment({ store, sumup, id: 'pay000000000001', now: START, log: silent }), expected)
  }
})

test('after 10 minutes a payment SumUp does not know is failed, unless SumUp says it is still pending', async () => {
  const unknown = fakeStore([payment('pay000000000001')])
  assert.equal(await checkPayment({ store: unknown, sumup: fakeSumUp(), id: 'pay000000000001', now: START + GIVE_UP_MS - 1, log: silent }), 'pending')
  assert.equal(await checkPayment({ store: unknown, sumup: fakeSumUp(), id: 'pay000000000001', now: START + GIVE_UP_MS, log: silent }), 'failed')
  // SumUp not answering counts as not pending
  const silentSumUp = fakeStore([payment('pay000000000001')])
  assert.equal(await checkPayment({ store: silentSumUp, sumup: fakeSumUp({ fail: { 'findTransaction pay000000000001': new SumUpError('timeout') } }), id: 'pay000000000001', now: START + GIVE_UP_MS, log: silent }), 'failed')
  const pending = fakeStore([payment('pay000000000001')])
  const sumup = fakeSumUp({ transactions: { pay000000000001: { id: 'uuid-1', status: 'PENDING' } } })
  assert.equal(await checkPayment({ store: pending, sumup, id: 'pay000000000001', now: START + 60 * 60_000, log: silent }), 'pending')
  assert.deepEqual(pending.updates, [])
})

test('the callback needs the payment\'s own token; anything else is no match', async () => {
  const store = fakeStore([payment('pay000000000001')])
  assert.equal(await callbackMatches({ store, id: 'pay000000000001', token: 'token-1' }), true)
  assert.equal(await callbackMatches({ store, id: 'pay000000000001', token: 'token-2' }), false)
  assert.equal(await callbackMatches({ store, id: 'pay000000000009', token: 'token-1' }), false)
  assert.equal(await callbackMatches({ store, id: '../../users', token: 'token-1' }), false)
  assert.equal(await callbackMatches({ store, id: 'pay000000000001', token: '' }), false)
})

test('Cancel on terminal stops the checkout and records cancelled, or approved when the card went through', async () => {
  const store = fakeStore([payment('pay000000000001')])
  const sumup = fakeSumUp()
  assert.deepEqual(await cancelCharge({ store, sumup, id: 'pay000000000001', log: silent }), { status: 'cancelled' })
  assert.deepEqual(sumup.calls, ['listReaders', `terminate ${READER.id}`, 'findTransaction pay000000000001'])
  assert.equal(store.db.get('pay000000000001').status, 'cancelled')

  const paid = fakeStore([payment('pay000000000001')])
  assert.deepEqual(await cancelCharge({ store: paid, sumup: fakeSumUp({ transactions: { pay000000000001: { id: 'u', transaction_code: 'TX9', status: 'SUCCESSFUL' } } }), id: 'pay000000000001', log: silent }), { status: 'approved' })
  assert.equal(paid.db.get('pay000000000001').sumup_transaction, 'TX9')

  // Nothing left to stop and no result yet: the poll settles it
  const racing = fakeStore([payment('pay000000000001')])
  assert.deepEqual(await cancelCharge({ store: racing, sumup: fakeSumUp({ fail: { [`terminate ${READER.id}`]: new SumUpError('invalid', 400) } }), id: 'pay000000000001', log: silent }), { status: 'pending' })
  assert.deepEqual(racing.updates, [])

  // A settled payment is not touched; an offline terminal keeps it pending with the terminal message
  const settled = fakeStore([payment('pay000000000001', { status: 'declined' })])
  assert.deepEqual(await cancelCharge({ store: settled, sumup: fakeSumUp(), id: 'pay000000000001', log: silent }), { status: 'declined' })
  const offline = fakeStore([payment('pay000000000001')])
  await assert.rejects(cancelCharge({ store: offline, sumup: fakeSumUp({ fail: { [`terminate ${READER.id}`]: new SumUpError('offline', 422) } }), id: 'pay000000000001', log: silent }), error => error.statusCode === 502)
  assert.equal(offline.db.get('pay000000000001').status, 'pending')
  await assert.rejects(cancelCharge({ store: offline, sumup: fakeSumUp(), id: 'nope', log: silent }), error => error.statusCode === 404)
})

test('the poll is single-flight, checks at most 10 a run, and forgets settled payments', async () => {
  const payments = Array.from({ length: 12 }, (_, index) => payment(`pay${String(index).padStart(12, '0')}`))
  const store = fakeStore(payments)
  const transactions = Object.fromEntries(payments.map(item => [item.id, { id: item.id, transaction_code: `TX${item.id.slice(-2)}`, status: 'SUCCESSFUL' }]))
  const sumup = fakeSumUp({ transactions })
  const poller = createCardPoller({ store, sumup, log: silent, now: () => START })
  await poller.loadPending()
  assert.equal(poller.tracked.size, 12)
  const first = poller.run()
  assert.equal(poller.run(), first, 'a second run during a run joins it')
  await first
  // The asked-for second run picked up the last two
  assert.equal(poller.tracked.size, 0)
  assert.equal(sumup.calls.filter(call => call.startsWith('findTransaction')).length, 12)
  assert.ok([...store.db.values()].every(item => item.status === 'approved'))
  // Nothing tracked: a run asks nobody
  await poller.run()
  assert.equal(sumup.calls.length, 12)
})

test('the poll keeps a payment SumUp cannot be asked about, and drops one whose record is gone', async () => {
  const store = fakeStore([payment('pay000000000001')])
  const errors = []
  const poller = createCardPoller({ store, sumup: fakeSumUp(), log: { info () {}, error: line => errors.push(line) }, now: () => START })
  poller.track('pay000000000001')
  poller.track('pay000000000009')
  store.getCardPayment = async (id) => {
    if (id === 'pay000000000009') throw Object.assign(new Error('Not found'), { status: 404 })
    throw Object.assign(new Error('PocketBase down'), { status: 0 })
  }
  await poller.run()
  assert.deepEqual([...poller.tracked], ['pay000000000001'])
  assert.deepEqual(errors, ['[card] Could not check pay000000000001: error'])
})

test('the poll gives up on a run that takes too long, and the next run starts fresh', async () => {
  const store = fakeStore([payment('pay000000000001')])
  let release
  store.getCardPayment = () => new Promise((resolve) => { release = resolve })
  const poller = createCardPoller({ store, sumup: fakeSumUp(), log: silent, capMs: 20, now: () => START })
  poller.track('pay000000000001')
  await poller.run()
  release(payment('pay000000000001'))
  assert.equal(poller.tracked.size, 1)
})

test('the owner\'s store talks to PocketBase with the caller\'s token and sends only SumUp\'s fields on update', async () => {
  const requests = []
  const fetch = async (url, options) => {
    requests.push({ url, method: options.method, authorization: options.headers.Authorization, body: options.body ? JSON.parse(options.body) : undefined })
    return { ok: true, json: async () => ({ id: 'pay000000000001' }) }
  }
  const store = createOwnerStore({ pocketbaseUrl: 'https://pb.example', authorization: 'a.b.c', fetch })
  assert.equal((await store.createCardPayment({ amount: 8 })).id, 'pay000000000001')
  await store.getCardPayment('pay000000000001')
  await store.updateCardPayment('pay000000000001', { status: 'approved', sumup_transaction: 'TX1', booked_transaction: 'x' })
  const records = 'https://pb.example/api/collections/card_payments/records'
  assert.deepEqual(requests, [
    { url: records, method: 'POST', authorization: 'a.b.c', body: { amount: 8 } },
    { url: `${records}/pay000000000001`, method: 'GET', authorization: 'a.b.c', body: undefined },
    { url: `${records}/pay000000000001`, method: 'PATCH', authorization: 'a.b.c', body: { status: 'approved', sumup_transaction: 'TX1' } }
  ])
  const refusing = createOwnerStore({ pocketbaseUrl: 'https://pb.example', authorization: 'a.b.c', fetch: async () => ({ ok: false, status: 400 }) })
  await assert.rejects(refusing.createCardPayment({}), error => error.status === 400)
})

test('refresh records SumUp\'s result for the open sheet and answers the payment without its token', async () => {
  const store = fakeStore([payment('pay000000000001')])
  const sumup = fakeSumUp({ transactions: { pay000000000001: { id: 'u', transaction_code: 'TEENSK4W2K', status: 'SUCCESSFUL' } } })
  const { payment: changed } = await refreshPayment({ store, sumup, id: 'pay000000000001', now: START + 4000, log: silent })
  assert.deepEqual([changed.status, changed.sumup_transaction, changed.cart], ['approved', 'TEENSK4W2K', CART])
  assert.ok(!('callback_token' in changed))
  assert.deepEqual(store.updates, [['pay000000000001', { status: 'approved', sumup_transaction: 'TEENSK4W2K' }]])
  // Settled: asked again, nothing is written and SumUp is not asked
  const again = await refreshPayment({ store, sumup, id: 'pay000000000001', now: START + 6000, log: silent })
  assert.equal(again.payment.status, 'approved')
  assert.equal(store.updates.length, 1)
  assert.equal(sumup.calls.length, 1)
})

test('refresh leaves an unchanged payment alone and keeps the 10-minute rule', async () => {
  const store = fakeStore([payment('pay000000000001')])
  assert.equal((await refreshPayment({ store, sumup: fakeSumUp(), id: 'pay000000000001', now: START + 2000, log: silent })).payment.status, 'pending')
  assert.deepEqual(store.updates, [])
  assert.equal((await refreshPayment({ store, sumup: fakeSumUp(), id: 'pay000000000001', now: START + GIVE_UP_MS, log: silent })).payment.status, 'failed')
})

test('refresh: an unknown id or one the caller may not see is 404; SumUp not answering is a safe 502 and changes nothing', async () => {
  const store = fakeStore([payment('pay000000000001')])
  await assert.rejects(refreshPayment({ store, sumup: fakeSumUp(), id: 'pay000000000009', log: silent }), error => error.statusCode === 404)
  await assert.rejects(refreshPayment({ store, sumup: fakeSumUp(), id: '../users', log: silent }), error => error.statusCode === 404)
  // Not the owner: PocketBase 0.22 answers the owner-only record as 404 (or 403)
  const notOwner = { ...fakeStore(), getCardPayment: async () => { throw Object.assign(new Error('Forbidden'), { status: 403 }) } }
  await assert.rejects(refreshPayment({ store: notOwner, sumup: fakeSumUp(), id: 'pay000000000001', log: silent }), error => error.statusCode === 404)
  const failing = fakeSumUp({ fail: { 'findTransaction pay000000000001': new SumUpError('timeout') } })
  await assert.rejects(refreshPayment({ store, sumup: failing, id: 'pay000000000001', now: START + GIVE_UP_MS, log: silent }),
    error => error.statusCode === 502 && error.statusMessage === "SumUp didn't answer. Try again." && !/timeout/.test(error.statusMessage))
  assert.deepEqual(store.updates, [])
  assert.equal(store.db.get('pay000000000001').status, 'pending')
})

test('a sandbox merchant\'s payment is marked [Sandbox] in SumUp and on the booked sale, once', async () => {
  const marked = markSandbox(INPUT)
  assert.equal(marked.description, '[Sandbox] Akinai sale')
  assert.equal(marked.cart.description, `[Sandbox] ${CART.description}`)
  assert.deepEqual(markSandbox(marked), marked)
  assert.equal(INPUT.cart.description, CART.description, 'the input is not changed')

  const store = fakeStore([payment('pay000000000001')])
  const sumup = fakeSumUp()
  await startCharge({ input: INPUT, sumup, store, host: 'x.example', isSandbox: async () => true, log: silent })
  assert.equal(store.created[0].description, '[Sandbox] Akinai sale')
  assert.equal(store.created[0].cart.description, `[Sandbox] ${CART.description}`)
})

test('whether the merchant is a sandbox is asked once; a failed question is asked again', async () => {
  let asked = 0
  let answer = () => { throw new SumUpError('timeout') }
  const check = createSandboxCheck({ getMerchant: async () => { asked++; return answer() } })
  assert.equal(await check(), false)
  answer = () => ({ sandbox: true })
  assert.equal(await check(), true)
  assert.equal(await check(), true)
  assert.equal(asked, 2)
  assert.equal(await createSandboxCheck({ getMerchant: async () => ({ sandbox: false }) })(), false)
})
```

In `tests/unit/reminder-job.test.js`, directly above the test `'the notifier finds a device by its endpoint'`, add:

```js
test('the notifier reads card payments and writes only status and SumUp ids', async () => {
  const calls = []
  const { FakePocketBase } = fakeSdk({
    nextToken: () => jwt(Math.floor(Date.now() / 1000) + 14 * 86400),
    'card_payments.getOne': async (pb, id) => { calls.push(['getOne', id]); return { id, status: 'pending' } },
    'card_payments.getFullList': async (pb, options) => { calls.push(['list', options.filter, options.sort]); return [] },
    'card_payments.update': async (pb, id, body) => { calls.push(['update', id, body]) }
  })
  const notifier = createNotifier({ PocketBaseClass: FakePocketBase, url: 'http://pb.test', email: 'n@example.com', password: 'p' })
  assert.deepEqual(await notifier.getCardPayment('pay000000000001'), { id: 'pay000000000001', status: 'pending' })
  await notifier.listPendingCardPayments()
  await notifier.updateCardPayment('pay000000000001', { status: 'approved', sumup_transaction: 'TX1', booked_transaction: 'x', amount: 1 })
  assert.deepEqual(calls, [
    ['getOne', 'pay000000000001'],
    ['list', 'status = "pending"', 'created'],
    ['update', 'pay000000000001', { status: 'approved', sumup_transaction: 'TX1' }]
  ])
})

```

- [ ] **Step 2: Run them to verify they fail**

Run: `npm run test:unit`
Expected: `fail 3`: `sumup.test.js` and `card-payments.test.js` as a whole (`Cannot find module '…/server/utils/sumup.js'` / `'…/server/utils/cardPayments.js'`) and `'the notifier reads card payments and writes only status and SumUp ids'` (`notifier.getCardPayment is not a function`).

- [ ] **Step 3: Write the settings and the SumUp client**

Create `server/utils/cardSettings.js`:

```js
// Server-only settings for card payments on the SumUp Solo, read from the environment: akinai.env on the
// server (live keys), the local .env in `nuxt dev` (sandbox keys). None of them ever gets a NUXT_PUBLIC_
// prefix, and none reaches a log or a response; `missing` and `backgroundMissing` list names only.
import { notifierSettings } from './notifierSettings.js'

const SUMUP_KEYS = ['SUMUP_API_KEY', 'SUMUP_MERCHANT_CODE', 'SUMUP_AFFILIATE_KEY', 'SUMUP_AFFILIATE_APP_ID']
// The owner's routes check the owner against PocketBase and write the payment with the owner's own token
const OWNER_KEYS = ['POCKETBASE_URL', 'OWNER_ID']
// SumUp's return URL and the 15 s backup poll run without the owner, as the notifier account
const NOTIFIER_KEYS = ['NOTIFIER_EMAIL', 'NOTIFIER_PASSWORD']
export const DEFAULT_SUMUP_API_URL = 'https://api.sumup.com'
// The merchant code is spliced into SumUp's URL paths
const MERCHANT_CODE = /^[A-Za-z0-9]{1,32}$/

// configured: card payments work (the app's refresh finds each result while its sheet is open).
// background: the return URL and the backup poll work too (they need the notifier login).
export function cardSettings (env = process.env) {
  const notifier = notifierSettings(env)
  const value = key => (typeof env[key] === 'string' ? env[key].trim() : '')
  const apiUrl = (value('SUMUP_API_URL') || DEFAULT_SUMUP_API_URL).replace(/\/+$/, '')
  const missing = [
    ...SUMUP_KEYS.filter(key => !value(key) || (key === 'SUMUP_MERCHANT_CODE' && !MERCHANT_CODE.test(value(key)))),
    // The API key never goes over plain http
    ...(/^https:\/\/[^/]+$/.test(apiUrl) ? [] : ['SUMUP_API_URL']),
    ...OWNER_KEYS.filter(key => notifier.missing.includes(key))
  ]
  const backgroundMissing = NOTIFIER_KEYS.filter(key => !value(key))
  return {
    pocketbaseUrl: notifier.pocketbaseUrl,
    ownerId: notifier.ownerId,
    email: notifier.email,
    password: notifier.password,
    apiKey: value('SUMUP_API_KEY'),
    merchantCode: value('SUMUP_MERCHANT_CODE'),
    affiliateKey: value('SUMUP_AFFILIATE_KEY'),
    appId: value('SUMUP_AFFILIATE_APP_ID'),
    apiUrl,
    configured: missing.length === 0,
    background: missing.length === 0 && backgroundMissing.length === 0,
    missing,
    backgroundMissing
  }
}
```

Create `server/utils/sumup.js`:

```js
// The only module that talks to SumUp: the Readers API (pairing, status, checkout, terminate) and the
// Transactions API, with plain fetch. Shapes follow developer.sumup.com as read on 2026-10-16; the README's
// sandbox checklist names what the owner confirms with the sandbox merchant and the Virtual Solo.
// Errors carry SumUp's HTTP status and a short kind, never the key, the request or SumUp's own text.
export const SUMUP_TIMEOUT_MS = 15_000

export class SumUpError extends Error {
  // kind: 'offline' (the reader is offline), 'timeout' and 'unreachable' (no answer), 'unauthorized',
  // 'not_found', 'conflict', 'invalid' (400/422) or 'failed' (anything else)
  constructor (kind, status = 0) {
    super(`SumUp ${kind}${status ? ` (${status})` : ''}`)
    this.name = 'SumUpError'
    this.kind = kind
    this.status = status
  }
}

// Only an account SumUp itself marks as a sandbox (Merchant.sandbox) is one
export const isSandboxMerchant = merchant => merchant?.sandbox === true

// The terminal did not get the request, or cannot take it now
export const isUnreachable = error => ['offline', 'timeout', 'unreachable'].includes(error?.kind)

// Errors are application/problem+json ({ type, title, status, detail }); a reader that is offline answers
// 422 with a type ending in /reader-offline
const errorKind = (status, body) => {
  if (status === 422 && (/reader-offline$/.test(String(body?.type ?? '')) || /reader offline/i.test(String(body?.title ?? '')))) return 'offline'
  if (status === 401 || status === 403) return 'unauthorized'
  if (status === 404) return 'not_found'
  if (status === 409) return 'conflict'
  if (status === 400 || status === 422) return 'invalid'
  return 'failed'
}

export function createSumUpClient ({ apiKey, merchantCode, apiUrl = 'https://api.sumup.com', affiliate, fetch = globalThis.fetch, timeoutMs = SUMUP_TIMEOUT_MS }) {
  const request = async (method, path, body) => {
    let response
    try {
      response = await fetch(`${apiUrl}${path}`, {
        method,
        headers: { Authorization: `Bearer ${apiKey}`, Accept: 'application/json', ...(body ? { 'Content-Type': 'application/json' } : {}) },
        body: body ? JSON.stringify(body) : undefined,
        signal: AbortSignal.timeout(timeoutMs)
      })
    } catch (error) {
      throw new SumUpError(error?.name === 'TimeoutError' || error?.name === 'AbortError' ? 'timeout' : 'unreachable')
    }
    const text = await response.text().catch(() => '')
    let json = null
    try {
      json = text ? JSON.parse(text) : null
    } catch {}
    if (!response.ok) throw new SumUpError(errorKind(response.status, json), response.status)
    return json
  }

  const merchant = `/v0.1/merchants/${encodeURIComponent(merchantCode)}`
  const reader = id => `${merchant}/readers/${encodeURIComponent(id)}`

  return {
    // GET /v1/merchants/{code} → Merchant { merchant_code, sandbox: boolean, … }; the sandbox check refuses unless sandbox is true
    getMerchant: () => request('GET', `/v1/merchants/${encodeURIComponent(merchantCode)}`),
    // GET …/readers → { items: Reader[] }; Reader { id, name, status: unknown|processing|paired|expired, device: { identifier, model } }
    listReaders: async () => (await request('GET', `${merchant}/readers`))?.items ?? [],
    // POST …/readers { pairing_code, name } → Reader; 404 when no reader waits for that code
    createReader: ({ pairingCode, name }) => request('POST', `${merchant}/readers`, { pairing_code: pairingCode, name }),
    deleteReader: id => request('DELETE', reader(id)),
    // GET …/readers/{id}/status → { data: { status: ONLINE|OFFLINE, state, battery_level, … } }
    readerStatus: async id => (await request('GET', `${reader(id)}/status`))?.data ?? null,
    // POST …/readers/{id}/checkout → { data: { client_transaction_id } }. return_url must be https; the
    // affiliate's foreign_transaction_id is our card payment's record id
    checkout: async (readerId, { cents, description, returnUrl, foreignId }) => (await request('POST', `${reader(readerId)}/checkout`, {
      total_amount: { value: cents, currency: 'EUR', minor_unit: 2 },
      description,
      ...(returnUrl ? { return_url: returnUrl } : {}),
      affiliate: { app_id: affiliate.appId, key: affiliate.key, foreign_transaction_id: foreignId }
    }))?.data ?? {},
    // POST …/readers/{id}/terminate: no body, no confirmation; works only while the reader waits for the card or PIN
    terminate: readerId => request('POST', `${reader(readerId)}/terminate`),
    // GET /v2.1/merchants/{code}/transactions?client_transaction_id=… (or foreign_transaction_id=…) →
    // { id, transaction_code, status: SUCCESSFUL|CANCELLED|FAILED|PENDING|REFUNDED, … }; null while SumUp has none
    findTransaction: async ({ clientTransactionId = '', foreignTransactionId = '' }) => {
      const query = clientTransactionId
        ? `client_transaction_id=${encodeURIComponent(clientTransactionId)}`
        : `foreign_transaction_id=${encodeURIComponent(foreignTransactionId)}`
      try {
        return await request('GET', `/v2.1/merchants/${encodeURIComponent(merchantCode)}/transactions?${query}`)
      } catch (error) {
        if (error.kind === 'not_found') return null
        throw error
      }
    }
  }
}
```

Run: `node --test tests/unit/sumup.test.js`
Expected: `pass 10`, `fail 0`.

- [ ] **Step 4: Write the card payment rules**

Create `server/utils/cardPayments.js`:

```js
// Card payments on the SumUp Solo: what the card routes and the backup poll do, with SumUp (`sumup`, see
// sumup.js) and a card payment store passed in: the owner's own (createOwnerStore, for the owner's routes)
// or the notifier's (for the return URL and the poll). The unit tests run against fakes and never reach SumUp.
import { createHash, randomBytes } from 'node:crypto'
import { sameText } from './access.js'
import { isUnreachable } from './sumup.js'

export const CARD_PAYMENTS = 'card_payments'
// The only fields the notifier may write (the collection's update rule refuses the rest; pb-plan.mjs)
export const CARD_NOTIFIER_FIELDS = ['status', 'sumup_checkout', 'sumup_transaction']
// What SumUp shows for the sale, also in the SumUp app
export const SALE_DESCRIPTION = 'Akinai sale'
// Payments with a SumUp sandbox merchant are marked, in SumUp and on the booked sale, so test sales are easy to find and delete
export const SANDBOX_PREFIX = '[Sandbox] '
export const READER_NAME = 'Akinai'
export const CARD_POLL_MS = 15_000
// A payment SumUp knows nothing about this long after it started is given up as failed
export const GIVE_UP_MS = 10 * 60_000
// One poll run may take this long and check this many payments at most
export const POLL_RUN_CAP_MS = 12_000
export const POLL_MAX_PER_RUN = 10
const MAX_CART_BYTES = 200_000
const MAX_AMOUNT_CENTS = 10_000_00
const RECORD_ID = /^[a-z0-9]{15}$/
// The code the Solo shows under Connections → API → Connect: 8 or 9 letters and digits
export const PAIRING_CODE = /^[A-Z0-9]{8,9}$/

export const NOT_CONFIGURED = "Card payments aren't configured on the server"
export const TERMINAL_UNREACHABLE = "The terminal didn't answer. Check that it's on and online."
export const PAYMENT_FAILED = "The payment didn't go through"
export const SUMUP_UNREACHABLE = "SumUp didn't answer. Try again."
export const NOT_PAIRED = 'Pair the terminal in Settings first'
export const PAIRING_CODE_INVALID = 'Enter the code the Solo shows'
export const PAIRING_CODE_REFUSED = "That code didn't work. Start pairing on the Solo again and enter the new code."
export const ALREADY_PAIRED = 'A terminal is already paired. Unpair it first.'

// h3's createError shape, so the routes can throw these as they are
const refuse = (statusCode, statusMessage) => Object.assign(new Error(statusMessage), { statusCode, statusMessage })

export const toCents = amount => Math.round(Number(amount) * 100)
export const normalisePairingCode = code => String(code ?? '').replace(/[\s-]/g, '').toUpperCase()
export const randomToken = () => randomBytes(24).toString('base64url')
// The record keeps only the token's SHA-256, so reading the record never gives the return URL away
export const hashToken = token => createHash('sha256').update(String(token)).digest('hex')
export const tokenMatches = (token, stored) => typeof stored === 'string' && stored.length === 64 && sameText(hashToken(token), stored)

const isPlainObject = value => !!value && typeof value === 'object' && !Array.isArray(value)

// POST /api/card/charge's body: { source: 'cart' | 'home', amount (euros, > 0), description, cart (the booking) }
export function chargeInput (body) {
  const { source, amount, cart } = isPlainObject(body) ? body : {}
  if (!['cart', 'home'].includes(source)) throw refuse(400, 'Unknown payment source')
  const cents = toCents(amount)
  if (typeof amount !== 'number' || !Number.isFinite(amount) || cents < 1 || cents > MAX_AMOUNT_CENTS) throw refuse(400, 'Enter an amount above 0')
  if (!isPlainObject(cart)) throw refuse(400, 'Missing the sale to book')
  if (Buffer.byteLength(JSON.stringify(cart)) > MAX_CART_BYTES) throw refuse(400, 'The cart is too large for one payment')
  return { source, amount: cents / 100, cents, description: SALE_DESCRIPTION, cart }
}

// SumUp's transaction status as the payment's status. REFUNDED was paid (the refund is the SumUp app's).
// FAILED is a card the terminal refused: declined. Anything else is still pending.
export function statusFromTransaction (transaction) {
  switch (transaction?.status) {
    case 'SUCCESSFUL':
    case 'REFUNDED':
      return 'approved'
    case 'CANCELLED':
      return 'cancelled'
    case 'FAILED':
      return 'declined'
    default:
      return 'pending'
  }
}

// The id the SumUp app and the receipt show (transaction_code), else SumUp's internal id
export const sumupTransactionOf = transaction => String(transaction?.transaction_code || transaction?.id || '')

// A sandbox payment: `[Sandbox] ` before the description SumUp shows and before the booked sale's
// description (the stored booking's). Marking twice changes nothing.
export function markSandbox (input) {
  const mark = text => (String(text ?? '').startsWith(SANDBOX_PREFIX) ? String(text ?? '') : `${SANDBOX_PREFIX}${text ?? ''}`)
  return { ...input, description: mark(input.description), cart: { ...input.cart, description: mark(input.cart.description) } }
}

// Whether the merchant is a SumUp sandbox (Merchant.sandbox), asked once per process. A failed question is
// asked again next time and counts as "not a sandbox" meanwhile.
export function createSandboxCheck (sumup) {
  let known = null
  return async () => {
    if (known !== null) return known
    try {
      known = (await sumup.getMerchant())?.sandbox === true
      return known
    } catch {
      return false
    }
  }
}

// The return URL SumUp calls when the payment ends: https on the host the app was opened on. A host SumUp
// cannot reach (localhost, an IP address, a name without a dot) gets none, and the backup poll finds the result.
export function callbackUrl (host, id, token) {
  const name = String(host ?? '').toLowerCase()
  if (!/^[a-z0-9.-]+(:\d{1,5})?$/.test(name)) return null
  const bare = name.replace(/:\d+$/, '')
  if (!bare.includes('.') || bare === 'localhost' || bare.endsWith('.localhost') || /^[\d.]+$/.test(bare)) return null
  return `https://${name}/api/card/callback/${id}/${token}`
}

// The created stamp of a PocketBase record ('YYYY-MM-DD HH:MM:SS.sssZ') in ms
const createdAt = record => Date.parse(String(record?.created ?? '').replace(' ', 'T'))

// SumUp's paired reader: the first reader whose status is `paired` (one terminal only)
export async function pairedReader (sumup) {
  const readers = await sumup.listReaders()
  return readers.find(reader => reader?.status === 'paired') ?? null
}

const READER_STATUS = { ONLINE: 'online', OFFLINE: 'offline' }

// GET /api/card/terminal: { paired, reader: { id, name, status: 'online' | 'offline' | 'unknown' } | null }.
// A reader whose status SumUp cannot give (an old firmware) is 'unknown'.
export async function terminalStatus ({ sumup }) {
  const reader = await pairedReader(sumup)
  if (!reader) return { paired: false, reader: null }
  let status = 'unknown'
  try {
    status = READER_STATUS[(await sumup.readerStatus(reader.id))?.status] ?? 'unknown'
  } catch {}
  return { paired: true, reader: { id: reader.id, name: reader.name || READER_NAME, status } }
}

export async function pairTerminal ({ sumup, code }) {
  const pairingCode = normalisePairingCode(code)
  if (!PAIRING_CODE.test(pairingCode)) throw refuse(400, PAIRING_CODE_INVALID)
  if (await pairedReader(sumup)) throw refuse(409, ALREADY_PAIRED)
  try {
    const reader = await sumup.createReader({ pairingCode, name: READER_NAME })
    return { paired: true, reader: { id: reader.id, name: reader.name || READER_NAME, status: 'unknown' } }
  } catch (error) {
    if (['not_found', 'invalid', 'conflict'].includes(error?.kind)) throw refuse(400, PAIRING_CODE_REFUSED)
    throw refuse(502, SUMUP_UNREACHABLE)
  }
}

export async function unpairTerminal ({ sumup }) {
  const reader = await pairedReader(sumup)
  if (reader) {
    try {
      await sumup.deleteReader(reader.id)
    } catch (error) {
      if (error?.kind !== 'not_found') throw error
    }
  }
  return { paired: false, reader: null }
}

// POST /api/card/charge: the record (as the owner, `pending`), then the checkout on the Solo. A SumUp error
// or no answer leaves the record `failed`; nothing is booked then. A sandbox merchant's payment is marked.
export async function startCharge ({ input: plain, sumup, store, host, isSandbox = async () => false, newToken = randomToken, log = console }) {
  const input = (await isSandbox()) ? markSandbox(plain) : plain
  let reader
  try {
    reader = await pairedReader(sumup)
  } catch {
    throw refuse(502, SUMUP_UNREACHABLE)
  }
  if (!reader) throw refuse(409, NOT_PAIRED)
  const token = newToken()
  let record
  try {
    record = await store.createCardPayment({ amount: input.amount, description: input.description, source: input.source, cart: input.cart, status: 'pending', callback_token: hashToken(token) })
  } catch {
    throw refuse(502, 'Could not save the payment. Try again.')
  }
  let checkout
  try {
    checkout = await sumup.checkout(reader.id, { cents: input.cents, description: input.description, returnUrl: callbackUrl(host, record.id, token), foreignId: record.id })
  } catch (error) {
    log.info(`[card] ${record.id} failed: ${error?.message || 'SumUp error'}`)
    await store.updateCardPayment(record.id, { status: 'failed' }).catch(() => {})
    throw refuse(502, isUnreachable(error) ? TERMINAL_UNREACHABLE : PAYMENT_FAILED)
  }
  // Without it the result is looked up by our record id (the affiliate's foreign_transaction_id)
  if (checkout?.client_transaction_id) await store.updateCardPayment(record.id, { sumup_checkout: String(checkout.client_transaction_id) }).catch(() => {})
  log.info(`[card] ${record.id} sent to the terminal`)
  return { id: record.id }
}

// Asks SumUp for one pending payment's result and records it. Resolves { status, payment } afterwards
// (the payment as stored now). Ten minutes after the start a payment SumUp does not report as pending
// (unknown to SumUp, or no answer) is given up as failed. `strict`: SumUp not answering throws a safe 502
// and changes nothing (the app's refresh; the poll keeps the 10-minute rule).
async function settlePayment ({ store, sumup, id, now, log, strict }) {
  const payment = await store.getCardPayment(id)
  if (payment.status !== 'pending') return { status: payment.status, payment }
  let transaction
  let asked = true
  try {
    transaction = await sumup.findTransaction({ clientTransactionId: payment.sumup_checkout || '', foreignTransactionId: payment.id })
  } catch {
    if (strict) throw refuse(502, SUMUP_UNREACHABLE)
    asked = false
  }
  const status = statusFromTransaction(transaction)
  if (status === 'pending') {
    const sumupSaysPending = asked && !!transaction
    if (sumupSaysPending || !(now - createdAt(payment) >= GIVE_UP_MS)) return { status: 'pending', payment }
    await store.updateCardPayment(id, { status: 'failed' })
    log.info(`[card] ${id} failed: no result from SumUp after 10 minutes`)
    return { status: 'failed', payment: { ...payment, status: 'failed' } }
  }
  const patch = { status, sumup_transaction: sumupTransactionOf(transaction) }
  await store.updateCardPayment(id, patch)
  log.info(`[card] ${id} ${status}${patch.sumup_transaction ? ` (${patch.sumup_transaction})` : ''}`)
  return { status, payment: { ...payment, ...patch } }
}

export async function checkPayment ({ store, sumup, id, now = Date.now(), log = console }) {
  return (await settlePayment({ store, sumup, id, now, log, strict: false })).status
}

// POST /api/card/refresh: the open sheet asks every 2 s, with the owner's own store, so a result arrives
// even without the return URL and the poll (nuxt dev, or no notifier login). Same lookup, mapping and
// 10-minute rule as the poll. Answers the payment without its callback token.
export async function refreshPayment ({ store, sumup, id, now = Date.now(), log = console }) {
  if (!RECORD_ID.test(String(id ?? ''))) throw refuse(404, 'Unknown payment')
  try {
    await store.getCardPayment(id)
  } catch (error) {
    // PocketBase 0.22 answers a record the caller may not see as 404
    if (error?.status === 404 || error?.status === 403) throw refuse(404, 'Unknown payment')
    throw refuse(502, 'Could not read the payment. Try again.')
  }
  const { payment } = await settlePayment({ store, sumup, id, now, log, strict: true })
  const { callback_token: secret, ...visible } = payment
  return { payment: visible }
}

// POST /api/card/callback/:id/:token: true when the token is the payment's. The body is never read.
export async function callbackMatches ({ store, id, token }) {
  if (!RECORD_ID.test(String(id ?? '')) || typeof token !== 'string' || !token) return false
  let payment
  try {
    payment = await store.getCardPayment(id)
  } catch {
    return false
  }
  return tokenMatches(token, payment.callback_token)
}

// POST /api/card/cancel: stops the checkout on the Solo. Once SumUp has taken the stop, the payment is
// `cancelled` (or `approved`, should the card have gone through after all). When there was nothing left to
// stop (the customer already paid or cancelled), the status stays for the poll to settle.
export async function cancelCharge ({ store, sumup, id, log = console }) {
  if (!RECORD_ID.test(String(id ?? ''))) throw refuse(404, 'Unknown payment')
  let payment
  try {
    payment = await store.getCardPayment(id)
  } catch {
    throw refuse(404, 'Unknown payment')
  }
  if (payment.status !== 'pending') return { status: payment.status }
  let stopped = true
  try {
    const reader = await pairedReader(sumup)
    if (reader) await sumup.terminate(reader.id)
  } catch (error) {
    if (isUnreachable(error)) throw refuse(502, TERMINAL_UNREACHABLE)
    if (!['not_found', 'invalid', 'conflict'].includes(error?.kind)) throw refuse(502, SUMUP_UNREACHABLE)
    stopped = false
  }
  let transaction = null
  try {
    transaction = await sumup.findTransaction({ clientTransactionId: payment.sumup_checkout || '', foreignTransactionId: payment.id })
  } catch {}
  const found = statusFromTransaction(transaction)
  const status = found === 'approved' ? 'approved' : stopped ? 'cancelled' : found
  if (status === 'pending') return { status }
  await store.updateCardPayment(id, { status, sumup_transaction: sumupTransactionOf(transaction) })
  log.info(`[card] ${id} ${status}`)
  return { status }
}

// The backup poll: every 15 s while a payment is pending it asks SumUp (checkPayment). Single-flight (a run
// asked for during a run follows it), at most 10 payments and 12 s per run. It follows the payments this
// server started, and after a restart the pending ones PocketBase lists (loadPending).
export function createCardPoller ({ store, sumup, log = console, capMs = POLL_RUN_CAP_MS, maxPerRun = POLL_MAX_PER_RUN, now = () => Date.now() }) {
  const tracked = new Set()
  let running = null
  let again = false

  const runOnce = async () => {
    for (const id of [...tracked].slice(0, maxPerRun)) {
      try {
        const status = await checkPayment({ store, sumup, id, now: now(), log })
        if (status !== 'pending') tracked.delete(id)
      } catch (error) {
        // A record that is gone is dropped; anything else is tried again next run
        if (error?.status === 404) tracked.delete(id)
        else log.error(`[card] Could not check ${id}: ${error?.kind || error?.status || 'error'}`)
      }
    }
  }

  const run = () => {
    if (running) {
      again = true
      return running
    }
    if (!tracked.size) return Promise.resolve()
    running = (async () => {
      do {
        again = false
        let timer
        const cap = new Promise((resolve) => { timer = setTimeout(resolve, capMs) })
        await Promise.race([runOnce(), cap])
        clearTimeout(timer)
      } while (again && tracked.size)
    })().finally(() => { running = null })
    return running
  }

  const track = (id) => { tracked.add(id) }

  const loadPending = async () => {
    try {
      for (const payment of await store.listPendingCardPayments()) tracked.add(payment.id)
    } catch (error) {
      log.error(`[card] Could not list pending payments: ${error?.status || 'error'}`)
    }
  }

  return { track, run, loadPending, tracked }
}

// The owner's own card payment store: PocketBase's REST API with the caller's token, so the collection's
// rules for the owner apply (create, read, update). Updates send only status and SumUp's ids, like the
// notifier's. The token goes to PocketBase only.
export function createOwnerStore ({ pocketbaseUrl, authorization, fetch = globalThis.fetch }) {
  const records = `${pocketbaseUrl}/api/collections/${CARD_PAYMENTS}/records`
  const request = async (method, url, data) => {
    const response = await fetch(url, {
      method,
      headers: { Authorization: authorization, ...(data ? { 'Content-Type': 'application/json' } : {}) },
      body: data ? JSON.stringify(data) : undefined,
      signal: AbortSignal.timeout(10_000)
    })
    if (!response.ok) throw Object.assign(new Error(`PocketBase answered ${response.status}`), { status: response.status })
    return response.json()
  }
  const only = patch => Object.fromEntries(Object.entries(patch).filter(([key]) => CARD_NOTIFIER_FIELDS.includes(key)))
  return {
    createCardPayment: data => request('POST', records, data),
    getCardPayment: id => request('GET', `${records}/${encodeURIComponent(id)}`),
    updateCardPayment: (id, patch) => request('PATCH', `${records}/${encodeURIComponent(id)}`, only(patch))
  }
}
```

- [ ] **Step 5: Give the notifier its card payment calls**

In `server/utils/notifier.js`, below `import { withSentMarks } from '../../utils/calendar/reminders.js'` add:

```js
import { CARD_PAYMENTS, CARD_NOTIFIER_FIELDS } from './cardPayments.js'
```

and directly above the line `    // The notifier's own record id in "users", so its token is accepted by the owner's routes too` add:

```js
    // Card payments: the notifier reads them and records SumUp's answer, nothing else (its update rule
    // refuses any other field, so the others are never even sent)
    getCardPayment: id => call(() => pb.collection(CARD_PAYMENTS).getOne(id)),
    listPendingCardPayments: () => call(() => pb.collection(CARD_PAYMENTS).getFullList({ filter: 'status = "pending"', sort: 'created' })),
    updateCardPayment: (id, patch) => call(() => pb.collection(CARD_PAYMENTS).update(id, Object.fromEntries(Object.entries(patch).filter(([key]) => CARD_NOTIFIER_FIELDS.includes(key))))),
```

- [ ] **Step 6: Run the unit tests**

Run: `npm run test:unit`
Expected: `tests 381`, `pass 381`, `fail 0`. Then the time zones and Node 20: all `fail 0`.

- [ ] **Step 7: Commit**

```bash
git add server/utils/cardSettings.js server/utils/sumup.js server/utils/cardPayments.js server/utils/notifier.js tests/unit/sumup.test.js tests/unit/card-payments.test.js tests/unit/reminder-job.test.js
git commit -m "Add the SumUp client and the card payment rules: charge, refresh, callback check, cancel, the sandbox marker and the backup poll

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 5: The card routes, the backup poll and the owner's sandbox check

**Files:**
- Modify: `server/utils/requireCaller.js` (`ownerOnly`)
- Create: `server/utils/card.js`, `server/api/card/terminal.get.js`, `server/api/card/pair.post.js`, `server/api/card/unpair.post.js`, `server/api/card/charge.post.js`, `server/api/card/cancel.post.js`, `server/api/card/refresh.post.js`, `server/api/card/callback/[id]/[token].post.js`, `server/plugins/cardPayments.js`
- Create: `scripts/sumup-sandbox-check.mjs`; Modify: `package.json` (script `sumup:sandbox-check`)
- Test: `tests/unit/require-caller.test.js`

**Interfaces:**
- Consumes: everything Task 4 produces; h3's auto-imported `defineEventHandler`, `createError`, `readBody`, `getHeader`, `getRouterParam`, `getRequestHost`.
- Produces (Task 6 and 7 call these from the browser with `Authorization: <owner token>`; errors are h3 errors whose JSON carries `message`):
  - `GET /api/card/terminal` → `{ configured, paired, reader: { id, name, status: 'online' | 'offline' | 'unknown' } | null }`; unconfigured `{ configured: false, paired: false, reader: null }` without a token;
  - `POST /api/card/pair { code }` → `{ paired: true, reader: { id, name, status: 'unknown' } }`; 400 / 409 / 502 with a message;
  - `POST /api/card/unpair` → `{ paired: false, reader: null }`;
  - `POST /api/card/charge { source, amount, description, cart }` → `{ id }` (the `card_payments` record id); 400 / 409 / 502 with a message; 503 `Card payments aren't configured on the server`;
  - `POST /api/card/cancel { id }` → `{ status }`;
  - `POST /api/card/refresh { id }` → `{ payment }` (the record without `callback_token`, after asking SumUp); 404 unknown; 502 `SumUp didn't answer. Try again.` with the record unchanged;
  - `POST /api/card/callback/:id/:token` → `{ ok: true }` or 404 (always 404 without the notifier login);
  - `requireCaller(event, settings, { ownerOnly: true })`;
  - `npm run sumup:sandbox-check [-- --pair <code>]`.

- [ ] **Step 1: Write the failing test**

In `tests/unit/require-caller.test.js`, replace

```js
  const call = authorization => requireCaller({ headers: authorization === undefined ? {} : { authorization } }, SETTINGS, { notifier, fetch })
```

with

```js
  const call = (authorization, options = {}) => requireCaller({ headers: authorization === undefined ? {} : { authorization } }, SETTINGS, { notifier, fetch, ...options })
```

and append at the end of the file:

```js

test('ownerOnly lets the owner in and refuses the notifier without logging it in', async () => {
  const { call, notifier } = setup()
  await call(TOKENS.owner, { ownerOnly: true })
  await refused(call(TOKENS.notifier, { ownerOnly: true }))
  await refused(call(TOKENS.stranger, { ownerOnly: true }))
  assert.equal(notifier.logins, 0)
})
```

- [ ] **Step 2: Run it to verify it fails**

Run: `node --test tests/unit/require-caller.test.js`
Expected: 1 failure, `'ownerOnly lets the owner in and refuses the notifier without logging it in'`: the notifier is let in (`Missing expected rejection`).

- [ ] **Step 3: Add `ownerOnly`**

In `server/utils/requireCaller.js`, replace

```js
// the notifier's own account (a PocketBase login) is looked up only when the owner did not match.
import
```

with

```js
// the notifier's own account (a PocketBase login) is looked up only when the owner did not match.
// `ownerOnly` (the card routes) lets only the owner in.
import
```

replace

```js
export async function requireCaller (event, settings, { notifier = useNotifier(settings), fetch } = {}) {
```

with

```js
export async function requireCaller (event, settings, { notifier, fetch, ownerOnly = false } = {}) {
```

and replace

```js
  if (sameText(id, settings.ownerId)) return
  const notifierId = await notifier.accountId().catch(() => '')
```

with

```js
  if (sameText(id, settings.ownerId)) return
  if (ownerOnly) throw refuse()
  const notifierId = await (notifier ?? useNotifier(settings)).accountId().catch(() => '')
```

(The notifier client is now created only when it is needed.)

Run: `npm run test:unit`
Expected: `tests 382`, `pass 382`, `fail 0`.

- [ ] **Step 4: One SumUp client, store and poll per process**

Create `server/utils/card.js`:

```js
// One SumUp client, the sandbox check and, with the notifier login, the notifier's PocketBase client and the
// backup poll, per server process: shared by the card routes and the plugin that starts the poll
import { createSumUpClient } from './sumup.js'
import { useNotifier } from './notifier.js'
import { createCardPoller, createSandboxCheck } from './cardPayments.js'

let shared = null
export const useCard = (settings) => {
  if (!shared) {
    const sumup = createSumUpClient({
      apiKey: settings.apiKey,
      merchantCode: settings.merchantCode,
      apiUrl: settings.apiUrl,
      affiliate: { appId: settings.appId, key: settings.affiliateKey }
    })
    // Without the notifier login (the laptop's nuxt dev) there is no store of its own and no poll:
    // the open sheet's refresh finds each result with the owner's token
    const store = settings.background ? useNotifier(settings) : null
    shared = { sumup, isSandbox: createSandboxCheck(sumup), store, poller: store ? createCardPoller({ store, sumup }) : null }
  }
  return shared
}
```

- [ ] **Step 5: The owner's routes**

Create `server/api/card/terminal.get.js`:

```js
// GET /api/card/terminal: { configured, paired, reader: { id, name, status } | null }. Unconfigured, it
// answers without asking anyone (like /api/push/status); otherwise only the owner may ask.
import { cardSettings } from '../../utils/cardSettings.js'
import { requireCaller } from '../../utils/requireCaller.js'
import { useCard } from '../../utils/card.js'
import { terminalStatus, SUMUP_UNREACHABLE } from '../../utils/cardPayments.js'

export default defineEventHandler(async (event) => {
  const settings = cardSettings(process.env)
  if (!settings.configured) return { configured: false, paired: false, reader: null }
  await requireCaller(event, settings, { ownerOnly: true })
  try {
    return { configured: true, ...(await terminalStatus(useCard(settings))) }
  } catch {
    throw createError({ statusCode: 502, statusMessage: SUMUP_UNREACHABLE })
  }
})
```

Create `server/api/card/pair.post.js`:

```js
// POST /api/card/pair { code }: pairs the Solo that shows `code` under Connections → API → Connect
import { cardSettings } from '../../utils/cardSettings.js'
import { requireCaller } from '../../utils/requireCaller.js'
import { useCard } from '../../utils/card.js'
import { pairTerminal, NOT_CONFIGURED, SUMUP_UNREACHABLE } from '../../utils/cardPayments.js'

export default defineEventHandler(async (event) => {
  const settings = cardSettings(process.env)
  if (!settings.configured) throw createError({ statusCode: 503, statusMessage: NOT_CONFIGURED })
  await requireCaller(event, settings, { ownerOnly: true })
  const { code } = (await readBody(event).catch(() => null)) ?? {}
  try {
    return await pairTerminal({ sumup: useCard(settings).sumup, code })
  } catch (error) {
    throw createError(error?.statusCode ? error : { statusCode: 502, statusMessage: SUMUP_UNREACHABLE })
  }
})
```

Create `server/api/card/unpair.post.js`:

```js
// POST /api/card/unpair: removes the paired Solo at SumUp
import { cardSettings } from '../../utils/cardSettings.js'
import { requireCaller } from '../../utils/requireCaller.js'
import { useCard } from '../../utils/card.js'
import { unpairTerminal, NOT_CONFIGURED, SUMUP_UNREACHABLE } from '../../utils/cardPayments.js'

export default defineEventHandler(async (event) => {
  const settings = cardSettings(process.env)
  if (!settings.configured) throw createError({ statusCode: 503, statusMessage: NOT_CONFIGURED })
  await requireCaller(event, settings, { ownerOnly: true })
  try {
    return await unpairTerminal({ sumup: useCard(settings).sumup })
  } catch {
    throw createError({ statusCode: 502, statusMessage: SUMUP_UNREACHABLE })
  }
})
```

Create `server/api/card/charge.post.js`:

```js
// POST /api/card/charge { source, amount, description, cart }: puts the amount on the Solo. Answers { id },
// the card payment's record id; the app's sheet refreshes that payment until it has a result.
import { cardSettings } from '../../utils/cardSettings.js'
import { requireCaller } from '../../utils/requireCaller.js'
import { useCard } from '../../utils/card.js'
import { chargeInput, startCharge, createOwnerStore, NOT_CONFIGURED } from '../../utils/cardPayments.js'

export default defineEventHandler(async (event) => {
  const settings = cardSettings(process.env)
  if (!settings.configured) throw createError({ statusCode: 503, statusMessage: NOT_CONFIGURED })
  await requireCaller(event, settings, { ownerOnly: true })
  const input = chargeInput(await readBody(event).catch(() => null))
  const { sumup, isSandbox, poller } = useCard(settings)
  const { id } = await startCharge({
    input,
    sumup,
    // Created and updated with the owner's own token: the collection lets only the owner create
    store: createOwnerStore({ pocketbaseUrl: settings.pocketbaseUrl, authorization: getHeader(event, 'authorization') }),
    isSandbox,
    // The return URL's host: the address the app was opened on (nginx passes it through)
    host: getRequestHost(event, { xForwardedHost: true })
  })
  // With the notifier login the poll follows it too (the app may close before the result)
  poller?.track(id)
  return { id }
})
```

Create `server/api/card/cancel.post.js`:

```js
// POST /api/card/cancel { id }: Cancel on terminal. Answers { status } once SumUp has taken the stop
import { cardSettings } from '../../utils/cardSettings.js'
import { requireCaller } from '../../utils/requireCaller.js'
import { useCard } from '../../utils/card.js'
import { cancelCharge, createOwnerStore, NOT_CONFIGURED } from '../../utils/cardPayments.js'

export default defineEventHandler(async (event) => {
  const settings = cardSettings(process.env)
  if (!settings.configured) throw createError({ statusCode: 503, statusMessage: NOT_CONFIGURED })
  await requireCaller(event, settings, { ownerOnly: true })
  const { id } = (await readBody(event).catch(() => null)) ?? {}
  const store = createOwnerStore({ pocketbaseUrl: settings.pocketbaseUrl, authorization: getHeader(event, 'authorization') })
  return cancelCharge({ store, sumup: useCard(settings).sumup, id })
})
```

Create `server/api/card/refresh.post.js`:

```js
// POST /api/card/refresh { id }: the open payment sheet asks every 2 s. The payment is read and, when SumUp
// has a result, written with the owner's own token (same lookup, mapping and 10-minute rule as the poll),
// so results arrive without the return URL and the poll. Answers { payment } without its callback token.
import { cardSettings } from '../../utils/cardSettings.js'
import { requireCaller } from '../../utils/requireCaller.js'
import { useCard } from '../../utils/card.js'
import { refreshPayment, createOwnerStore, NOT_CONFIGURED } from '../../utils/cardPayments.js'

export default defineEventHandler(async (event) => {
  const settings = cardSettings(process.env)
  if (!settings.configured) throw createError({ statusCode: 503, statusMessage: NOT_CONFIGURED })
  await requireCaller(event, settings, { ownerOnly: true })
  const { id } = (await readBody(event).catch(() => null)) ?? {}
  const store = createOwnerStore({ pocketbaseUrl: settings.pocketbaseUrl, authorization: getHeader(event, 'authorization') })
  return refreshPayment({ store, sumup: useCard(settings).sumup, id })
})
```

- [ ] **Step 6: SumUp's return URL**

Create `server/api/card/callback/[id]/[token].post.js`:

```js
// POST /api/card/callback/<payment id>/<token>: SumUp's return URL. No owner check: the per-payment token is
// the key, compared in constant time; a wrong one is a 404. The body is never read (SumUp does not sign it):
// the result is asked of SumUp's transactions API, after the 200 has gone out. Without the notifier login
// (the laptop's nuxt dev) it is off: 404, and the open sheet's refresh finds the result instead.
import { cardSettings } from '../../../../utils/cardSettings.js'
import { useCard } from '../../../../utils/card.js'
import { callbackMatches } from '../../../../utils/cardPayments.js'

export default defineEventHandler(async (event) => {
  const settings = cardSettings(process.env)
  if (!settings.background) throw createError({ statusCode: 404, statusMessage: 'Not found' })
  const id = getRouterParam(event, 'id') ?? ''
  const token = getRouterParam(event, 'token') ?? ''
  const { store, poller } = useCard(settings)
  if (!(await callbackMatches({ store, id, token }))) throw createError({ statusCode: 404, statusMessage: 'Not found' })
  poller.track(id)
  // Not awaited: SumUp gets its answer at once; a failed check is the poll's to repeat
  poller.run().catch(() => {})
  return { ok: true }
})
```

- [ ] **Step 7: The backup poll**

Create `server/plugins/cardPayments.js`:

```js
// Starts the card payments' backup poll: every 15 s it asks SumUp about the payments still pending (and
// does nothing while none is), so a payment whose app closed before the result is settled anyway. It needs
// the notifier login; without it (the laptop's nuxt dev) only the open sheet's refresh finds results.
import { cardSettings } from '../utils/cardSettings.js'
import { useCard } from '../utils/card.js'
import { CARD_POLL_MS } from '../utils/cardPayments.js'

export default defineNitroPlugin(() => {
  if (import.meta.prerender) return
  const settings = cardSettings(process.env)
  if (!settings.configured) {
    console.info(`[card] off, missing: ${settings.missing.join(', ')}`)
    return
  }
  if (!settings.background) {
    console.info(`[card] return URL and backup poll off, missing: ${settings.backgroundMissing.join(', ')}`)
    return
  }
  const { poller } = useCard(settings)
  // Payments left pending by a restart are picked up first
  poller.loadPending().then(() => poller.run())
  setInterval(() => poller.run(), CARD_POLL_MS)
})
```

- [ ] **Step 8: The owner's sandbox check**

Create `scripts/sumup-sandbox-check.mjs`:

```js
// The owner's hand-run check of the SumUp integration against the SANDBOX, through the same client the
// server uses (server/utils/sumup.js). Never part of the automated tests.
//   npm run sumup:sandbox-check                 merchant, readers, then (after a yes) a 1,00 € checkout on the paired reader
//   npm run sumup:sandbox-check -- --pair CODE  pairs the Virtual Solo that shows CODE first
// It reads only the SUMUP_* variables (from .env), refuses unless SumUp marks the account as a sandbox,
// and prints statuses and SumUp ids only: never a key.
import { createInterface } from 'node:readline/promises'
import { createSumUpClient, isSandboxMerchant } from '../server/utils/sumup.js'
import { cardSettings } from '../server/utils/cardSettings.js'
import { normalisePairingCode, PAIRING_CODE, READER_NAME, statusFromTransaction, sumupTransactionOf } from '../server/utils/cardPayments.js'

const POLL_MS = 3000
const WAIT_MS = 2 * 60_000

const settings = cardSettings(process.env)
const sumupMissing = settings.missing.filter(name => name.startsWith('SUMUP_'))
if (sumupMissing.length) {
  console.error(`Missing in .env: ${sumupMissing.join(', ')}`)
  process.exit(1)
}
const sumup = createSumUpClient({ apiKey: settings.apiKey, merchantCode: settings.merchantCode, apiUrl: settings.apiUrl, affiliate: { appId: settings.appId, key: settings.affiliateKey } })
const ask = createInterface({ input: process.stdin, output: process.stdout })
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms))

try {
  const merchant = await sumup.getMerchant()
  if (!isSandboxMerchant(merchant)) {
    console.error('This is not a SumUp sandbox account (sandbox is not true). Stopping: nothing was sent.')
    process.exit(1)
  }
  console.log('Sandbox merchant: yes')

  const pairIndex = process.argv.indexOf('--pair')
  if (pairIndex > -1) {
    const code = normalisePairingCode(process.argv[pairIndex + 1])
    if (!PAIRING_CODE.test(code)) throw new Error('--pair needs the 8 or 9 character code the Virtual Solo shows')
    const reader = await sumup.createReader({ pairingCode: code, name: READER_NAME })
    console.log(`Paired: ${reader.id} (${reader.status})`)
  }

  const readers = await sumup.listReaders()
  console.log(`Readers: ${readers.length}`)
  for (const reader of readers) console.log(`  ${reader.id}  ${reader.status}  ${reader.device?.model ?? '?'}`)
  const paired = readers.find(reader => reader.status === 'paired')
  if (!paired) {
    console.log('No paired reader. Open the Virtual Solo, go to Connections → API → Connect, then run: npm run sumup:sandbox-check -- --pair <code>')
    process.exit(0)
  }
  const status = await sumup.readerStatus(paired.id).catch(error => ({ status: `unknown (${error.message})` }))
  console.log(`Reader status: ${status?.status} ${status?.state ?? ''}`)

  if ((await ask.question(`Send a 1,00 € sandbox checkout to ${paired.id}? (y/N) `)).trim().toLowerCase() !== 'y') process.exit(0)
  const foreignId = `check${Date.now().toString(36)}`
  const checkout = await sumup.checkout(paired.id, { cents: 100, description: 'Akinai sandbox check', returnUrl: null, foreignId })
  console.log(`Checkout accepted: client_transaction_id ${checkout.client_transaction_id ?? '(none)'}, foreign_transaction_id ${foreignId}`)
  console.log('Pay or cancel on the Virtual Solo. Press Enter here to Cancel on terminal instead.')

  let terminate = false
  ask.once('line', () => { terminate = true })
  let last = ''
  const until = Date.now() + WAIT_MS
  while (Date.now() < until) {
    if (terminate) {
      terminate = false
      await sumup.terminate(paired.id).then(() => console.log('Terminate: accepted'), error => console.log(`Terminate: ${error.message}`))
    }
    const transaction = await sumup.findTransaction({ clientTransactionId: checkout.client_transaction_id ?? '', foreignTransactionId: foreignId }).catch(error => ({ status: `error ${error.message}` }))
    const line = transaction ? `${transaction.status} → ${statusFromTransaction(transaction)} ${sumupTransactionOf(transaction)}` : 'not found yet → pending'
    if (line !== last) console.log(`Transaction: ${line}`)
    last = line
    if (transaction && statusFromTransaction(transaction) !== 'pending') break
    await sleep(POLL_MS)
  }
  // By foreign id as well, to confirm the server's fallback lookup finds the same transaction
  const byForeign = await sumup.findTransaction({ foreignTransactionId: foreignId }).catch(error => ({ status: `error ${error.message}` }))
  console.log(`Lookup by foreign_transaction_id: ${byForeign ? `${byForeign.status} ${sumupTransactionOf(byForeign)}` : 'not found'}`)
} catch (error) {
  console.error(`Stopped: ${error.message}`)
  process.exitCode = 1
} finally {
  ask.close()
}
```

In `package.json`, replace

```json
    "pb:migrate": "node scripts/pb-migrate.mjs"
```

with

```json
    "pb:migrate": "node scripts/pb-migrate.mjs",
    "sumup:sandbox-check": "node --env-file=.env scripts/sumup-sandbox-check.mjs"
```

**Do not run `npm run sumup:sandbox-check`** (it loads `.env` and talks to SumUp). Check it without any env instead:

```bash
for f in server/utils/card.js server/api/card/*.js "server/api/card/callback/[id]/[token].post.js" server/plugins/cardPayments.js scripts/sumup-sandbox-check.mjs; do node --check "$f" || echo "FAIL $f"; done
env -i PATH="$PATH" node scripts/sumup-sandbox-check.mjs; echo "exit $?"
```

Expected: no `FAIL`, then `Missing in .env: SUMUP_API_KEY, SUMUP_MERCHANT_CODE, SUMUP_AFFILIATE_KEY, SUMUP_AFFILIATE_APP_ID` and `exit 1`.

- [ ] **Step 9: Smoke-test the routes on a scratch server without `.env`**

The :3000 server loads the repo's `.env`; a curl to its card routes could reach SumUp. So the routes are checked on a throwaway copy of the working tree, without `.env`, with placeholder settings that point at `.invalid` hosts (which never resolve):

```bash
S="$(mktemp -d)/akinai-card-smoke" && mkdir -p "$S"
git ls-files -co --exclude-standard | tar -cf - -T - | tar -x -C "$S"
test ! -e "$S/.env" && echo "no .env"
cp -Rc node_modules "$S/node_modules"
echo "$S"
```

Expected: `no .env` and the folder's path. Start the scratch server in the background (Bash `run_in_background: true`) from that folder, first unconfigured:

```bash
cd "<the folder>" && test ! -e .env && npx nuxt dev --port 3100
```

When `curl -s localhost:3100/api/card/terminal` answers, run:

```bash
curl -s localhost:3100/api/card/terminal
curl -s -o /dev/null -w "charge %{http_code}\n" -X POST -H 'content-type: application/json' -d '{"source":"cart","amount":5,"cart":{}}' localhost:3100/api/card/charge
curl -s -o /dev/null -w "refresh %{http_code}\n" -X POST localhost:3100/api/card/refresh
curl -s -o /dev/null -w "callback %{http_code}\n" -X POST localhost:3100/api/card/callback/pay000000000001/x
```

Expected: `{ "configured": false, "paired": false, "reader": null }`, `charge 503`, `refresh 503`, `callback 404`. Stop that server and start it again the laptop's way (no notifier login):

```bash
cd "<the folder>" && test ! -e .env && POCKETBASE_URL=https://pb.invalid OWNER_ID=owner0000000001 SUMUP_API_KEY=placeholder SUMUP_MERCHANT_CODE=TEST0000 SUMUP_AFFILIATE_KEY=placeholder SUMUP_AFFILIATE_APP_ID=com.example.test SUMUP_API_URL=https://sumup.invalid npx nuxt dev --port 3100
```

When it answers, run:

```bash
curl -s -o /dev/null -w "terminal %{http_code}\n" localhost:3100/api/card/terminal
curl -s -o /dev/null -w "refresh %{http_code}\n" -X POST localhost:3100/api/card/refresh
curl -s -o /dev/null -w "charge %{http_code}\n" -X POST localhost:3100/api/card/charge
curl -s -o /dev/null -w "callback %{http_code}\n" -X POST localhost:3100/api/card/callback/pay000000000001/tok
```

Expected: `terminal 401`, `refresh 401`, `charge 401`, `callback 404`, and the output shows `[card] return URL and backup poll off, missing: NOTIFIER_EMAIL, NOTIFIER_PASSWORD`. Stop that server (TaskStop on its background task). Start it again from the same folder with placeholder settings:

```bash
cd "<the folder>" && test ! -e .env && POCKETBASE_URL=https://pb.invalid OWNER_ID=owner0000000001 NOTIFIER_EMAIL=n@example.invalid NOTIFIER_PASSWORD=placeholder SUMUP_API_KEY=placeholder SUMUP_MERCHANT_CODE=TEST0000 SUMUP_AFFILIATE_KEY=placeholder SUMUP_AFFILIATE_APP_ID=com.example.test SUMUP_API_URL=https://sumup.invalid npx nuxt dev --port 3100
```

When it answers, run:

```bash
curl -s -o /dev/null -w "terminal %{http_code}\n" localhost:3100/api/card/terminal
curl -s -o /dev/null -w "terminal junk %{http_code}\n" -H 'Authorization: junk' localhost:3100/api/card/terminal
curl -s -o /dev/null -w "charge %{http_code}\n" -X POST localhost:3100/api/card/charge
curl -s -o /dev/null -w "callback bad id %{http_code}\n" -X POST localhost:3100/api/card/callback/x/y
curl -s -o /dev/null -w "callback unknown %{http_code}\n" -X POST localhost:3100/api/card/callback/pay000000000001/tok
```

Expected: `terminal 401`, `terminal junk 401`, `charge 401`, `callback bad id 404`, `callback unknown 404`, and the scratch server's output shows `[card] Could not list pending payments: error` (the poll started; `pb.invalid` does not resolve). Stop the scratch server and delete the folder (`rm -rf "<the folder>"`).

- [ ] **Step 10: Run all unit tests**

Run the time zones and Node 20 (Working setup). Expected: `tests 382` and `fail 0` everywhere.

- [ ] **Step 11: Commit**

```bash
git add server/utils/requireCaller.js server/utils/card.js server/api/card/terminal.get.js server/api/card/pair.post.js server/api/card/unpair.post.js server/api/card/charge.post.js server/api/card/cancel.post.js server/api/card/refresh.post.js "server/api/card/callback/[id]/[token].post.js" server/plugins/cardPayments.js scripts/sumup-sandbox-check.mjs package.json tests/unit/require-caller.test.js
git commit -m "Add the owner's card routes with the 2 s refresh, SumUp's return URL, the 15 s backup poll and the sandbox check

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 6: The card routes in the app, and Settings → Card terminal

**Files:**
- Create: `composables/useCardPayments.js`, `components/CardTerminalSettings.vue`
- Modify: `pages/settings.vue` (section and list entry), `utils/icons.js` (`credit-card`)
- Modify: `tests/e2e/fake-pocketbase.js` (`card_payments`), `tests/e2e/fixtures.js` (`api.card`, the faked routes)
- Test: `tests/e2e/card-terminal.spec.js` (new), `tests/e2e/mobile.spec.js` (`/settings#card`)

**Interfaces:**
- Consumes: Task 5's routes; `useTransactions().transactionExists(recordId)`; `useCheckout().bookSale(booking, payment)`; `useToast().toast`.
- Produces:
  - `useCardPayments()` → `{ terminalState, terminal(), loadTerminal(), pair(code), unpair(), charge(request) → { id }, cancel(id) → { status }, refresh(id) → { payment }, watch(id, onChange) → stop(), bookPayment(payment) → Promise<boolean>, bookApproved() → Promise<number>, startCardBooking() }`. `watch` refreshes every 2 s; `bookApproved` refreshes pending payments first. `terminalState` is an app-wide ref `{ configured, paired, reader } | null`;
  - the icon `credit-card`;
  - in the e2e fixture: `api.card` (`configured`, `paired`, `reader`, `pairStatus`, `chargeStatus`, `cancelStatus`, `refreshStatus`, `message`, `cancelResult`, `charges`, `pairs`, `cancels`, `unpairs`, `refreshes`, `onRefresh`), `api.pairTerminal()`, `api.settleCard(status, sumupTransaction?)`; the fake PocketBase has an owner-only `card_payments` collection.

- [ ] **Step 1: Fake the card routes in the e2e fixture**

In `tests/e2e/fake-pocketbase.js`, replace

```js
const COLLECTIONS = ['categories', 'budget_tracket_catalog', 'stock_movements', 'budget_tracker_transactions', 'deals', 'commissions', 'print_jobs', 'conventions', 'push_subscriptions']
const OWNER_READ_ONLY = new Set(['stock_movements', 'budget_tracker_transactions', 'commissions', 'print_jobs', 'conventions', 'push_subscriptions'])
```

with

```js
const COLLECTIONS = ['categories', 'budget_tracket_catalog', 'stock_movements', 'budget_tracker_transactions', 'deals', 'commissions', 'print_jobs', 'conventions', 'push_subscriptions', 'card_payments']
const OWNER_READ_ONLY = new Set(['stock_movements', 'budget_tracker_transactions', 'commissions', 'print_jobs', 'conventions', 'push_subscriptions', 'card_payments'])
```

and replace

```js
  push_subscriptions: { device: '' }
}
```

with

```js
  push_subscriptions: { device: '' },
  card_payments: { description: '', cart: null, sumup_checkout: '', sumup_transaction: '', booked_transaction: '', callback_token: '' }
}
```

In `tests/e2e/fixtures.js`, below the line `const NOTIFIER_ROUTES = /\/api\/(push\/(status|test)|calendar\/link)$/` add:

```js
// The card routes, answered from `api.card`: the tests never reach SumUp
const CARD_ROUTES = /\/api\/card\/(terminal|pair|unpair|charge|cancel|refresh)$/
```

replace

```js
      notifier: { configured: false, feed: false, publicKey: TEST_VAPID_KEY, lastRun: null, lastError: null, lastProblem: null, devices: null, secret: 'feedsecret', testStatus: 200, tests: [] }
    }
```

with

```js
      notifier: { configured: false, feed: false, publicKey: TEST_VAPID_KEY, lastRun: null, lastError: null, lastProblem: null, devices: null, secret: 'feedsecret', testStatus: 200, tests: [] },
      // What the server's card routes answer: unconfigured by default. `charges`, `pairs` and `cancels` collect
      // the bodies sent; a charge creates its card_payments record in the fake PocketBase, as the server would.
      // A status other than 200 answers with `message`, like the server's errors.
      card: {
        configured: false,
        paired: false,
        reader: { id: 'rdr_3MSAFM23CK82VSTT4BN6RWSQ65', name: 'Akinai', status: 'online' },
        pairStatus: 200,
        chargeStatus: 200,
        cancelStatus: 200,
        refreshStatus: 200,
        message: '',
        cancelResult: 'cancelled',
        charges: [],
        pairs: [],
        cancels: [],
        unpairs: 0,
        refreshes: 0,
        // What SumUp would answer when the server refreshes a payment: (payment) => changes it, or null
        onRefresh: null
      },
      // A configured server with a paired Solo
      pairTerminal () {
        api.card.configured = true
        api.card.paired = true
      },
      // SumUp's result for the latest card payment, as the callback or the poll would record it
      settleCard (status, sumupTransaction = '') {
        const payment = fake.db.card_payments.at(-1)
        payment.status = status
        if (sumupTransaction) payment.sumup_transaction = sumupTransaction
      }
    }
```

and directly above `    await use(api)` add:

```js
    await context.route(CARD_ROUTES, (route) => {
      const request = route.request()
      const path = new URL(request.url()).pathname
      const state = api.card
      const json = (status, body) => route.fulfill({ status, json: body })
      const failed = status => json(status, { statusCode: status, message: state.message })
      if (path === '/api/card/terminal' && !state.configured) return json(200, { configured: false, paired: false, reader: null })
      if (!state.configured) return json(503, { statusCode: 503, message: "Card payments aren't configured on the server" })
      if (request.headers().authorization !== FAKE_TOKEN) return json(401, { statusCode: 401, message: 'Log in again' })
      const body = request.postDataJSON() ?? {}
      if (path === '/api/card/terminal') return json(200, { configured: true, paired: state.paired, reader: state.paired ? state.reader : null })
      if (path === '/api/card/pair') {
        state.pairs.push(body)
        if (state.pairStatus !== 200) return failed(state.pairStatus)
        state.paired = true
        return json(200, { paired: true, reader: { ...state.reader, status: 'unknown' } })
      }
      if (path === '/api/card/unpair') {
        state.unpairs++
        state.paired = false
        return json(200, { paired: false, reader: null })
      }
      if (path === '/api/card/charge') {
        state.charges.push(body)
        if (state.chargeStatus !== 200) return failed(state.chargeStatus)
        const id = `pay${String(state.charges.length).padStart(12, '0')}`
        fake.db.card_payments.push({
          id,
          collectionName: 'card_payments',
          amount: body.amount,
          description: 'Akinai sale',
          source: body.source,
          cart: body.cart,
          status: 'pending',
          sumup_checkout: '',
          sumup_transaction: '',
          booked_transaction: '',
          callback_token: '0'.repeat(64),
          created: new Date().toISOString().replace('T', ' ')
        })
        return json(200, { id })
      }
      if (path === '/api/card/refresh') {
        // The server would ask SumUp here; the fake answers what api.settleCard() or onRefresh recorded
        state.refreshes++
        if (state.refreshStatus !== 200) return failed(state.refreshStatus)
        const found = fake.db.card_payments.find(item => item.id === body.id)
        if (!found) return json(404, { statusCode: 404, message: 'Unknown payment' })
        if (found.status === 'pending' && state.onRefresh) state.onRefresh(found)
        const { callback_token: secret, ...visible } = found
        return json(200, { payment: visible })
      }
      state.cancels.push(body.id)
      if (state.cancelStatus !== 200) return failed(state.cancelStatus)
      const payment = fake.db.card_payments.find(item => item.id === body.id)
      if (payment?.status === 'pending') payment.status = state.cancelResult
      return json(200, { status: payment?.status ?? 'cancelled' })
    })
```

- [ ] **Step 2: Write the failing e2e tests**

Create `tests/e2e/card-terminal.spec.js`:

```js
import { test, expect, gotoReady } from './fixtures.js'

// Settings → Card terminal against the faked /api/card/* routes (api.card): SumUp is never contacted
// The BaseCard (the page's own <section id="card"> holds it too)
const section = page => page.locator('section.card', { has: page.getByRole('heading', { name: 'Card terminal', exact: true }) })

test.describe('Settings → Card terminal', () => {
  test('without SumUp on the server it says so', async ({ page, api }) => {
    api.enable()
    await gotoReady(page, '/settings#card')
    await expect(section(page)).toContainText("Card payments aren't configured on the server")
    await expect(section(page).getByLabel('Pairing code')).toHaveCount(0)
  })

  test('pairing sends the code, then shows the Solo; Unpair brings the code field back', async ({ page, api }) => {
    api.enable()
    api.card.configured = true
    await gotoReady(page, '/settings#card')
    const card = section(page)
    await card.getByLabel('Pairing code').fill('ab12cd34')
    await card.getByRole('button', { name: 'Pair terminal' }).click()
    await expect(page.getByText('Terminal paired')).toBeVisible()
    expect(api.card.pairs).toEqual([{ code: 'ab12cd34' }])
    await expect(card.getByTestId('card-reader-name')).toHaveText('Akinai')
    await expect(card.getByTestId('card-reader-status')).toHaveText('Status unknown')

    // SumUp's status on the next visit
    await page.reload()
    await page.locator('html[data-hydrated]').waitFor({ state: 'attached' })
    await expect(section(page).getByTestId('card-reader-status')).toHaveText('Online')

    await section(page).getByRole('button', { name: 'Unpair' }).click()
    await expect(page.getByText('Terminal unpaired')).toBeVisible()
    expect(api.card.unpairs).toBe(1)
    await expect(section(page).getByLabel('Pairing code')).toBeVisible()
  })

  test('an empty code is refused here, a wrong one with the server\'s message', async ({ page, api }) => {
    api.enable()
    api.card.configured = true
    await gotoReady(page, '/settings#card')
    const card = section(page)
    await card.getByRole('button', { name: 'Pair terminal' }).click()
    await expect(card.getByRole('alert')).toHaveText('Enter the code the Solo shows')
    expect(api.card.pairs).toEqual([])

    api.card.pairStatus = 400
    api.card.message = "That code didn't work. Start pairing on the Solo again and enter the new code."
    await card.getByLabel('Pairing code').fill('ZZZZ9999')
    await card.getByRole('button', { name: 'Pair terminal' }).click()
    await expect(card.getByRole('alert')).toHaveText("That code didn't work. Start pairing on the Solo again and enter the new code.")
    await expect(card.getByLabel('Pairing code')).toHaveValue('ZZZZ9999')
  })

  test('an offline Solo shows Offline; offline the section needs a connection', async ({ page, api, context }) => {
    api.enable()
    api.pairTerminal()
    api.card.reader.status = 'offline'
    await gotoReady(page, '/settings#card')
    await expect(section(page).getByTestId('card-reader-status')).toHaveText('Offline')
    await context.setOffline(true)
    await page.evaluate(() => window.dispatchEvent(new Event('offline')))
    await expect(section(page)).toContainText('Needs a connection')
    await context.setOffline(false)
    await expect(section(page).getByTestId('card-reader-status')).toHaveText('Offline')
  })
})
```

In `tests/e2e/mobile.spec.js`, in `PAGES`, below `'/settings#notifications',` add `'/settings#card',`.

- [ ] **Step 3: Run them to verify they fail**

Run: `npx playwright test tests/e2e/card-terminal.spec.js`
Expected: 8 failures (4 tests × 2 projects), each waiting for the `Card terminal` heading.

- [ ] **Step 4: The composable**

Create `composables/useCardPayments.js`:

```js
import { ref } from 'vue'
import { usePocketBase } from './usePocketBase'
import { useTransactions } from './useTransactions'
import { useCheckout } from './useCheckout'
import { useToast } from './useToast'
import { formatCurrency } from '~/utils/currency'

const CARD_PAYMENTS = 'card_payments'
// Whether a Solo was paired when the server last said, so Pay by card shows (disabled) offline too.
// Only the two flags are kept, never the reader's id.
const TERMINAL_KEY = 'akinai-card-terminal'
export const WATCH_MS = 2000

// App-wide: the server's last answer about the terminal, the bookings under way and the online listener
const terminalState = ref(null)
const TERMINAL_MAX_AGE_MS = 5 * 60_000
let fetchedAt = 0
const bookings = new Map()
let listening = false

const readSaved = () => {
  try {
    const saved = JSON.parse(localStorage.getItem(TERMINAL_KEY))
    return saved && typeof saved === 'object' ? { configured: !!saved.configured, paired: !!saved.paired, reader: null } : null
  } catch {
    return null
  }
}
const save = (value) => {
  try {
    localStorage.setItem(TERMINAL_KEY, JSON.stringify({ configured: !!value.configured, paired: !!value.paired }))
  } catch {}
}

// Card payments on the SumUp Solo: the server's card routes (with the owner's token), watching a payment's
// record, and booking an approved payment exactly once
export const useCardPayments = () => {
  const pb = usePocketBase()
  const { transactionExists } = useTransactions()
  const { bookSale } = useCheckout()
  const { toast } = useToast()
  const auth = () => ({ Authorization: pb.authStore.token })

  const remember = (value) => {
    fetchedAt = Date.now()
    terminalState.value = value
    save(value)
    return value
  }

  // GET /api/card/terminal → { configured, paired, reader: { id, name, status } | null }
  const terminal = async () => remember(await $fetch('/api/card/terminal', { headers: auth() }))

  // The last known state at once, then the server's when online (a failure keeps the last known one).
  // The server asks SumUp, so an answer younger than 5 minutes is reused (Settings always asks afresh).
  const loadTerminal = async () => {
    if (!terminalState.value) terminalState.value = readSaved()
    if (!navigator.onLine || !pb.authStore.isValid || Date.now() - fetchedAt < TERMINAL_MAX_AGE_MS) return terminalState.value
    try {
      return await terminal()
    } catch {
      return terminalState.value
    }
  }

  const pair = async code => remember({ configured: true, ...(await $fetch('/api/card/pair', { method: 'POST', headers: auth(), body: { code } })) })
  const unpair = async () => remember({ configured: true, ...(await $fetch('/api/card/unpair', { method: 'POST', headers: auth() })) })

  // request: { source: 'cart' | 'home', amount, description, cart } → { id }
  // The server gives SumUp 15 s; a request that hangs past 45 s fails, so the sheet never waits for ever
  const charge = request => $fetch('/api/card/charge', { method: 'POST', headers: auth(), body: request, timeout: 45_000 })
  // → { status } once SumUp has taken the stop
  const cancel = id => $fetch('/api/card/cancel', { method: 'POST', headers: auth(), body: { id } })

  // → { payment }: the server asks SumUp and records a result with the owner's token
  const refresh = id => $fetch('/api/card/refresh', { method: 'POST', headers: auth(), body: { id }, timeout: 20_000 })

  // Refreshes the payment every 2 s and hands each answer to onChange, until it is no longer pending or
  // stop() is called. The refresh brings the result even without SumUp's return URL and the server's poll;
  // when it fails (SumUp did not answer), the record is read instead, and the next round tries again.
  const watch = (id, onChange) => {
    let stopped = false
    let timer = null
    const read = async () => {
      if (stopped) return
      let payment = null
      try {
        payment = (await refresh(id)).payment
      } catch {
        try {
          payment = await pb.collection(CARD_PAYMENTS).getOne(id)
        } catch {}
      }
      if (stopped) return
      if (payment) {
        onChange(payment)
        if (payment.status !== 'pending') return
      }
      if (!stopped) timer = setTimeout(read, WATCH_MS)
    }
    read()
    return () => {
      stopped = true
      clearTimeout(timer)
    }
  }

  // An approved payment is booked once, with the payment's record id as the sale's id: a sale already on
  // this device, in its queue or on the server is not booked again (and the server refuses a second record
  // with that id anyway). Then the payment is marked booked. Resolves true when this call booked the sale.
  // Throws only when it cannot tell whether the sale exists (no connection): it is tried again later.
  const runBooking = async (payment) => {
    const exists = await transactionExists(payment.id)
    if (!exists) {
      await bookSale(payment.cart, { paymentMethod: 'card', sumupTransaction: payment.sumup_transaction, recordId: payment.id })
    }
    try {
      await pb.collection(CARD_PAYMENTS).update(payment.id, { booked_transaction: payment.id })
    } catch {
      // The next check finds the sale and only sets the mark
    }
    return !exists
  }

  const bookPayment = (payment) => {
    if (payment?.status !== 'approved' || payment.booked_transaction || !payment.cart) return Promise.resolve(false)
    // A second call while the first is booking (the sheet and the check on mount) shares it
    if (!bookings.has(payment.id)) bookings.set(payment.id, runBooking(payment).finally(() => bookings.delete(payment.id)))
    return bookings.get(payment.id)
  }

  // Payments still pending (the app closed before the result, and no return URL or poll settled them, as in
  // nuxt dev): each is refreshed once, so an approved one is booked below
  const settlePending = async () => {
    let pending = []
    try {
      pending = await pb.collection(CARD_PAYMENTS).getFullList({ filter: 'status = "pending"', sort: 'created' })
    } catch {
      return
    }
    for (const payment of pending) {
      try {
        await refresh(payment.id)
      } catch {}
    }
  }

  // Approved payments that no device has booked yet (the app closed or lost signal while the customer
  // paid): each is booked once, with a toast. Offline or logged out it does nothing.
  const bookApproved = async () => {
    if (!navigator.onLine || !pb.authStore.isValid) return 0
    await settlePending()
    let approved
    try {
      approved = await pb.collection(CARD_PAYMENTS).getFullList({ filter: 'status = "approved" && booked_transaction = ""', sort: 'created' })
    } catch {
      // Not migrated yet (404), still locked (403) or unreachable: nothing to book now
      return 0
    }
    let booked = 0
    for (const payment of approved) {
      try {
        if (await bookPayment(payment)) {
          booked++
          toast(`Card payment of ${formatCurrency(payment.amount)} booked`)
        }
      } catch {}
    }
    return booked
  }

  // From the catalog's and Home's onMounted: book what waits now, and whenever the connection returns
  const startCardBooking = () => {
    bookApproved()
    if (!listening) {
      listening = true
      window.addEventListener('online', () => bookApproved())
    }
  }

  return { terminalState, terminal, loadTerminal, pair, unpair, charge, cancel, refresh, watch, bookPayment, bookApproved, startCardBooking }
}
```

- [ ] **Step 5: Settings → Card terminal**

In `utils/icons.js`, directly above the line starting `  cart: 'M3 3h2l.4 2`, add:

```js
  'credit-card': 'M3 10h18M7 15h1m4 0h1m-7 4h12a3 3 0 003-3V8a3 3 0 00-3-3H6a3 3 0 00-3 3v8a3 3 0 003 3z',
```

Create `components/CardTerminalSettings.vue`:

```vue
<template>
  <BaseCard title="Card terminal" subtitle="The SumUp Solo that takes card payments" icon="credit-card">
    <div class="space-y-4">
      <p v-if="error" role="alert" class="rounded-lg bg-expense/10 px-3 py-2 text-sm text-expense">{{ error }}</p>

      <p v-if="offline" class="rounded-lg bg-muted px-3 py-2 text-sm text-ink-muted">Needs a connection</p>
      <p v-else-if="!state" class="text-sm text-ink-muted">Loading the terminal...</p>
      <p v-else-if="!state.configured" class="text-sm text-ink-muted">Card payments aren't configured on the server</p>

      <template v-else-if="state.paired && state.reader">
        <div class="flex min-w-0 items-center justify-between gap-3">
          <div class="min-w-0">
            <p class="truncate text-sm font-medium text-ink" data-testid="card-reader-name">{{ state.reader.name }}</p>
            <p class="text-sm" :class="STATUS_CLASS[state.reader.status] ?? 'text-ink-muted'" data-testid="card-reader-status">{{ STATUS_LABEL[state.reader.status] ?? 'Status unknown' }}</p>
          </div>
          <BaseButton variant="danger-ghost" class="shrink-0" :loading="busy" @click="run(unpair, 'Terminal unpaired')">Unpair</BaseButton>
        </div>
      </template>

      <form v-else class="space-y-2" novalidate @submit.prevent="pairNow">
        <label for="card-pairing-code" class="label">Pairing code</label>
        <input
          id="card-pairing-code"
          v-model="code"
          type="text"
          class="input uppercase tracking-widest"
          autocomplete="off"
          autocapitalize="characters"
          spellcheck="false"
          maxlength="12"
        >
        <p class="hint">On the Solo, open Connections → API → Connect: it shows the code. The code expires after 5 minutes.</p>
        <BaseButton type="submit" block icon="credit-card" :loading="busy">Pair terminal</BaseButton>
      </form>
    </div>
  </BaseCard>
</template>

<script setup>
import { ref, onMounted, onBeforeUnmount } from 'vue'
import { useCardPayments } from '~/composables/useCardPayments'
import { useToast } from '~/composables/useToast'

const STATUS_LABEL = { online: 'Online', offline: 'Offline', unknown: 'Status unknown' }
const STATUS_CLASS = { online: 'text-income', offline: 'text-expense' }
const UNREACHABLE = 'Could not reach the server. Try again later.'

const { terminal, pair, unpair } = useCardPayments()
const { toast } = useToast()

const state = ref(null)
const offline = ref(false)
const busy = ref(false)
const error = ref('')
const code = ref('')

const messageOf = err => (err?.statusCode === 401 ? 'Log in again to manage the terminal' : err?.data?.message || UNREACHABLE)

const load = async () => {
  offline.value = !navigator.onLine
  error.value = ''
  if (offline.value) return
  try {
    state.value = await terminal()
  } catch (err) {
    error.value = messageOf(err)
  }
}

const run = async (action, done) => {
  if (busy.value) return
  busy.value = true
  error.value = ''
  try {
    state.value = await action()
    toast(done)
  } catch (err) {
    error.value = messageOf(err)
  } finally {
    busy.value = false
  }
}

// The server checks the code too; this only catches an empty field without a round trip
const pairNow = () => {
  if (!code.value.trim()) {
    error.value = 'Enter the code the Solo shows'
    return
  }
  run(async () => {
    const result = await pair(code.value)
    code.value = ''
    return result
  }, 'Terminal paired')
}

const wentOffline = () => { offline.value = true }

onMounted(() => {
  window.addEventListener('online', load)
  window.addEventListener('offline', wentOffline)
  load()
})

onBeforeUnmount(() => {
  window.removeEventListener('online', load)
  window.removeEventListener('offline', wentOffline)
})
</script>
```

In `pages/settings.vue`, replace

```vue
        <NotificationSettings v-if="activeCategory === 'notifications'" />
```

with

```vue
        <NotificationSettings v-if="activeCategory === 'notifications'" />

        <CardTerminalSettings v-if="activeCategory === 'card'" />
```

and in `SETTINGS_CATEGORIES`, below the `notifications` entry, add:

```js
  { id: 'card', name: 'Card terminal', description: 'SumUp Solo for card payments', icon: 'credit-card' },
```

- [ ] **Step 6: Run the e2e tests**

Run: `npx playwright test tests/e2e/card-terminal.spec.js tests/e2e/settings.spec.js`
Expected: all pass (card-terminal: 8 passed).

Run: `npx playwright test tests/e2e/mobile.spec.js -g "settings#card" --project=mobile`
Expected: 3 passed (no horizontal scroll, light and dark; 44px targets).

Run: `npm run test:unit`
Expected: `tests 376`, `fail 0` (`no-raw-colours.test.js` covers the new component).

- [ ] **Step 7: Commit**

```bash
git add composables/useCardPayments.js components/CardTerminalSettings.vue pages/settings.vue utils/icons.js tests/e2e/fake-pocketbase.js tests/e2e/fixtures.js tests/e2e/card-terminal.spec.js tests/e2e/mobile.spec.js
git commit -m "Add Settings → Card terminal to pair and unpair the Solo, and the app side of the card routes

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 7: Pay by card in the cart and on Home, booking exactly once, and the rollout

**Files:**
- Modify: `components/BottomSheet.vue` (`dismissible`, top sheet only)
- Create: `components/CardPaymentSheet.vue`
- Modify: `components/CartPanel.vue`, `pages/catalog.vue`, `components/TransactionForm.vue`, `pages/index.vue`
- Modify: `README.md`, `.env.example`
- Test: `tests/e2e/card-payments.spec.js` (new), `tests/e2e/mobile.spec.js`

**Interfaces:**
- Consumes: `useCardPayments()` (Task 6), `useCheckout().bookSale` and `checkoutBooking`/`homeBooking` (Task 2), the faked routes `api.card`, `api.pairTerminal()`, `api.settleCard()` (Task 6).
- Produces:
  - `<BottomSheet :dismissible>` (default `true`);
  - `<CardPaymentSheet v-model:open :request @paid>`: `request` is `{ source, amount, description, cart }`; it charges once per opening, watches the record, books an approved payment (`bookPayment`) and emits `paid(payment)`;
  - `<CartPanel :card="{ show, offline }" @card>`.

- [ ] **Step 1: Write the failing e2e tests**

Create `tests/e2e/card-payments.spec.js`:

```js
import { test, expect, gotoReady, openTransactionForm } from './fixtures.js'
import { GATCHA_CATEGORIES, GATCHA, prizeSheet } from './gatcha-data.js'

// Pay by card against the faked /api/card/* routes (api.card): a charge creates its card_payments record
// in the fake PocketBase, and api.settleCard() records SumUp's result as the server would. SumUp is never contacted.
const card = (page, name) => page.locator('h3', { hasText: name })
const sheet = page => page.getByRole('dialog', { name: 'Card payment' })
const state = page => sheet(page).getByTestId('card-payment-state')
const isPhone = page => page.viewportSize().width < 1024
const openCart = async (page) => {
  if (isPhone(page)) await page.getByRole('button', { name: /View cart/ }).click()
}
const payByCard = page => page.getByRole('button', { name: /^Pay by card/ })

async function cartWithTwoArticles (page, api) {
  await api.mockCatalog()
  api.pairTerminal()
  await gotoReady(page, '/catalog')
  await card(page, 'Dragon Figure').click()
  await card(page, 'Dragon Figure').click()
  await card(page, 'Phone Stand').click()
  await openCart(page)
}

test.describe('Pay by card in the cart', () => {
  test('the button shows only with a paired Solo', async ({ page, api }) => {
    await api.mockCatalog()
    await gotoReady(page, '/catalog')
    await card(page, 'Dragon Figure').click()
    await openCart(page)
    await expect(page.getByRole('button', { name: 'Add to Balance' })).toBeVisible()
    await expect(payByCard(page)).toHaveCount(0)

    api.pairTerminal()
    await page.reload()
    await page.locator('html[data-hydrated]').waitFor({ state: 'attached' })
    await card(page, 'Dragon Figure').click()
    await openCart(page)
    await expect(payByCard(page)).toHaveText(/Pay by card · 12,50/)
  })

  test('approved: books exactly what Add to Balance would, as a card sale with the payment\'s id, once', async ({ page, api }) => {
    await cartWithTwoArticles(page, api)
    await payByCard(page).click()
    await expect(state(page)).toHaveText(/Waiting for card · 29,00/)
    // Nothing closes the sheet while the terminal has the payment
    await expect(sheet(page).getByRole('button', { name: 'Close' })).toHaveCount(0)
    await page.keyboard.press('Escape')
    await expect(sheet(page)).toBeVisible()

    expect(api.card.charges).toHaveLength(1)
    const charged = api.card.charges[0]
    expect(charged).toMatchObject({ source: 'cart', amount: 29, description: 'Akinai sale' })
    expect(charged.cart.items.map(line => [line.article, line.quantity])).toEqual([['p1', 2], ['p2', 1]])
    expect(charged.cart.stockMovements.map(movement => [movement.article, movement.change])).toEqual([['p1', -2], ['p2', -1]])
    expect(api.posted).toHaveLength(0)

    api.settleCard('approved', 'TEENSK4W2K')
    await expect(state(page)).toHaveText('Paid ✓')
    // The sheet asked the server to refresh the payment (no return URL needed)
    expect(api.card.refreshes).toBeGreaterThan(0)
    await expect.poll(() => api.posted.length).toBe(1)
    const sale = api.posted[0]
    expect(sale).toMatchObject({ id: 'pay000000000001', amount: 29, payment_method: 'card', sumup_transaction: 'TEENSK4W2K', description: charged.cart.description, date: charged.cart.date })
    expect(sale.items).toEqual(charged.cart.items)
    expect(sale.sold_at).toBe(charged.cart.sold_at)
    // The stored booking's movements, with their ids: the same stock change as a cash checkout
    await expect.poll(() => api.db.stock_movements.filter(movement => movement.reason === 'sale').map(movement => movement.id)).toEqual(charged.cart.stockMovements.map(movement => movement.id))
    await expect.poll(() => api.db.card_payments[0].booked_transaction).toBe('pay000000000001')

    await sheet(page).getByRole('button', { name: 'Done' }).click()
    await expect(sheet(page)).toHaveCount(0)
    await expect(page.getByRole('button', { name: /View cart/ })).toHaveCount(0)
    if (!isPhone(page)) await expect(page.getByText('0 items')).toBeVisible()
    // Booked once: a later start finds it booked
    await page.reload()
    await page.locator('html[data-hydrated]').waitFor({ state: 'attached' })
    await page.waitForLoadState('networkidle')
    expect(api.posted).toHaveLength(1)
  })

  test('when the refresh fails (SumUp did not answer) the sheet reads the payment itself', async ({ page, api }) => {
    await cartWithTwoArticles(page, api)
    api.card.refreshStatus = 502
    api.card.message = "SumUp didn't answer. Try again."
    await payByCard(page).click()
    await expect(state(page)).toHaveText(/Waiting for card/)
    api.settleCard('approved', 'TXREAD')
    await expect(state(page)).toHaveText('Paid ✓')
    await expect.poll(() => api.posted.map(sale => sale.sumup_transaction)).toEqual(['TXREAD'])
  })

  test('declined: nothing is booked and the cart stays', async ({ page, api }) => {
    await cartWithTwoArticles(page, api)
    await payByCard(page).click()
    await expect(state(page)).toHaveText(/Waiting for card/)
    api.settleCard('declined')
    await expect(state(page)).toHaveText('Card declined')
    await expect(sheet(page)).toContainText('Nothing was booked')
    await sheet(page).getByRole('button', { name: 'Close' }).last().click()
    await expect(sheet(page)).toHaveCount(0)
    await openCart(page)
    await expect(page.getByText('2 items').first()).toBeVisible()
    expect(api.posted).toHaveLength(0)
    expect(api.db.stock_movements.filter(movement => movement.reason === 'sale')).toHaveLength(0)
  })

  test('Cancel on terminal cancels, and a payment the terminal cancels shows Cancelled', async ({ page, api }) => {
    await cartWithTwoArticles(page, api)
    await payByCard(page).click()
    await expect(state(page)).toHaveText(/Waiting for card/)
    await sheet(page).getByRole('button', { name: 'Cancel on terminal' }).click()
    await expect(state(page)).toHaveText('Cancelled')
    expect(api.card.cancels).toEqual(['pay000000000001'])
    await sheet(page).getByRole('button', { name: 'Close' }).last().click()

    await openCart(page)
    await payByCard(page).click()
    await expect(state(page)).toHaveText(/Waiting for card/)
    api.settleCard('cancelled')
    await expect(state(page)).toHaveText('Cancelled')
    expect(api.posted).toHaveLength(0)
  })

  test('a terminal that does not answer: the server\'s message, nothing booked; failed shows its own line', async ({ page, api }) => {
    await cartWithTwoArticles(page, api)
    api.card.chargeStatus = 502
    api.card.message = "The terminal didn't answer. Check that it's on and online."
    await payByCard(page).click()
    await expect(state(page)).toHaveText("The terminal didn't answer. Check that it's on and online.")
    await sheet(page).getByRole('button', { name: 'Close' }).last().click()

    api.card.chargeStatus = 200
    await openCart(page)
    await payByCard(page).click()
    await expect(state(page)).toHaveText(/Waiting for card/)
    api.settleCard('failed')
    await expect(state(page)).toHaveText("The payment didn't go through")
    expect(api.posted).toHaveLength(0)
  })

  test('after 120 s without a result it asks; Keep waiting waits on and the payment still lands', async ({ page, api }) => {
    await page.clock.install()
    await cartWithTwoArticles(page, api)
    await payByCard(page).click()
    await expect(state(page)).toHaveText(/Waiting for card/)
    await page.clock.runFor(121_000)
    await expect(state(page)).toHaveText('Still waiting for the terminal')
    await expect(sheet(page).getByRole('button', { name: 'Cancel on terminal' })).toBeVisible()
    await sheet(page).getByRole('button', { name: 'Keep waiting' }).click()
    await expect(state(page)).toHaveText(/Waiting for card/)
    api.settleCard('approved', 'TX2')
    await page.clock.runFor(2_100)
    await expect(state(page)).toHaveText('Paid ✓')
    await expect.poll(() => api.posted.length).toBe(1)
  })

  test('offline the button is disabled with Needs a connection', async ({ page, api, context }) => {
    await cartWithTwoArticles(page, api)
    await context.setOffline(true)
    await expect(payByCard(page)).toBeDisabled()
    await expect(page.getByText('Needs a connection')).toBeVisible()
    await context.setOffline(false)
    await expect(payByCard(page)).toBeEnabled()
    expect(api.card.charges).toHaveLength(0)
  })

  test('a gatcha paid by card asks for its prizes once the card sheet closes', async ({ page, api }) => {
    api.seed({ categories: GATCHA_CATEGORIES, articles: [GATCHA, { id: 'k1', name: 'Pikachu Keychain', category: 'cat-keychain', stock: 2 }] })
    api.pairTerminal()
    await gotoReady(page, '/catalog')
    await card(page, 'GatchaPon').click()
    await openCart(page)
    await payByCard(page).click()
    await expect(state(page)).toHaveText(/Waiting for card/)
    expect(api.card.charges[0].cart.prizes).toEqual({ count: 1, categories: ['cat-keychain', 'cat-mini'] })
    expect(api.card.charges[0].cart.stockMovements).toEqual([])
    api.settleCard('approved', 'TX3')
    await expect(state(page)).toHaveText('Paid ✓')
    await expect(prizeSheet(page)).toHaveCount(0)
    await sheet(page).getByRole('button', { name: 'Done' }).click()
    await expect(prizeSheet(page)).toBeVisible()
  })
})

// An approved payment the app never saw (closed or offline while the customer paid)
const approvedPayment = (id, extra = {}) => ({
  id,
  collectionName: 'card_payments',
  amount: 12.5,
  description: 'Akinai sale',
  source: 'home',
  cart: { description: 'Print at the stall', amount: 12.5, notes: '', date: '2026-10-16' },
  status: 'approved',
  sumup_checkout: 'ctx-1',
  sumup_transaction: 'TXLATE',
  booked_transaction: '',
  callback_token: '0'.repeat(64),
  created: '2026-10-16 10:00:00.000Z',
  ...extra
})

test.describe('approved payments booked later', () => {
  test('the next start books it once, with a toast, and marks it booked', async ({ page, api }) => {
    await api.mockTransactions()
    api.db.card_payments.push(approvedPayment('pay000000000077'))
    await gotoReady(page, '/')
    await expect(page.getByText(/Card payment of 12,50.* booked/)).toBeVisible()
    await expect.poll(() => api.posted.length).toBe(1)
    expect(api.posted[0]).toMatchObject({ id: 'pay000000000077', description: 'Print at the stall', amount: 12.5, date: '2026-10-16', payment_method: 'card', sumup_transaction: 'TXLATE' })
    await expect.poll(() => api.db.card_payments[0].booked_transaction).toBe('pay000000000077')
    await gotoReady(page, '/catalog')
    expect(api.posted).toHaveLength(1)
  })

  test('a payment whose sale is already on the server is only marked booked', async ({ page, api }) => {
    await api.mockTransactions()
    api.db.budget_tracker_transactions.push({ id: 'pay000000000078', collectionName: 'budget_tracker_transactions', description: 'Print at the stall', amount: 12.5, notes: '', date: '2026-10-16', created: '2026-10-16 10:00:05.000Z', payment_method: 'card' })
    api.db.card_payments.push(approvedPayment('pay000000000078'))
    await gotoReady(page, '/')
    await expect.poll(() => api.db.card_payments[0].booked_transaction).toBe('pay000000000078')
    expect(api.db.budget_tracker_transactions).toHaveLength(1)
    await expect(page.getByText(/Card payment of .* booked/)).toHaveCount(0)
  })

  test('one left pending (no return URL, no poll) is refreshed on the next start and booked once', async ({ page, api }) => {
    await api.mockTransactions()
    api.pairTerminal()
    api.db.card_payments.push(approvedPayment('pay000000000080', { status: 'pending', sumup_transaction: '' }))
    api.card.onRefresh = (payment) => Object.assign(payment, { status: 'approved', sumup_transaction: 'TXLAPTOP' })
    await gotoReady(page, '/')
    await expect(page.getByText(/Card payment of 12,50.* booked/)).toBeVisible()
    await expect.poll(() => api.posted.map(sale => [sale.id, sale.sumup_transaction])).toEqual([['pay000000000080', 'TXLAPTOP']])
  })

  test('one approved while offline is booked when the connection returns', async ({ page, api, context }) => {
    await api.mockCatalog()
    await gotoReady(page, '/catalog')
    await context.setOffline(true)
    api.db.card_payments.push(approvedPayment('pay000000000079'))
    await context.setOffline(false)
    await expect.poll(() => api.posted.map(sale => sale.id)).toEqual(['pay000000000079'])
  })
})

test.describe('Pay by card on Home', () => {
  test('books the typed income as card; the form clears and closes on Done', async ({ page, api }) => {
    await api.mockTransactions()
    api.pairTerminal()
    await gotoReady(page, '/')
    await openTransactionForm(page)
    await page.getByPlaceholder('What is this transaction for?').fill('Market sale')
    await page.getByPlaceholder('0.00').fill('25')
    await page.getByRole('button', { name: 'Pay by card' }).click()
    await expect(state(page)).toHaveText(/Waiting for card · 25,00/)
    expect(api.card.charges[0]).toMatchObject({ source: 'home', amount: 25, description: 'Akinai sale', cart: { description: 'Market sale', amount: 25, notes: '' } })
    api.settleCard('approved', 'TXHOME')
    await expect(state(page)).toHaveText('Paid ✓')
    await expect.poll(() => api.posted.length).toBe(1)
    expect(api.posted[0]).toMatchObject({ id: 'pay000000000001', description: 'Market sale', amount: 25, payment_method: 'card', sumup_transaction: 'TXHOME' })
    await sheet(page).getByRole('button', { name: 'Done' }).click()
    if (isPhone(page)) await expect(page.getByRole('dialog', { name: 'Add Transaction' })).toHaveCount(0)
    await openTransactionForm(page)
    await expect(page.getByPlaceholder('What is this transaction for?')).toHaveValue('')
  })

  test('declined keeps the form; an expense has no Pay by card; the form checks its fields first', async ({ page, api }) => {
    await api.mockTransactions()
    api.pairTerminal()
    await gotoReady(page, '/')
    await openTransactionForm(page)
    await page.getByRole('button', { name: 'Pay by card' }).click()
    await expect(page.getByText('Please enter a description for the transaction')).toBeVisible()
    expect(api.card.charges).toHaveLength(0)

    await page.getByPlaceholder('What is this transaction for?').fill('Market sale')
    await page.getByPlaceholder('0.00').fill('25')
    await page.getByRole('button', { name: 'Pay by card' }).click()
    api.settleCard('declined')
    await expect(state(page)).toHaveText('Card declined')
    await sheet(page).getByRole('button', { name: 'Close' }).last().click()
    await expect(page.getByPlaceholder('What is this transaction for?')).toHaveValue('Market sale')
    await expect(page.getByPlaceholder('0.00')).toHaveValue('25')
    expect(api.posted).toHaveLength(0)

    await page.getByText('Expense', { exact: true }).click()
    await expect(page.getByRole('button', { name: 'Pay by card' })).toHaveCount(0)
  })
})
```

In `tests/e2e/mobile.spec.js`, directly above the loop whose test is `` `the calendar fits at 375px with long names, in Upcoming, Month and the sheet${dark ? ' (dark)' : ''}` ``, add:

```js
  for (const dark of [false, true]) {
    test(`Pay by card, its sheet and the Card terminal section fit at 375px${dark ? ' (dark)' : ''}`, async ({ page, api }) => {
      await page.addInitScript((dark) => {
        localStorage.setItem('budget-tracker-settings', JSON.stringify({ display: { darkMode: dark } }))
      }, dark)
      await api.mockCatalog(longProducts)
      api.pairTerminal()
      api.card.reader.name = 'Supercalifragilisticexpialidocious-Solo-With-A-Very-Long-Unbroken-Name'
      const fits = async (label) => {
        const scrollWidth = await page.evaluate(() => document.documentElement.scrollWidth)
        expect(scrollWidth, label).toBeLessThanOrEqual(page.viewportSize().width)
        expect(await smallTargets(page), label).toEqual([])
      }
      await gotoReady(page, '/catalog')
      // The seven-digit article
      await page.locator('h3', { hasText: 'Extremely Long' }).click()
      await page.getByRole('button', { name: /View cart/ }).click()
      await expect(page.getByRole('button', { name: /^Pay by card · 123\.456,78/ })).toBeVisible()
      await fits('cart')
      await page.getByRole('button', { name: /^Pay by card/ }).click()
      const payment = page.getByRole('dialog', { name: 'Card payment' })
      await expect(payment.getByTestId('card-payment-state')).toHaveText(/Waiting for card · 123\.456,78/)
      await fits('waiting')
      expect(await payment.evaluate(el => el.scrollWidth > el.clientWidth)).toBe(false)
      api.settleCard('declined')
      await expect(payment.getByTestId('card-payment-state')).toHaveText('Card declined')
      await fits('declined')
      await payment.getByRole('button', { name: 'Close' }).last().click()

      await gotoReady(page, '/settings#card')
      await expect(page.getByTestId('card-reader-status')).toHaveText('Online')
      await fits('paired')
      await page.getByRole('button', { name: 'Unpair' }).click()
      await expect(page.getByLabel('Pairing code')).toBeVisible()
      await fits('pairing')
    })
  }

```

- [ ] **Step 2: Run them to verify they fail**

Run: `npx playwright test tests/e2e/card-payments.spec.js`
Expected: most tests fail waiting for a `Pay by card` button or for the booking (`api.posted` stays empty in the "booked later" tests). `'the button shows only with a paired Solo'` fails at its last step.

- [ ] **Step 3: A sheet that cannot be closed while the terminal has the payment**

In `components/BottomSheet.vue`, in the close button, add `v-if="dismissible"` as its first attribute:

```vue
            <button
              v-if="dismissible"
              type="button"
              class="-mr-2 flex h-11 w-11 shrink-0 items-center justify-center rounded-lg text-ink-muted hover:bg-muted"
              aria-label="Close"
```

Replace

```js
  title: { type: String, required: true }
})
```

with

```js
  title: { type: String, required: true },
  // false while something must finish first (a card payment on the terminal): no close button, and the
  // backdrop and Escape do nothing
  dismissible: { type: Boolean, default: true }
})
```

Replace

```js
const close = () => emit('update:open', false)
```

with

```js
const close = () => {
  if (props.dismissible) emit('update:open', false)
}

// With a sheet opened over another (the card payment over Home's form), only the top one takes the keys
const isTopmost = () => {
  const dialogs = document.querySelectorAll('#teleports [role="dialog"]')
  return dialogs[dialogs.length - 1] === panel.value
}
```

and replace

```js
const onKeydown = (event) => {
  if (event.key === 'Escape') {
```

with

```js
const onKeydown = (event) => {
  if (!isTopmost()) return
  if (event.key === 'Escape') {
```

- [ ] **Step 4: The payment sheet**

Create `components/CardPaymentSheet.vue`:

```vue
<template>
  <BottomSheet :open="open" title="Card payment" :dismissible="settled" @update:open="close">
    <div class="space-y-4" data-testid="card-payment">
      <div class="flex flex-col items-center gap-3 py-4 text-center" role="status">
        <span
          v-if="!settled"
          class="h-10 w-10 animate-spin rounded-full border-4 border-muted border-t-accent motion-reduce:animate-none"
          aria-hidden="true"
        />
        <span
          v-else
          class="flex h-12 w-12 items-center justify-center rounded-full"
          :class="state === 'approved' ? 'bg-income/10 text-income' : 'bg-expense/10 text-expense'"
          aria-hidden="true"
        >
          <AppIcon :name="state === 'approved' ? 'check' : 'x'" class="h-6 w-6" />
        </span>
        <p class="break-words text-lg font-semibold text-ink" data-testid="card-payment-state">{{ headline }}</p>
        <p v-if="detail" class="break-words text-sm text-ink-muted">{{ detail }}</p>
      </div>

      <p v-if="error" role="alert" class="rounded-lg bg-expense/10 px-3 py-2 text-sm text-expense">{{ error }}</p>

      <div class="space-y-2">
        <BaseButton v-if="state === 'still'" block @click="keepWaiting">Keep waiting</BaseButton>
        <BaseButton
          v-if="['waiting', 'still', 'cancelling'].includes(state)"
          block
          variant="secondary"
          icon="x"
          :loading="state === 'cancelling'"
          @click="cancelOnTerminal"
        >
          Cancel on terminal
        </BaseButton>
        <BaseButton v-if="settled" block :variant="state === 'approved' ? 'primary' : 'secondary'" @click="close(false)">
          {{ state === 'approved' ? 'Done' : 'Close' }}
        </BaseButton>
      </div>
    </div>
  </BottomSheet>
</template>

<script setup>
import { ref, computed, watch, onBeforeUnmount } from 'vue'
import { useCardPayments } from '~/composables/useCardPayments'
import { formatCurrency } from '~/utils/currency'

// No result this long after the start: ask whether to keep waiting
const STILL_WAITING_MS = 120_000
const FAILED = "The payment didn't go through"

const props = defineProps({
  open: { type: Boolean, default: false },
  // { source: 'cart' | 'home', amount, description, cart }: sent once each time the sheet opens
  request: { type: Object, default: null }
})
const emit = defineEmits(['update:open', 'paid'])

const { charge, cancel, watch: watchPayment, bookPayment } = useCardPayments()

// 'starting' | 'waiting' | 'still' | 'cancelling' | 'approved' | 'declined' | 'cancelled' | 'failed'
const state = ref('starting')
const failure = ref('')
const error = ref('')
let paymentId = ''
let stopWatching = () => {}
let stillTimer = null

const settled = computed(() => ['approved', 'declined', 'cancelled', 'failed'].includes(state.value))
const amount = computed(() => formatCurrency(props.request?.amount ?? 0))
const headline = computed(() => ({
  starting: 'Sending to the terminal...',
  waiting: `Waiting for card · ${amount.value}`,
  cancelling: `Waiting for card · ${amount.value}`,
  still: 'Still waiting for the terminal',
  approved: 'Paid ✓',
  declined: 'Card declined',
  cancelled: 'Cancelled',
  failed: failure.value || FAILED
})[state.value])
const detail = computed(() => {
  if (state.value === 'approved') return amount.value
  if (['declined', 'cancelled', 'failed'].includes(state.value)) return 'Nothing was booked'
  if (state.value === 'still') return amount.value
  return ''
})

const startStillTimer = () => {
  clearTimeout(stillTimer)
  stillTimer = setTimeout(() => { if (state.value === 'waiting') state.value = 'still' }, STILL_WAITING_MS)
}

const stop = () => {
  stopWatching()
  stopWatching = () => {}
  clearTimeout(stillTimer)
}

const onPayment = (payment) => {
  if (payment.status === 'pending') return
  stop()
  if (payment.status === 'approved') {
    state.value = 'approved'
    // Booked here, and if this fails (no connection) on the next start or when the connection returns
    bookPayment(payment).catch(() => {})
    emit('paid', payment)
    return
  }
  state.value = payment.status
}

const start = async () => {
  stop()
  state.value = 'starting'
  failure.value = ''
  error.value = ''
  paymentId = ''
  try {
    const { id } = await charge(props.request)
    if (!props.open) return
    paymentId = id
    state.value = 'waiting'
    startStillTimer()
    stopWatching = watchPayment(id, onPayment)
  } catch (err) {
    state.value = 'failed'
    failure.value = err?.data?.message || FAILED
  }
}

const keepWaiting = () => {
  state.value = 'waiting'
  startStillTimer()
}

const cancelOnTerminal = async () => {
  if (!paymentId || state.value === 'cancelling') return
  const before = state.value
  state.value = 'cancelling'
  error.value = ''
  try {
    const { status } = await cancel(paymentId)
    // approved: the card went through after all, and the watch brings it; pending: the poll settles it
    if (status === 'cancelled') {
      stop()
      state.value = 'cancelled'
    } else if (state.value === 'cancelling') {
      state.value = before
    }
  } catch (err) {
    if (state.value === 'cancelling') state.value = before
    error.value = err?.data?.message || "The terminal didn't answer. Check that it's on and online."
  }
}

const close = (value) => {
  if (value || !settled.value) return
  stop()
  emit('update:open', false)
}

watch(() => props.open, (isOpen) => {
  if (isOpen && props.request) start()
  else stop()
}, { immediate: true })

onBeforeUnmount(stop)
</script>
```

- [ ] **Step 5: Pay by card in the cart**

In `components/CartPanel.vue`, replace

```vue
      <BaseButton size="lg" block icon="cash" :disabled="!items.length" @click="$emit('submit')">
        Add to Balance
      </BaseButton>
```

with

```vue
      <BaseButton size="lg" block icon="cash" :disabled="!items.length" @click="$emit('submit')">
        Add to Balance
      </BaseButton>
      <template v-if="card?.show">
        <BaseButton size="lg" block variant="secondary" icon="credit-card" :disabled="!items.length || card.offline" @click="$emit('card')">
          Pay by card · {{ formatCurrency(total) }}
        </BaseButton>
        <p v-if="card.offline" class="text-center text-xs text-ink-muted">Needs a connection</p>
      </template>
```

and replace

```js
  applied: { type: Array, default: () => [] }
})
defineEmits(['increment', 'decrement', 'remove', 'submit', 'commission'])
```

with

```js
  applied: { type: Array, default: () => [] },
  // Pay by card: { show (a Solo is paired), offline }; null hides it
  card: { type: Object, default: null }
})
defineEmits(['increment', 'decrement', 'remove', 'submit', 'commission', 'card'])
```

In `pages/catalog.vue`, in **both** `<CartPanel …>` elements (the desktop aside and the phone sheet), add `:card="cardButton"` below `:applied="pricedCart.applied"` and `@card="payByCard"` below `@commission="startCommission"` (fix that line's indentation to match its neighbours while there). Below the closing `</template>` of the phone cart (`<template v-if="isOwner && !isDesktop">`), add:

```vue

    <CardPaymentSheet v-if="isOwner" v-model:open="isCardSheetOpen" :request="cardRequest" @paid="onCardPaid" />
```

Below `import { useCommissionDraft } from '~/composables/useCommissionDraft'` add `import { useCardPayments } from '~/composables/useCardPayments'`.

Replace

```js
// A booked checkout on this page: the catalog's stock follows at once (the server's follows when the sale
// syncs), the cart empties, and the gatcha prizes are picked
const finishCheckout = (booking) => {
```

with

```js
// A booked checkout on this page: the catalog's stock follows at once (the server's follows when the sale
// syncs), the cart empties, and the gatcha prizes are picked (after a card payment, once its sheet closes)
const finishCheckout = (booking, { pickPrizesNow = true } = {}) => {
```

and in it replace

```js
  // Opens once the cart sheet has let go of the page
  if (booking.prizes.count) nextTick(() => { isPrizeSheetOpen.value = true })
}
```

with

```js
  if (!booking.prizes.count) return
  // Opens once the cart sheet has let go of the page
  if (pickPrizesNow) nextTick(() => { isPrizeSheetOpen.value = true })
  else prizesAfterCard.value = true
}
```

Directly below the closing `}` of `submitToBalance`, add:

```js

// Pay by card: the same booking, stored with the card payment and booked once the card is approved
const { terminalState, loadTerminal, startCardBooking } = useCardPayments()
const online = ref(true)
const cardButton = computed(() => ({ show: !!terminalState.value?.configured && !!terminalState.value?.paired, offline: !online.value }))
const isCardSheetOpen = ref(false)
const cardRequest = ref(null)
const prizesAfterCard = ref(false)

const payByCard = () => {
  if (selectedProducts.value.length === 0 || !online.value) return
  const booking = currentBooking()
  cardRequest.value = { source: 'cart', amount: booking.amount, description: 'Akinai sale', cart: booking }
  isCartOpen.value = false
  // Opens once the cart sheet has let go of the page
  nextTick(() => { isCardSheetOpen.value = true })
}

// Approved: booked by the sheet from the stored booking; here the page follows (declined: the cart stays)
const onCardPaid = payment => finishCheckout(payment.cart, { pickPrizesNow: false })

watch(isCardSheetOpen, (open) => {
  if (open || !prizesAfterCard.value) return
  prizesAfterCard.value = false
  nextTick(() => { isPrizeSheetOpen.value = true })
})

const setOnline = () => { online.value = navigator.onLine }
```

Replace the `onMounted` and `onBeforeUnmount` blocks at the end of the script with:

```js
onMounted(() => {
  fetchProducts()
  // Open prizes from earlier, and picks still waiting to sync (sent only with the owner's session)
  startPrizeSync()
  window.addEventListener('keydown', handleKeyboardShortcuts)
  setOnline()
  window.addEventListener('online', setOnline)
  window.addEventListener('offline', setOnline)
})

// The owner is known once app.vue has restored the session (after this page mounted)
watch(isOwner, (owner) => {
  if (!owner) return
  loadTerminal()
  // Card payments approved while the app was closed or offline are booked now, and when the connection returns
  startCardBooking()
}, { immediate: true })

onBeforeUnmount(() => {
  window.removeEventListener('keydown', handleKeyboardShortcuts)
  window.removeEventListener('online', setOnline)
  window.removeEventListener('offline', setOnline)
})
```

(Calling `loadTerminal()` from `onMounted` with `if (isOwner.value)` does not work: `isOwner` is still `false` there, because `app.vue` restores the session in its own `onMounted`, which runs after the page's.)

- [ ] **Step 6: Pay by card on Home**

In `components/TransactionForm.vue`, replace

```vue
    <BaseButton type="submit" size="lg" block :loading="isLoading">
      {{ isLoading ? 'Saving...' : 'Add to Balance' }}
    </BaseButton>
  </form>
</template>
```

with

```vue
    <div class="space-y-2">
      <BaseButton type="submit" size="lg" block :loading="isLoading">
        {{ isLoading ? 'Saving...' : 'Add to Balance' }}
      </BaseButton>
      <!-- Income only, and only with a paired Solo -->
      <template v-if="showCard">
        <BaseButton size="lg" block variant="secondary" icon="credit-card" :disabled="!online" @click="payByCard">Pay by card</BaseButton>
        <p v-if="!online" class="text-center text-xs text-ink-muted">Needs a connection</p>
      </template>
    </div>

    <CardPaymentSheet v-model:open="isCardSheetOpen" :request="cardRequest" @paid="onCardPaid" />
  </form>
</template>
```

Replace

```js
import { ref, watch, onBeforeUnmount } from 'vue'
import { useTransactions } from '~/composables/useTransactions'
import { useCheckout } from '~/composables/useCheckout'
```

with

```js
import { ref, computed, watch, onMounted, onBeforeUnmount } from 'vue'
import { useTransactions } from '~/composables/useTransactions'
import { useCheckout } from '~/composables/useCheckout'
import { useCardPayments } from '~/composables/useCardPayments'
```

Delete the line `onBeforeUnmount(() => clearTimeout(errorTimer))` (it moves to the end of the script).

Replace

```js
const handleSubmit = async () => {
  error.value = ''

  if (!transactionDescription.value.trim()) {
    error.value = 'Please enter a description for the transaction'
    return
  }

  const amount = parseAmount(transactionAmount.value)
  if (!(amount > 0)) {
    error.value = 'Please enter a valid amount'
    return
  }
```

with

```js
// The checked amount, or null after showing what is missing
const validAmount = () => {
  error.value = ''
  if (!transactionDescription.value.trim()) {
    error.value = 'Please enter a description for the transaction'
    return null
  }
  const amount = parseAmount(transactionAmount.value)
  if (!(amount > 0)) {
    error.value = 'Please enter a valid amount'
    return null
  }
  return amount
}

const clearForm = () => {
  transactionDescription.value = ''
  transactionAmount.value = ''
  transactionNotes.value = ''
}

const handleSubmit = async () => {
  const amount = validAmount()
  if (amount === null) return
```

and replace the end of `handleSubmit`

```js
  transactionDescription.value = ''
  transactionAmount.value = ''
  transactionNotes.value = ''
  emit('saved')
}
```

with

```js
  clearForm()
  emit('saved')
}

// Pay by card: the income this form would book, stored with the card payment and booked on approval.
// Declined or cancelled, the form keeps what was typed.
const { terminalState, loadTerminal } = useCardPayments()
const online = ref(true)
const showCard = computed(() => transactionType.value === 'income' && !!terminalState.value?.configured && !!terminalState.value?.paired)
const isCardSheetOpen = ref(false)
const cardRequest = ref(null)
let paidByCard = false

const payByCard = () => {
  const amount = validAmount()
  if (amount === null || !online.value) return
  const booking = homeBooking({ description: transactionDescription.value.trim(), amount, notes: transactionNotes.value })
  cardRequest.value = { source: 'home', amount: booking.amount, description: 'Akinai sale', cart: booking }
  paidByCard = false
  isCardSheetOpen.value = true
}

const onCardPaid = () => {
  paidByCard = true
  clearForm()
}

// Done on Paid ✓ closes the form too, like Add to Balance
watch(isCardSheetOpen, (open) => {
  if (open || !paidByCard) return
  paidByCard = false
  emit('saved')
})

const setOnline = () => { online.value = navigator.onLine }

onMounted(() => {
  setOnline()
  window.addEventListener('online', setOnline)
  window.addEventListener('offline', setOnline)
  loadTerminal()
})

onBeforeUnmount(() => {
  clearTimeout(errorTimer)
  window.removeEventListener('online', setOnline)
  window.removeEventListener('offline', setOnline)
})
```

In `pages/index.vue`, below `import { useMediaQuery } from '~/composables/useMediaQuery'` add `import { useCardPayments } from '~/composables/useCardPayments'`, and replace

```js
// One commissions fetch feeds the open count, the DSGVO wipe and the print-board count
onMounted(async () => {
```

with

```js
const { startCardBooking } = useCardPayments()

// One commissions fetch feeds the open count, the DSGVO wipe and the print-board count
onMounted(async () => {
  // Card payments approved while the app was closed or offline are booked now, and when the connection returns
  startCardBooking()
```

(Home's page middleware already requires the owner, and `bookApproved` checks the session itself.)

- [ ] **Step 7: Run the e2e tests**

Run: `npx playwright test tests/e2e/card-payments.spec.js`
Expected: 30 passed.

Run: `npx playwright test tests/e2e/mobile.spec.js -g "Pay by card" --project=mobile`
Expected: 2 passed (light and dark).

- [ ] **Step 8: README and `.env.example`**

In `README.md`:

In the *What Akinai does* table, directly above the `| **Commissions** |` row, add:

```markdown
| **Card payments** | *Pay by card* in the cart and on Home puts the total on the shop's SumUp Solo. An approved card books the sale automatically, exactly once, as a card sale; a declined or cancelled one books nothing. Reports split takings into card, cash and other. |
```

In the *How it works* mermaid chart, below `    Push --> Phone` add:

```
    Phone -- pay by card --> Nuxt
    Nuxt -- Readers API, transactions --> SumUp[SumUp Cloud API]
    SumUp -- return URL --> Nuxt
    SumUp --> Solo([SumUp Solo])
```

and directly above the bullet `- Rules that are worth testing live in plain modules …` add:

```markdown
- Card payments go through the Nuxt server, which alone holds the SumUp keys. It creates a `card_payments` record with the owner's login and sends the checkout to the Solo. While the payment sheet is open, the app asks the server every 2 s to look the result up at SumUp; with the notifier login the server also takes SumUp's call to the return URL and checks pending payments every 15 s on its own. The app books the sale once the payment is approved.
```

Below the **Tests** code block (after `npx playwright test --project=mobile   # the phone layout only` and its closing fence) add:

```markdown

The tests never reach SumUp: the unit tests use a fake SumUp client and the e2e tests fake the `/api/card/*` routes. `npm run sumup:sandbox-check` is the only thing that talks to SumUp from your machine, and only to a sandbox account (see [Rollout: card payments](#rollout-card-payments)).
```

In *PocketBase and migrations*, replace the **Collections** bullet's list ending `` `conventions` and `push_subscriptions`. `` with `` `conventions`, `push_subscriptions` and `card_payments`. ``, and replace the `--notifier` sub-bullet with:

```markdown
  - `--notifier` lets the reminder account read and update conventions, read and delete push subscriptions, and read card payments and record SumUp's result on them (`status`, `sumup_checkout`, `sumup_transaction`, nothing else). Without it those collections stay owner-only, and neither the reminder job nor card payments work.
```

In *The env file* table, below the `CALENDAR_SECRET` row add:

```markdown
| `SUMUP_API_KEY` | SumUp API key (Developer settings → API keys). Card payments also need `POCKETBASE_URL` and `OWNER_ID`; SumUp's return URL and the 15 s check of pending payments also need the notifier login (without it, `[card] return URL and backup poll off` in the log). |
| `SUMUP_MERCHANT_CODE` | the merchant code of that SumUp account (letters and digits) |
| `SUMUP_AFFILIATE_KEY`, `SUMUP_AFFILIATE_APP_ID` | the affiliate key and the app id it was made for; SumUp's Cloud API needs them on every checkout |
| `SUMUP_API_URL` | optional, `https://api.sumup.com` by default; https only |
```

and replace `None of these may get a \`NUXT_PUBLIC_\` prefix, except the VAPID public key.` with:

```markdown
None of these may get a `NUXT_PUBLIC_` prefix, except the VAPID public key. The live SumUp keys go only into this file; the local `.env` may hold the sandbox `SUMUP_*` keys for the laptop test (see [Rollout: card payments](#rollout-card-payments)).
```

and in the next paragraph replace its bold first sentence (the one starting **Never put the server env**, which lists `OWNER_ID` and `POCKETBASE_URL` too) with:

```markdown
**Never put the server's secrets (`NOTIFIER_*`, `VAPID_*`, `CALENDAR_SECRET`) or live SumUp keys into a local `.env`, committed or not.** (`POCKETBASE_URL` and `OWNER_ID` are no secrets and may be there for the card payment test on the laptop.)
```

Directly above `## Credits`, add:

````markdown
### Rollout: card payments

Run these yourself, in this order.

1. **Schema.** Run `npm run pb:migrate`. The dry run should list exactly `create collection "card_payments" (amount, description, source, cart, status, sumup_checkout, sumup_transaction, booked_transaction, callback_token)` and `add to "budget_tracker_transactions": payment_method, sumup_transaction`. Then run `npm run pb:migrate -- --apply`.
2. **Rules.** Run `npm run pb:migrate -- --apply-rules --owner <your email> --notifier <notifier email>`. It should list only `set access rules on "card_payments"`: the owner may do everything, the notifier may read and set the status and SumUp's ids. Both steps run **before** the laptop test and before the deploy: the app needs the collection open to take any card payment.
3. **Sandbox test on the laptop** (`nuxt dev`, with the sandbox merchant and the Virtual Solo at virtual-solo.sumup.com):
   1. Put into the local `.env`: the four sandbox keys `SUMUP_API_KEY`, `SUMUP_MERCHANT_CODE`, `SUMUP_AFFILIATE_KEY`, `SUMUP_AFFILIATE_APP_ID`, plus `POCKETBASE_URL=https://pocket.lasseharm.space` and `OWNER_ID=<the id --apply-rules printed>`. **Never the notifier login.**
   2. Optional: `npm run sumup:sandbox-check` checks the keys without the app. It stops unless SumUp marks the account as a sandbox, lists the readers, sends a 1,00 € checkout to the paired one after you say yes, and prints how SumUp's status maps to Akinai's (`SUCCESSFUL → approved`, `FAILED → declined`, `CANCELLED → cancelled`). `-- --pair <code>` pairs the Virtual Solo first.
   3. Restart `npm run dev`. Its log shows `[card] return URL and backup poll off, missing: NOTIFIER_EMAIL, NOTIFIER_PASSWORD`: expected on the laptop. The open payment sheet asks for the result every 2 s instead, and the next start settles a payment whose sheet was closed.
   4. Log in, open Settings → Card terminal, enter the code the Virtual Solo shows under *Connections → API → Connect* and tap *Pair terminal*. The section shows the Solo as *Online*.
   5. Checklist:
      - [ ] Cart → *Pay by card · <total>*: the Solo shows the amount, the sheet shows `Waiting for card`.
      - [ ] Pay: `Paid ✓`, the cart empties, the sale is in the history once, as card, its description starting with `[Sandbox] `. Its SumUp code matches the sandbox transaction.
      - [ ] *Cancel on terminal* while the Solo waits: `Cancelled`, nothing booked.
      - [ ] Cancel on the Solo itself: `Cancelled` (or `Card declined`: note which; SumUp may report a cancel on the terminal as failed).
      - [ ] Home → *Pay by card* for an income: booked with its description (with `[Sandbox] `), as card.
      - [ ] Reload the page while the customer pays, pay, then open the app again: `Card payment of <amount> booked`, once.
      - [ ] Log the Virtual Solo out and pay: `The terminal didn't answer. Check that it's on and online.`
      - [ ] Reports → Market day and Money show the card sales under Card.
   6. **Delete the test sales.** They are real entries in the production books: in the PocketBase admin, delete the `budget_tracker_transactions` whose description starts with `[Sandbox] ` (a card sale's id is its card payment's id) and their `stock_movements`, and the `card_payments` marked `[Sandbox]`. In Settings → Card terminal, *Unpair* the Virtual Solo, then remove the four `SUMUP_*` lines from `.env` (or keep them for the next test).
4. **Live keys on the server.** Write the four live `SUMUP_*` lines into `/opt/budget-tracker/shared/akinai.env` (see [The env file](#the-env-file); the notifier login is already there), then deploy (push to `main`). `pm2 logs budget-tracker` should show neither `[card] off` nor `[card] return URL and backup poll off`.
5. **Pair the real Solo** in Settings → Card terminal, the same way.
6. **First live payments:**
   - [ ] A small real payment: `Paid ✓`, and `pm2 logs budget-tracker` shows `[card] <id> approved (<SumUp code>)` within seconds (SumUp's call to the return URL reaches the server). The code matches the SumUp app. Refund it in the SumUp app if you like; Akinai keeps the sale (delete it there too).
   - [ ] Pairing and paying work for the German merchant account (the Cloud API's region).
   - [ ] **Can the paired Solo still take manually typed amounts** (outside Akinai)? This decides how the stall works, not the code.

A card payment that stays pending is checked every 15 s on the server; after 10 minutes without SumUp knowing it, it is marked failed. Refunds stay in the SumUp app.
````

In `.env.example`, below `POCKETBASE_ADMIN_TOKEN=` add:

```bash
# Card payment test on the laptop (README, Rollout: card payments): SumUp SANDBOX keys and the owner's id.
# Never the notifier login or live keys: those go into akinai.env on the server.
OWNER_ID=
SUMUP_API_KEY=
SUMUP_MERCHANT_CODE=
SUMUP_AFFILIATE_KEY=
SUMUP_AFFILIATE_APP_ID=
```

- [ ] **Step 9: Run everything**

Run the unit tests in the time zones and on Node 20 (Working setup).
Expected: `tests 382`, `fail 0` in all four.

Run: `npx playwright test`
Expected: 779 passed, 87 skipped, 0 failed (734 + 45 new: card-payments 30, card-terminal 8, reports 2, mobile 5; skipped +5: the mobile-only tests on chromium).

- [ ] **Step 10: Commit**

```bash
git add components/BottomSheet.vue components/CardPaymentSheet.vue components/CartPanel.vue pages/catalog.vue components/TransactionForm.vue pages/index.vue README.md .env.example tests/e2e/card-payments.spec.js tests/e2e/mobile.spec.js
git commit -m "Pay by card in the cart and on Home: the Solo takes the card, and an approved payment is booked once as card

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

- [ ] **Step 11: Hand over the rollout**

Tell the owner the rollout order from the README (*Rollout: card payments*): `pb:migrate` dry run, `--apply`, `--apply-rules --owner … --notifier …`, all **before** the laptop test and the deploy; the laptop sandbox test (sandbox `SUMUP_*`, `POCKETBASE_URL`, `OWNER_ID` in `.env`, never the notifier login; pair the Virtual Solo in Settings; the checklist; delete the `[Sandbox] ` sales); then the live keys in `akinai.env`, the deploy, pairing the real Solo and the first live payments (including "can the paired Solo still take manual amounts?" and the region). Do not run any of these yourself.

- [ ] **Step 12: The sandbox check, only with the owner's go**

Ask the owner whether to run `npm run sumup:sandbox-check` now, and wait for an explicit yes in this session. With it (the `.env` holds sandbox keys; the script stops unless SumUp says `sandbox: true`, reads only `SUMUP_*` and prints statuses and SumUp ids only):

1. If no reader is paired, ask the owner for the code the Virtual Solo shows under *Connections → API → Connect*, then run `npm run sumup:sandbox-check -- --pair <code>`.
2. Run `npm run sumup:sandbox-check`, answer `y` only if the owner wants the 1,00 € sandbox checkout, and let the owner pay (or cancel) on the Virtual Solo; press Enter to try *Cancel on terminal* if the owner asks.
3. Report to the owner, verbatim from the output: `Sandbox merchant: yes`, the readers and their status, the checkout's `client_transaction_id`, each transaction status line (`SUCCESSFUL → approved TEENSK4W2K` style), and the `Lookup by foreign_transaction_id` line. If any shape differs from the table in *SumUp API shapes*, fix `server/utils/sumup.js` and `tests/unit/sumup.test.js` in a follow-up commit (unit tests green, all four runs) before the owner deploys.

Without the owner's yes, skip this step and say so in the hand-over.

---

## Spec coverage

| Spec | Where |
|---|---|
| Pay by card in the cart (`Pay by card · <total>`) and on Home (income only), shown only when paired, disabled offline with `Needs a connection` | Task 7 (CartPanel, catalog, TransactionForm); Task 6 (`loadTerminal`, cached flags) |
| Waiting sheet, `Paid ✓`, `Card declined`, `Cancelled`, `The payment didn't go through`, 120 s `Still waiting for the terminal` with **Keep waiting** and **Cancel on terminal** | Task 7 (CardPaymentSheet); Task 5 (`/api/card/cancel`) |
| Approved books exactly what *Add to Balance* books (lines, `sold_at`, stock movements, deals, gatcha prizes), card, cart empties; Home books with its description | Task 2 (shared booking); Task 7 |
| Declined/cancelled/failed book nothing; cart and form stay | Task 7 |
| Exactly once: record id as `recordId`, `booked_transaction`, booking on open and on `online`, toast, server dedupe, snapshot | Task 2 (`saleTransaction` with `recordId`), Task 6 (`bookPayment`, `bookApproved` refreshing pending ones first, `startCardBooking`), Task 7 (catalog/Home mount) |
| Owner decision: laptop sandbox test; `/api/card/refresh` every 2 s; configured without the notifier (return URL and poll off); `[Sandbox] ` marker | Task 4 (`cardSettings`, `refreshPayment`, `createOwnerStore`, `markSandbox`, `createSandboxCheck`), Task 5 (routes, plugin), Task 6 (`watch`), Task 7 (README) |
| Unreachable terminal message, record `failed` | Task 4 (`startCharge`), Task 7 |
| Settings → Card terminal: name, online/offline, Pair (code), Unpair, not configured | Task 5 (routes), Task 6 |
| `payment_method` card/cash/empty, `sumup_transaction` | Task 1 (fields), Task 2 (cash, posting), Task 6 (card) |
| Reports: Market day and Money split card/cash/other; older entries Other | Task 3 |
| 375px, 44px, light and dark, semantic tokens | Task 3, 6, 7 (mobile.spec), `no-raw-colours.test.js` |
| `card_payments` collection, rules, notifier limited to three fields; transaction fields; snapshot tests before and after `--apply`; migrate before deploy | Task 1; README (Task 7) |
| Server settings (`SUMUP_*`, `SUMUP_API_URL` default), configured flag, no secrets in public env/logs/responses | Task 4 (`cardSettings`, `SumUpError`), Task 5 |
| Routes through `requireCaller`, owner only; pair validates the code, wrong code 400; unpair; charge with minor units, description, return URL, affiliate, client reference; refused when not > 0, not configured or not paired; 502 safe message | Task 4, Task 5 |
| Callback: token in constant time, body ignored, status from SumUp's transactions API, 200 quickly, wrong token 404 | Task 4 (`callbackMatches`, `checkPayment`), Task 5 (route) |
| Backup poll every 15 s while pending, single-flight, capped, 10-minute give-up unless SumUp says pending | Task 4 (`createCardPoller`, `checkPayment`), Task 5 (plugin) |
| Logs: payment id, status and SumUp ids only | Task 4 (`[card] …` lines) |
| `nuxt dev` uses the local `.env` (sandbox keys, `POCKETBASE_URL`, `OWNER_ID`); unit tests fake SumUp; e2e fakes `/api/card/*` | Task 4–7; Decisions 8–9 |
| Manual use and region to confirm in the sandbox test | README checklist (Task 7); Task 7, Step 12 |
