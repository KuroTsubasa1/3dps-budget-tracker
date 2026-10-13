# Multi-article commissions and navigation tabs: design

Date: 2026-10-14
Status: Draft for review
A follow-up to sub-project 3 (commissions) and sub-project 4 (print board), both merged into `feat/mobile-ui-overhaul` and migrated on production (`--apply` and `--apply-rules` done).

## Goal

The owner builds a commission the way they build a sale: tap the articles into the cart, then tap **Commission** instead of Checkout. The Commissions page opens with a new commission holding those articles. Commissions and the Print board also get their own navigation tabs.

**Decided with the owner**
- **One commission, several lines.**
  - A commission holds a list of items (article + quantity).
  - It still has one agreed price, one print-board card and one income on Delivered.
- **Articles are picked in the existing cart.**
  - The cart gets a **Commission** button next to Checkout. It opens `/commissions` with a new-commission form pre-filled with the cart lines.
- **Navigation.**
  - Desktop side menu: all seven entries, Dashboard · Catalog · Commissions · Print board · Reports · Business Card · Settings.
  - Phone bottom bar: Home · Catalog · Commissions · Print · **More**. More opens a bottom sheet with Reports, Business Card and Settings.
- **Removed.**
  - The per-card "Commission" buttons in the catalog.
  - The "Commissions" and "Print board" buttons in the Catalog header. The tabs replace them.
  - The Dashboard links ("N open commissions", "N to print") stay.
- **Customer names stay in income descriptions** (owner decision, 2026-10-13).

**Assumptions**
- The cart remains page-local. Leaving the catalog empties it, as today. The lines travel to the Commissions page as a one-time draft, not as a saved cart.
- Commissions still never touch stock.

## Success criteria

1. **Cart to commission.** With 2 × Pikachu Keychain and 1 × Totoro in the cart, tapping **Commission** opens `/commissions` with the new-commission form showing both lines and an agreed price of `15,00` (deal-aware: 7 + 8).
2. **Editing lines.** In the form each line has a quantity stepper (min 1) and a remove button, and **Add article** adds a line from the active articles.
   - Adding an article that is already a line increases that line's quantity instead.
   - The price pre-fill follows the lines until the owner edits the price.
3. **Validation.**
   - An empty list is refused with `Add at least one article`.
   - The other messages keep their wording, with `Add at least one article` taking the place of `Choose an article` in the order.
4. **Delivered.** It books exactly one income, amount = agreed price, with the description `Commission: <name> × <qty>, <name> × <qty> (<customer>)`. The ` × <qty>` is always written in the income description.
5. **Commissions list rows** show the customer, then the summary.
   - The summary lists the lines with ` × <qty>` only when the quantity is above 1, e.g. `Pikachu Keychain × 2, Totoro`.
   - With more than two lines it shows the first two plus ` +<n> more`.
6. **Detail view** lists every line (`<name> × <qty>`).
7. **Print board.** One card per commission, listing all lines. Start, Done and Back are unchanged.
8. **Legacy commissions.** A commission without `items` but with `article`/`quantity` is read as one line everywhere, so the app works before and after the data conversion.
9. **Phone tabs.** On phones the bottom bar shows exactly five tabs.
   - More is highlighted on `/reports`, `/business-card` and `/settings`, and the sheet navigates to each.
   - Tap targets are at least 44px, and there is no horizontal scroll at 375px.
10. **Migration.** It adds `items` to `commissions`, makes `article` and `quantity` optional, and converts existing commissions to one-line `items`. It is idempotent.

## Data model (PocketBase 0.22)

### `commissions` changes

| Field | Change |
|---|---|
| `items` | **new**: json, required in the app (not in the database). Shape `[{ article: <id>, name: <string>, quantity: <int ≥ 1> }]` |
| `article` | stays a relation, **no longer required**. New commissions leave it empty |
| `quantity` | stays a number, **no longer required**. New commissions leave it empty |

- `name` is copied from the article when the line is added, so an archived or renamed article still reads correctly. The app shows the current article name when the article is still in the active list, and the copied name otherwise.
- **Data conversion (`--apply`).** Every commission whose `items` is empty and which has an `article` gets `items = [{ article, name: <article name or "Unknown article">, quantity }]`. Commissions that already have items are skipped, so it is safe to re-run.
- Rules are unchanged (owner only).

## Pure logic (`utils/commissions.js`)

- `itemsOf(commission, articles?)`: returns the lines.
  - It uses `items` when that is a non-empty array.
  - Otherwise it builds `[{ article, name, quantity }]` from the legacy fields. The name comes from `expand.article.name`, else the `articles` lookup, else `Unknown article`.
  - It returns `[]` when there is neither.
- `summaryOf(commission, articles?)`: the list-row text from criterion 5.
- `incomeFor(commission, articles?)`: returns `{ description: 'Commission: <lines> (<customer>)', amount: agreed_price }`. The lines are joined with `, `, and ` × <qty>` is always included.
- `validateCommission(form)`: `form.items` replaces `form.article` / `form.quantity`. The checks run in order:
  1. name (unless anonymised);
  2. email (unless anonymised);
  3. `Add at least one article` when `items` is empty;
  4. address for shipping (unless anonymised);
  5. `Quantity must be a whole number of 1 or more` for any line;
  6. `Agreed price must be above 0`.
- `addLine(items, article)`, `setLineQuantity(items, index, quantity)` and `removeLine(items, index)` are pure helpers used by the form.

Pricing uses the existing `priceCart(lines, deals)` from `utils/deals.js`, building one cart line per item from the article's category base price and override.

## App changes

### Catalog (`pages/catalog.vue`, `components/CartPanel.vue`)
- `CartPanel` gets a secondary button `Commission` (icon `clipboard`) under Checkout, owner only, disabled when the cart is empty.
  - It emits `commission`.
  - The catalog stores the draft lines (`[{ article, name, quantity }]`) in `useState('commissionDraft')` and navigates to `/commissions`.
- The per-card Commission buttons, the catalog's `CommissionSheet` and the header Commissions / Print board buttons are removed.

### Commissions page (`pages/commissions.vue`)
- On load, if `useState('commissionDraft')` holds lines, the page opens the new-commission form with those lines and clears the draft, so a reload does not reopen it.
- Rows use `summaryOf`.

### Commission sheet (`components/CommissionSheet.vue`)
- **Form mode:**
  - the single article select and quantity field become a line list, one row per item: name, a `QuantityStepper` (label `Quantity of <name>`) and a remove button (label `Remove <name>`);
  - below the list, an `Add article` select (active articles);
  - the price pre-fill uses `priceCart` over all lines.
- **View mode:** lists the lines; the income uses the new `incomeFor`.
- **Saving:** writes `items` (with names) and leaves `article` / `quantity` untouched on edit, and empty on create.
- The `presetArticleId` prop is replaced by `presetItems` (an array of lines).

### Print board (`utils/printBoard.js`, `pages/print-board.vue`)
- Commission cards list `itemsOf(commission)` (one `<name> × <qty>` line each), in place of the single `<article> × <qty>`.

### Navigation (`utils/navigation.js`, `components/AppBottomNav.vue`, `components/AppSideNav.vue`)
- `NAV_ITEMS` gains `{ to: '/commissions', label: 'Commissions', shortLabel: 'Commissions', icon: 'clipboard' }` and `{ to: '/print-board', label: 'Print board', shortLabel: 'Print', icon: 'printer' }` after Catalog. Each item gets a `phone: 'tab' | 'more'` flag: Dashboard, Catalog, Commissions and Print board are tabs; the rest go under More.
- `AppBottomNav` renders the four tab items plus a `More` button (new icon `dots`).
  - The More button opens a `BottomSheet` titled `More` that lists the `more` items as `ListRow` links.
  - It is active when the current path matches any `more` item.
- The side nav lists all items.

## Migration (`scripts/lib/pb-plan.mjs`, `scripts/pb-migrate.mjs`)
- **Schema.** `planSchema` adds `json('items')` to `commissions` when it is missing, and an `updateField` op making `article` and `quantity` optional when they are still required. For a fresh install, `commissions` is created with `items` and with `article` / `quantity` optional.
- **Data.** `planCommissionItems(commissions, articles)` is pure. It returns the record patches for the data conversion, and `--apply` runs them after the schema ops.
- **Spacing.** Schema writes keep the 1.5 s gap that automigrate needs.
- **Tests.** Unit tests in `tests/unit/pb-plan.test.js` cover the ops, the conversion plan (legacy → one line; already converted → skipped; missing article → `Unknown article`) and idempotency.

## Testing
- **Unit:**
  - `itemsOf` (items, legacy, neither);
  - `summaryOf` (×1 omitted; more than two lines → `+n more`);
  - `incomeFor` with several lines;
  - `validateCommission` (empty items; a bad quantity on any line; the order kept);
  - `addLine` merging a duplicate;
  - `setLineQuantity` / `removeLine`;
  - the migration plan.
- **e2e** (fake PocketBase: `commissions` gains `items`):
  - cart 2 × keychain + 1 × Totoro → Commission → the form shows both lines and `15,00` → Create → the record holds both items;
  - changing a line's quantity and removing a line update the price;
  - `Add at least one article` when every line has been removed;
  - Delivered books one income with the multi-line description;
  - a legacy single-article commission still shows, edits and delivers;
  - the print-board card lists both lines;
  - the phone shows five tabs, and More → Settings;
  - the desktop side nav lists all seven;
  - the 375px sweep (existing).
- **Existing tests** that used the per-card Commission button or the Catalog header buttons switch to the cart button and the tabs.

## Out of scope
- Per-line prices or line-level status.
- Keeping the cart after leaving the catalog.
- Stock deduction for commissions.
- Etsy (sub-project 5).
