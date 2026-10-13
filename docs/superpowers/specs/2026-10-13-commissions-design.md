# Commissions: design

Date: 2026-10-13
Status: Draft for review
Sub-project 3 of 5. It builds on sub-project 1 (articles, owner login, offline transaction queue) and sub-project 2 (deal pricing), both merged into `feat/mobile-ui-overhaul`.

## Goal

The owner records commissions (made-to-order prints) for customers at the stand and tracks each one to delivery. A delivered commission books its income in the existing balance.

**Decided with the owner**
- **Owner only, no public form.** The owner enters commissions on their own logged-in device. Customers never see or touch the system.
- **Fields.**
  - Customer name, email, and pickup or shipping. An address is required only for shipping.
  - The linked article, quantity and agreed price.
  - Customisation notes.
  - No due date.
- **Lifecycle.** Open → Printing → Ready → Delivered, plus Cancelled. Marking a commission Delivered books the agreed price as income.
- **Privacy (DSGVO).**
  - Customer name, email and address are anonymised automatically 6 months after a commission is Delivered or Cancelled.
  - A manual "Delete customer data" button anonymises one commission immediately.
- **Entry points.**
  - A "Commission" button on each catalog card (owner only) opens a new commission for that article.
  - A Commissions page, reached from the Catalog header and from a Dashboard card.
  - The bottom tab bar stays at 5 tabs.

**Assumptions**
- Commissions are printed to order, so they never deduct stock.
- Creating, editing and advancing a commission need a connection. Only the income booking on Delivered goes through the offline queue, like any sale.
- A commission is for one article. Several articles mean several commissions.
- The print board (sub-project 4) will later read Open and Printing commissions. Nothing in this sub-project depends on it.

## Success criteria

1. The owner can create a commission from a catalog card (article and price pre-filled) or from the Commissions page (article picker). Validation:
   - name required;
   - email in a valid format;
   - address required when shipping;
   - quantity a whole number ≥ 1;
   - agreed price > 0.
2. Commissions move only along the allowed transitions. Delivered and Cancelled are final.
3. Marking a commission Delivered creates exactly one income transaction: amount = agreed price, description `Commission: <article name> × <qty> (<customer name>)`. It uses the existing `addTransaction` path, so it is queued when offline.
4. When the Commissions page loads, any commission that was Delivered or Cancelled more than 6 months earlier and is not yet anonymised gets its name, email and address replaced with `—` and `anonymised_at` set. "Delete customer data" does the same for one commission at any time, after confirmation.
5. Only the pinned owner can list, view, create, update or delete commissions (PocketBase rules via `--apply-rules`).
6. The Commissions page and its sheets work at 375px, with 44px tap targets and no horizontal scroll.

## Data model (PocketBase 0.22)

### `commissions` (new)

| Field | Type | Rules |
|---|---|---|
| `customer_name` | text | required |
| `customer_email` | email | optional at the database level; the app requires a valid format unless anonymised |
| `fulfilment` | select | `pickup` \| `shipping`, required |
| `address` | text | optional; the app requires it for `shipping` unless anonymised |
| `article` | relation → articles (`budget_tracket_catalog`), single | required |
| `quantity` | number | integer, min 1, required |
| `agreed_price` | number | min 0, required (> 0 in practice) |
| `notes` | text | optional |
| `status` | select | `open` \| `printing` \| `ready` \| `delivered` \| `cancelled`, required |
| `delivered_at` | date | set when the status becomes `delivered` |
| `cancelled_at` | date | set when the status becomes `cancelled` |
| `anonymised_at` | date | set when the customer data is wiped |

- **`customer_email` field type.** PocketBase's `email` type rejects `—`. Anonymising therefore stores an empty email, and `customer_name` and `address` hold `—`.
- **Access.**
  - Created locked: all five rules `null`.
  - `--apply-rules` sets list, view, create, update and delete to `ownerRule(ownerId)`.

### Lifecycle (`utils/commissions.js`, pure)

```
NEXT = { open: 'printing', printing: 'ready', ready: 'delivered' }
PREVIOUS = { printing: 'open', ready: 'printing' }
canCancel(status) = status in { open, printing, ready }
isFinal(status) = status in { delivered, cancelled }
```

- `transitionPatch(commission, target, now)` returns the record patch for a move. It sets `delivered_at` or `cancelled_at` when the target is final, and throws on a disallowed move.
- `dueForAnonymising(commission, now)` returns true when the status is final, `anonymised_at` is empty, and `delivered_at` or `cancelled_at` is more than 6 calendar months before `now`.
- `ANONYMISED_PATCH(now)` = `{ customer_name: '—', customer_email: '', address: '—', anonymised_at: now }`.
- `incomeFor(commission, articleName)` returns `{ description, amount }` for the Delivered booking.

## App changes

### Data access (`composables/useCommissions.js`)
`listCommissions()` (expand `article`, sort `-created`), `createCommission`, `updateCommission`, `anonymise(id)`, and `anonymiseDue(list)`, which patches each due commission and returns the ids it changed. All go through the PocketBase SDK.

### Commissions page (`pages/commissions.vue`, `middleware: 'owner'`)
- **Header.** "Commissions", plus a "+ New commission" button.
- **Status chips** (scrollable row): Open, Printing, Ready, Done (Delivered and Cancelled together), each with a count. The default is Open.
- **Rows** (`ListRow`): customer name (or "Anonymised"), `<article> × <qty>`, the agreed price, and a "Ship" or "Pickup" tag. Tapping a row opens the detail sheet.
- **On load:** `anonymiseDue`, then the list re-renders.

### Detail sheet (`components/CommissionSheet.vue`)
- **Read view.**
  - All fields, with the address shown for shipping.
  - The status as a step indicator.
  - **Buttons:**
    - the next status ("Start printing", "Mark ready", "Mark delivered");
    - "Back to <previous>", when there is one;
    - "Cancel commission", with confirmation;
    - "Edit", when not final;
    - "Delete customer data", with confirmation, when not already anonymised.
- **Mark delivered.**
  - Patches the commission first.
  - Then calls `addTransaction(incomeFor(...))`, with today's date.
  - Shows a toast: `Delivered — <price> added to balance`.
  - If the patch fails, no income is booked and an error is shown.
- **Edit / new form** (the same component in form mode):
  - fields: name, email, Pickup/Shipping (SegmentedControl), address (only for Shipping), article (select of active articles), quantity, agreed price, notes;
  - the price pre-fills with the deal-aware price for quantity × article, via `priceCart` with the current deals. It updates when article or quantity change, unless the owner has edited the price;
  - validation messages:
    - `Enter the customer's name`
    - `Enter a valid email address`
    - `Enter an address for shipping`
    - `Quantity must be a whole number of 1 or more`
    - `Agreed price must be above 0`
    - `Choose an article`
  - offline: a failed save shows `You're offline — commissions need a connection` and keeps the form open.

### Entry points
- **Catalog card** (owner, not in Manage mode): a small "Commission" button with the label `Commission <article name>`. It opens the form with the article pre-selected and quantity 1.
- **Catalog header** (owner): a "Commissions" link-button next to Manage.
- **Dashboard** (owner): a card "N open commissions →" counting Open + Printing + Ready, linking to `/commissions`. It is hidden when N = 0.

## Migration
- `planSchema` creates `commissions` (locked). The `article` relation resolves to the articles collection id.
- `rulesFor(ownerId)` gains `commissions` with all five rules set to the owner rule.
- `writeSnapshot` includes `commissions`.
- No seed.
- Unit tests in `tests/unit/pb-plan.test.js` cover the op, the rules and idempotency.

## Testing
- **Unit** (`tests/unit/commissions.test.js):
  - every allowed and disallowed transition;
  - `transitionPatch` timestamps;
  - `dueForAnonymising` at 6 months minus one day and 6 months plus one day;
  - `incomeFor` text and amount.
- **e2e** (`tests/e2e/commissions.spec.js`; the fake PocketBase gains `commissions`, owner-only reads):
  - create from a catalog card (article pre-filled; the address field appears only for Shipping; validation messages);
  - the price pre-fill uses the deal price (2 keychains → 7,00 €);
  - advance Open → Printing → Ready → Delivered, where Delivered posts one transaction with the right amount and description;
  - back one step; cancel; Done chip counts;
  - auto-anonymise on load (a seeded commission delivered 7 months ago is anonymised, one delivered 5 months ago is not);
  - "Delete customer data";
  - the Dashboard card count and link;
  - logged out: `/commissions` redirects to login and no Commission buttons appear.
- **375px sweep:** add `/commissions`.

## Out of scope
- A public request form, customer emails or notifications, due dates, deposits, multi-article commissions, invoices.
- The print board (sub-project 4) and Etsy (sub-project 5).
