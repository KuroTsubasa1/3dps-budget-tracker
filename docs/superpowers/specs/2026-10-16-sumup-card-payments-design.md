# Card payments on the SumUp Solo: design

Date: 2026-10-16
Status: Draft for review

Akinai (https://akinai.lasseharm.space) builds on these parts, all merged into `main` and deployed:
- the cart checkout in `pages/catalog.vue`: sale lines, stock movements, deals and the gatcha prize picker;
- the Home quick entry in `components/TransactionForm.vue`;
- the offline transaction queue in `composables/useTransactions.js`, which takes `addTransaction` with an optional `recordId`;
- Reports;
- the server-side notifier account and the owner check `requireCaller` used by the push routes;
- `scripts/pb-migrate.mjs`.

## Goal

The owner presses **Pay by card** in the cart or on Home. The total appears on the shop's SumUp Solo, and the customer pays there.

- **When the card is approved,** the sale is booked automatically, exactly as *Add to Balance* would book it, and marked as paid by card.
- **When the payment is declined or cancelled,** nothing is booked.
- **Booked once, always:** an approved payment is booked exactly once, even if the phone loses signal or the app closes while the customer pays.
- **Card vs cash in Reports:** Reports split takings and income into card, cash and other.

**Decided with the owner**
- **Device:** a SumUp Solo, driven through SumUp's Cloud API (Readers API).
- **Keys:**
  - The owner has an API key and an affiliate key.
  - The live keys go into the server's `akinai.env` only.
  - The local `.env` holds sandbox keys, used with a sandbox merchant and a Virtual Solo.
- **Buttons:** Pay by card goes in the cart and in the Home quick entry. On approval the sale is booked automatically.
- **Payment method:** sales store card or cash, and Reports show the split.
- **Approach A:** a server-side `card_payments` record per payment, with **Cancel on terminal**.

**Assumptions to confirm during the manual sandbox test**
- **Manual use:** whether a Solo paired through the API can still take manually typed amounts. This changes how the owner works at the stall, not the code.
- **Region:** that the Cloud API is available for the owner's (German) merchant account.

## Success criteria

1. **Pay by card buttons.**
   - **Cart:** **Pay by card · <total>** next to *Add to Balance*.
   - **Home quick entry:** **Pay by card**, for income only, next to its save button.
   - **Shown only** when a Solo is paired, i.e. `GET /api/card/terminal` reports `paired`.
   - **Offline:** disabled, with `Needs a connection`.
2. **Waiting sheet.** After the tap, a sheet shows `Waiting for card · <amount>` with **Cancel on terminal**, and the Solo shows the amount.
   - **Approved:**
     - The sheet shows `Paid ✓`.
     - The sale is booked as card, with exactly what *Add to Balance* would book: sale lines, `sold_at`, stock movements, deals and the gatcha prize picker. Home books the income with its description.
     - The cart empties.
   - **Declined:** `Card declined`; nothing is booked, and the cart and the form stay as they were.
   - **Cancelled** (on the terminal or with Cancel on terminal): `Cancelled`; nothing is booked.
   - **Failed:** `The payment didn't go through`; nothing is booked.
   - **No result after 120 s:** the sheet shows `Still waiting for the terminal`, with **Keep waiting** and **Cancel on terminal**.
3. **Booked exactly once.**
   - **The sale's id:** the sale uses the card payment's record id (15 characters, `[a-z0-9]`) as its `recordId`.
   - **Booking:** the app books when it sees `approved` with no `booked_transaction`, then stores `booked_transaction`.
   - **When the app opens online,** it checks for approved but unbooked payments and books them with that same id, with the toast `Card payment of <amount> booked`.
   - **Server dedupe:** the server's duplicate-id handling turns a second booking into a no-op.
   - **Snapshot:** a cart payment books from the cart snapshot stored with the payment, not from the live cart.
4. **Unreachable terminal.** If SumUp answers that the reader is offline, or doesn't answer the charge request, the user sees `The terminal didn't answer. Check that it's on and online.`, and the record ends `failed`.
5. **Settings → Card terminal:**
   - the paired Solo's name and status (`online` or `offline`, from SumUp);
   - **Pair terminal**, with a field for the code the Solo shows under *Connections → API → Connect*;
   - **Unpair**;
   - when SumUp isn't configured on the server: `Card payments aren't configured on the server`.
6. **Payment method.**
   - **Card:** `payment_method` = `card` for card payments.
   - **Cash:** `payment_method` = `cash` for *Add to Balance* in the cart and for income from the Home form.
   - **Empty** for commission income, expenses and all older entries.
   - **Card sales** also store `sumup_transaction`, SumUp's transaction id.
7. **Reports.**
   - **Market day:** the day's takings split into `Card` / `Cash` / `Other`.
   - **Money:** the period's income split the same way.
   - **Older entries** count as Other.
8. **Layout:** works at 375px with 44px targets and no horizontal scroll, in light and dark mode, using semantic tokens only.

## Data model (PocketBase 0.22)

### `card_payments` (new)

New collections start locked; `--apply-rules` opens them.

- **list, view, update:** owner or notifier.
- **create, delete:** owner only.

| Field | Type | Notes |
|---|---|---|
| `amount` | number, required | euros, > 0 |
| `description` | text | shown in SumUp, e.g. `Akinai sale` |
| `source` | select | `cart`, `home` |
| `cart` | json (`maxSize` 200000) | the snapshot needed to book: lines, deal ids, and gatcha prizes owed, or the Home form fields |
| `status` | select, required | `pending`, `approved`, `declined`, `cancelled`, `failed` |
| `sumup_checkout` | text | the client transaction id or checkout id |
| `sumup_transaction` | text | SumUp's transaction id once known |
| `booked_transaction` | text | the transaction id it was booked as (= this record's id) |
| `callback_token` | text | a random per-payment secret for the return URL |

The notifier's update rule is limited to `status`, `sumup_checkout` and `sumup_transaction`. It uses the `@request.data.<field>:isset = false` pattern already used for conventions.

### `budget_tracker_transactions` (changes)

- `payment_method`: select, optional, `card` or `cash`.
- `sumup_transaction`: text, optional.

### Migration

- **Planner:** `planSchema` adds both changes, idempotently.
- **Rules:** `planRules` sets the `card_payments` rules.
- **Tests:** the live-snapshot tests hold both before and after `--apply`.
- **Order:** migrate before the deploy.

## Server (Nitro, in the existing process)

### Settings

Server env:
- `SUMUP_API_KEY`
- `SUMUP_MERCHANT_CODE`
- `SUMUP_AFFILIATE_KEY`
- `SUMUP_AFFILIATE_APP_ID`
- `SUMUP_API_URL` (optional, default `https://api.sumup.com`)

Plus the existing `POCKETBASE_URL`, notifier and `OWNER_ID`.

- **Missing settings** mean `configured: false`.
- **No secret** ever goes into `NUXT_PUBLIC_*`, logs or responses.

### Routes

All routes go through `requireCaller`, owner only.

- **`GET /api/card/terminal`** returns `{ configured, paired, reader: { id, name, status } | null }`.
  - It uses the first paired Solo from SumUp's readers list.
- **`POST /api/card/pair { code }`:**
  - creates the reader with SumUp;
  - validates the code's format first;
  - a wrong code returns 400.
- **`POST /api/card/unpair`** deletes the reader at SumUp.
- **`POST /api/card/charge { source, amount, description, cart }`:**
  1. creates the `card_payments` record as `pending`, through the notifier;
  2. calls the Readers checkout with:
     - `total_amount` in minor units (EUR, 2);
     - `description`;
     - `return_url` = `https://<host>/api/card/callback/<record id>/<callback_token>`;
     - `affiliate { app_id, key }`;
     - the record id as the client reference;
  3. returns `{ id }`.
  - **Refused** when the amount is not > 0, or SumUp is not configured or not paired.
  - **SumUp error or timeout:** the record goes to `failed` and the route returns 502 with a safe message.
- **`POST /api/card/cancel { id }`:** calls SumUp's terminate-checkout for the reader. The record goes to `cancelled` once SumUp confirms.
- **`POST /api/card/callback/:id/:token`** (SumUp calls this; no owner check):
  - compares the token in constant time;
  - **ignores the body** and fetches the payment's real status from SumUp's transactions API by the client reference;
  - updates `status` and `sumup_transaction`;
  - answers 200 quickly;
  - **a wrong token** gets 404.
- **Backup poll.** While any payment is `pending`, the server checks it with SumUp every 15 s, in the same reminder-job style:
  - it is single-flight and capped;
  - it gives up after 10 minutes and marks the payment `failed`, unless SumUp says it is still pending.

### Logs

Only the payment id, status and SumUp ids are logged. Never keys, tokens or card data.

### Development and tests

- **`nuxt dev`** talks to whatever keys are in the local `.env` (sandbox).
- **Unit tests** use a fake SumUp client.
- **The e2e suite** fakes the `/api/card/*` routes in the browser, the same way it fakes the notifier routes. It never reaches SumUp.

## App

- **`composables/useCardPayments.js`:** `terminal()`, `charge()`, `cancel()`, `pair()`, `unpair()`, `watch(id)` and `bookApproved()`.
  - `watch(id)` uses the PocketBase SDK to read the record every 2 s while the sheet is open.
  - `bookApproved()` is called on catalog/home mount and after `online`.
- **`components/CardPaymentSheet.vue`:** the waiting, approved, declined, cancelled, failed and still-waiting states.
- **Cart and Home:** the buttons. Checkout booking is refactored into one function used by both *Add to Balance* and the card path, so they can't drift apart. The card path adds `payment_method: 'card'` and `sumup_transaction`.
- **Settings:** the **Card terminal** section.
- **Reports:** the split in `utils/reports/marketDay.js` and `utils/reports/money.js`, plus their views.

## Out of scope

- tips on the terminal;
- refunds from Akinai (they stay in the SumUp app);
- more than one terminal;
- other payment providers;
- Air readers.
