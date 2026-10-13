# Cart deals (pricing rules): design

Date: 2026-10-13
Status: Draft for review
Sub-project 2 of 5. It builds on sub-project 1 (categories, articles with optional price override, stock movements, owner login), merged in `feat/mobile-ui-overhaul`.

## Goal

The cart prices itself from deals that the owner manages in the app, starting with the shop's current price list:

| Category | Base price | Deal |
|---|---|---|
| GatchaPon | 4 € | — |
| Keychain | 4 € | 2 for 7 € |
| Mini Figure | 8 € | 2 for 15 € |
| Coaster | 8 € | 2 for 15 € |
| Bookmark | 5 € | 2 for 9 € |
| Big Figure | 30 € | each 25 € once 2+ items from {Big Figure, Pokeball, CardridgeCase} |
| Pokeball | 30 € | same group deal |
| CardridgeCase | 30 € | same group deal |
| Walldisplay | 30 € | — |

**Decided with the owner**
- **"N for X €" bundles price pairs plus singles.** Every complete group of N gets X €, and leftovers pay the base price. For example, 3 keychains cost 7 + 4 = 11 €.
- **The big items form one group.** Any mix of 2 or more Big Figure, Pokeball or CardridgeCase items makes every one of them cost 25 €. CardridgeCase's own trigger list ("Pokeball or CardridgeCase") is read as a typo for "Pokeball or Big Figure".
- **Overridden articles stay out of deals.** An article with its own price override (price > 0) always sells at that price, and never counts toward a deal.
- **Two deal types, managed on a Deals screen in Settings.** Bundle ("N for X €") and group ("each X € from N"). No general rule builder.
- **Stock floor.** Stock is replayed from the movement log in date order and never drops below 0 at any step. A later "printed" movement therefore always counts in full. This is a decision deferred from sub-project 1.

**Assumptions**
- At most one deal per category. The Deals screen refuses overlaps, so deals never stack.
- Deals apply only to carts in this app. The Etsy listing prices in sub-project 5 are out of scope here.
- Money is computed in cents to avoid floating-point drift, and displayed with `formatCurrency()`.

## Success criteria

1. A single pure function prices a cart. It produces per-line prices, the applied deals with their savings, and the total. It is unit-tested against every example in this spec.
2. The catalog cart (inline on desktop, in a sheet on phones) shows the lines, one "Deals" row per applied deal with its saving, and the total. The total updates live as quantities change.
3. A checkout records the deal-priced total as the transaction amount. Its description lists the items and the deals used.
4. The owner can add, edit and delete deals in Settings → Deals. A deal that would reuse a category already in another deal is refused with a clear message.
5. Deals load with the catalog and keep working offline, through the same cache and queue paths as sub-project 1.
6. The migration creates the `deals` collection with owner-pinned rules and seeds the five deals above. It is idempotent.
7. Stock never shows less than what the log implies under the per-step floor. "Printed 3" after a double sale of the last item shows 3.

## Data model (PocketBase 0.22)

### `deals` (new)

| Field | Type | Rules |
|---|---|---|
| `name` | text | required, e.g. "Keychain 2 for 7" or "Big items" |
| `type` | select | `bundle` \| `group`, required |
| `categories` | relation → `categories`, multiple | required. Exactly 1 for `bundle`, at least 1 for `group` |
| `min_qty` | number | integer ≥ 2, required |
| `price` | number | > 0, required. For `bundle` it is the price of the whole group of N; for `group` it is the price per item |

**Access:**
- list and view are public, so the catalog and offline cache can price;
- create, update and delete use the sub-project 1 owner rule (`@request.auth.collectionName = "users" && @request.auth.id = "<owner id>"`), pinned by `--apply-rules`;
- until then, new collections are created locked, as in sub-project 1.

**Uniqueness:** "one deal per category" is checked in the app (Deals screen) and by the migration seed. PocketBase 0.22 cannot express that constraint across a multi-relation.

### Stock floor (change to sub-project 1)

`stockFromMovements` replays movements sorted by `created` ascending (ties broken by `id`):

```
stock = max(0, stock + change)
```

`recomputeStock` requests the movements with `sort: 'created,id'`. The plain sum is no longer used.

## Pricing engine (`utils/deals.js`)

```
priceCart(lines, deals) → { lines: PricedLine[], applied: AppliedDeal[], subtotal, savings, total }

line:        { articleId, name, quantity, categoryId, basePrice (category base), override (article price, 0 = none) }
PricedLine:  { ...line, unitPrice, lineTotal }   // lineTotal before deal savings; unitPrice = override or base
AppliedDeal: { dealId, name, saving, description }   // saving > 0 only
```

The algorithm works in cents:

1. **Overrides.** Lines with `override > 0` are priced at `override × quantity` and excluded from every deal.
2. **Bundle deals.** For each bundle deal, take the regular items of its category (quantities summed across that category's lines):
   - with `n` items, `groups = floor(n / N)` and `rest = n mod N`;
   - deal total = `groups × price + rest × base`;
   - saving = `n × base − deal total`, recorded only if it is above 0.
3. **Group deals.** For each group deal, take the regular items across its categories:
   - with `n` items, if `n ≥ N` each costs `price`, so deal total = `n × price` and saving = `Σ(base × qty) − deal total` (recorded only if above 0);
   - otherwise there is no saving.
4. **Totals.**
   - `subtotal` = Σ unit price × quantity across all lines;
   - `savings` = Σ applied savings;
   - `total` = `subtotal − savings`.
   - All three are returned in euros, rounded from cents.
5. **Deals that don't apply.** A deal whose categories are missing or empty, or whose `min_qty` < 2 or `price` ≤ 0, is ignored. It never throws.

Savings are attributed per deal rather than spread across lines, so the cart and the transaction description can say exactly what was applied.

**Worked examples** (unit tests):

| Cart | Total |
|---|---|
| 1 keychain | 4,00 € |
| 2 keychains | 7,00 € |
| 3 keychains | 11,00 € |
| 4 keychains | 14,00 € |
| 5 keychains | 18,00 € |
| 1 Big Figure | 30,00 € |
| 2 Big Figures | 50,00 € |
| 1 Big Figure + 1 Pokeball | 50,00 € |
| 1 Pokeball + 1 CardridgeCase | 50,00 € |
| 3 mixed group items | 75,00 € |
| 1 Pokeball + 1 Golden Pokeball (override 45 €) | 30 + 45 = 75,00 € (the override doesn't count, so no group deal) |
| 2 keychains + 1 Big Figure | 7 + 30 = 37,00 € |
| empty cart | 0,00 € |

## App changes

### Cart and checkout (`pages/catalog.vue`, `components/CartPanel.vue`)
- `priceCart` drives the cart total in place of the per-item `priceOf` sum.
- `CartPanel` shows:
  - the lines, each at its unit price, as today;
  - a "Deals" block with one row per applied deal (`<deal name>: −X,XX €`);
  - the total.
- Checkout:
  - uses `total` as the transaction amount;
  - the description is the existing item lines followed by `Deals: <name> (−X,XX €), …` when deals applied;
  - stock movements are unchanged.
- **Card hint:** each product card shows a hint for regular (non-override) articles in a deal, e.g. `2 for 7 €` or `25 € each from 2`.

### Deals screen (`components/DealManager.vue`, Settings section `deals`)
- **List:** one row per deal, with its name and summary (`2 for 7,00 €` or `each 25,00 € from 2`) and the category names.
- **Editor** (BottomSheet) fields:
  - name;
  - type (SegmentedControl: "N for X €" / "Each X € from N");
  - categories as checkboxes (bundle allows exactly one);
  - N (min 2);
  - price (> 0, comma decimals allowed).
- **Validation messages:**
  - `Enter a name`
  - `Choose a category`
  - `Choose exactly one category for an "N for X €" deal`
  - `N must be a whole number of 2 or more`
  - `Price must be above 0`
  - `<Category> is already in the deal "<name>"`
- **Live example** under the form. For a bundle it prices N+1 items (e.g. "3 items → 11,00 €"); for a group it prices N items.
- **Delete:** with confirmation.
- Owner-only, like the rest of Settings.

### Data access (`composables/useDeals.js`)
- `listDeals`, `createDeal`, `updateDeal`, `deleteDeal`, via the PocketBase SDK.
- The catalog loads deals alongside articles and categories.

## Migration (`scripts/pb-migrate.mjs`, `scripts/lib/pb-plan.mjs`)

- `planSchema` creates `deals` with locked writes and public read when it is missing. The relation targets `categories`, which is resolved by name as in sub-project 1.
- `--apply` seeds the five deals from the table above:
  - matched by category name;
  - a deal is skipped if any of its categories already belongs to a deal;
  - safe to re-run.
- `rulesFor(ownerId)` gains `deals` (list and view public; create, update and delete owner).
- The unit tests in `tests/unit/pb-plan.test.js` cover the new op, the rules, idempotency and the seed.

## Testing

- **Unit:** `tests/unit/deals.test.js` covers every worked example, plus:
  - an override inside a deal category;
  - an ignored invalid deal;
  - cent rounding (e.g. 3 × 2,50 € bundles);
  - savings attribution.
- **Unit, stock floor:** `tests/unit/inventory.test.js` covers:
  - `+1, −1, −1, +3` → 3;
  - order sensitivity, using the `created` sort.
- **e2e** (fake PocketBase gains `deals`, seeded by `api.seed({ deals })`):
  - the cart shows deal rows and correct totals for keychains and the big-items group, on desktop and phone;
  - checkout posts the deal total, and the description names the deal;
  - the card hint is visible;
  - Settings → Deals:
    - create;
    - edit price;
    - delete;
    - the overlap refusal message;
    - the "exactly one category" rule for bundles;
  - the stock floor: double sale of the last item, then "Add printed 3", shows `3 left`.
- **375px sweep:** add `/settings#deals`.

## Out of scope

- Percentage discounts, free items, date-limited promotions, and stacking several deals on one category.
- Deal pricing on Etsy (sub-project 5), commissions (3) and the print board (4).
- Changing an existing transaction's amount after the fact.
