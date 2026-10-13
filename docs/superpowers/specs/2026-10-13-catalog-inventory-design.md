# Catalog management, inventory and owner login: design

Date: 2026-10-13
Status: Draft for review
Sub-project 1 of 5. The later sub-projects are: 2 cart pricing rules, 3 commissions, 4 print board, 5 Etsy sync.

## Goal

Manage the catalog from the app. That means creating, editing and deleting categories and articles, tracking stock per article with a logged history of every change, and protecting all of it behind an owner login. Read access to the catalog stays public, so the later public commission page can list articles.

**Stated by the owner**
- Articles need a category, and categories and articles can be created and deleted.
- Inventory is set per article, and every change is recorded.
- The current categories and base prices are:

  | Category | Base price |
  |---|---|
  | GatchaPon | 4 € |
  | Keychain | 4 € |
  | Mini Figure | 8 € |
  | Big Figure | 30 € |
  | Pokeball | 30 € |
  | CardridgeCase | 30 € |
  | Coaster | 8 € |
  | Bookmark | 5 € |
  | Walldisplay | 30 € |

  The bundle and cross-category discounts belong to sub-project 2.
- Decisions taken during design:
  - Data lives in the existing PocketBase at `pocket.lasseharm.space`. Schema changes are made with admin access.
  - Price comes from the category, and an article may override it.
  - Stock is deducted automatically on sale and adjusted by hand, and every change is logged.
  - The owner logs in. The public commission form (sub-project 3) needs no login and can only create commissions.
  - Login uses PocketBase auth directly from the browser (approach A). The shared token currently shipped to the browser is retired.
  - Overselling is allowed: the app warns, stock stops at 0, and the oversell is logged.

**Assumptions**
- This builds on the mobile-first UI overhaul (`feat/mobile-ui-overhaul`, PR open against `test/playwright`) and reuses its components: `BottomSheet`, `BaseCard`, `ListRow`, `SegmentedControl`, `ToggleSwitch` and `useToast`.
- The owner account is a record in PocketBase's `users` auth collection, separate from the PocketBase superuser.
- There is one owner. Roles and multiple staff accounts are out of scope.

## Success criteria

1. While logged out, the Dashboard, Reports, Settings and every management action redirect to `/login`. The catalog can still be browsed, but selling and managing are hidden.
2. The owner can create, edit and delete articles and categories from the app. A deleted article disappears from the catalog, but its sales and stock history remain.
3. Every stock change is a `stock_movements` record with an article, a signed change, a reason (`sale`, `printed` or `correction`), an optional note and a timestamp. The article's `stock` always equals the sum of its movements and never goes below 0.
4. Checkout lowers stock for each cart line. Selling more than is in stock is possible: the cart warns, stock ends at 0, and the movement records the oversell.
5. Offline checkouts queue their stock movements next to the transaction and sync them later, in order.
6. No PocketBase write succeeds without the owner's auth token. A request using the old shared token is rejected once the new rules are applied.
7. The schema change is a reviewable script with a dry run, and the resulting schema is committed to the repo.

## Data model (PocketBase)

### `categories` (new)

| Field | Type | Rules |
|---|---|---|
| `name` | text | required, unique |
| `base_price` | number | required, ≥ 0 |
| `sort_order` | number | integer, default 0 |

Seeded with the nine categories above, in the order listed. Sub-project 2 will add pricing-rule fields here.

### Articles: `budget_tracket_catalog` (existing, extended)

The collection keeps its name, typo included. Renaming it would break the current app and existing image URLs.

| Field | Change |
|---|---|
| `category` | **new**: relation to `categories`, single, required (set during migration) |
| `price` | **now optional**. Empty means the category's `base_price` applies |
| `stock` | **new**: number, integer, ≥ 0, default 0 |
| `low_stock_threshold` | **new**: number, integer, ≥ 0, default 2 |
| `active` | existing. Deleting an article in the app sets `active = false` (soft delete) |
| `name`, `description`, `images` | unchanged |

The unused legacy fields `created_at` and `updated_at` are left alone, because removing fields is out of scope.

**Effective price** = `price` if it is set, otherwise `category.base_price`. This is computed in the app, in `utils/pricing.js`.

### `stock_movements` (new)

| Field | Type | Rules |
|---|---|---|
| `article` | relation to articles | required |
| `change` | number | integer, non-zero |
| `reason` | select | `sale`, `printed`, `correction` |
| `note` | text | optional. An oversell writes `oversold by N` |
| `created` | autodate | |

**Keeping stock and log consistent**
- A checkout, "Add printed" or "Correct count" writes the movement and the article's new `stock` together.
- If the server supports PocketBase's batch API (v0.23 or later), both go in one batch request, which is all-or-nothing. The migration script reports the server version.
- On older servers the movement is written first and the stock second, with the stock recomputed from movements on failure. On sync, the offline queue recomputes stock from movements, so a half-applied pair repairs itself.

**Oversell:** for a sale of `q` with `stock = s` and `q > s`:
- the movement records `change = -s` with `note = "oversold by (q - s)"`;
- `stock` becomes 0;
- the transaction amount is still the full sale.

### Access rules

| Collection | list / view | create / update / delete |
|---|---|---|
| `categories` | public | owner only |
| articles | public, only `active = true` (the owner sees all) | owner only |
| `stock_movements` | owner only | owner only (no update; corrections are new movements) |
| `budget_tracker_transactions` (existing) | owner only | owner only |

"Owner only" means `@request.auth.id = "<owner record id>"`, where the owner is a record in `users`. `--apply-rules` pins that id and disables public sign-up on `users` (`createRule: null`), so no self-registered account can write. The commissions collection and its public create rule arrive in sub-project 3.

New collections are created with all write rules locked (admin only) and get their owner rules only from `--apply-rules`.

## App changes

### Auth

- Add the `pocketbase` JS SDK and a `composables/usePocketBase.js` that holds a single client. The base URL comes from runtime config. Auth state persists in localStorage via the SDK's default store, and the token is refreshed on app start when it is close to expiry.
- New `composables/useAuth.js` exposing `user`, `isOwner`, `login(email, password)` and `logout()`.
- New `pages/login.vue`: email, password, submit and an error message. It has no tab bar and redirects back to where you came from.
- New route middleware `middleware/owner.js`, applied to `/`, `/reports` and `/settings`. Catalog management is gated in the UI by `isOwner`, and the server enforces it again through the access rules.
- `useTransactions` switches from the `x-token` header to the SDK's authenticated client. The offline queue holds writes while there is no valid session and syncs them after login.
- Settings → API Configuration loses the token field. It shows the PocketBase URL plus "Logged in as …" and a log-out button.

### Catalog tab

- Category chips filter the grid (All plus one chip per category, in `sort_order`).
- Each card shows the effective price and a stock badge: `N left`, `Low` when stock ≤ threshold, or `Out of stock`.
- **Manage** button in the page header (owner only) toggles edit mode. In edit mode, tapping a card opens the article sheet, and a **+ New article** button appears.
- Selling stays as it is: tap to add to the cart. When a cart line's quantity exceeds stock, the line shows "only N in stock", and checkout is still allowed.

### Article sheet (`components/ArticleSheet.vue`)

- **Fields:** name (required), category (required select), price override (placeholder shows the category price), description, images (upload and remove, using PocketBase file fields), low-stock threshold.
- **Inventory block:**
  - current stock;
  - **Add printed** (+N, reason `printed`);
  - **Correct count** (set to N, which writes the difference as reason `correction`, with an optional note);
  - the last 10 movements as `ListRow`s.
- **Delete:** a confirmation, then soft delete.
- Validation errors are shown inline, following the TransactionForm pattern.

### Categories (Settings → new "Categories" section)

- A list showing each category's name and base price, with an add button and rename/reprice in a sheet. Reordering uses up/down buttons that set `sort_order`.
- Deleting is blocked while active articles use the category. The message says how many, e.g. "Move the 3 Keychain articles first".

### Checkout

- `submitToBalance` creates the transaction plus one `sale` movement per line, and updates each article's stock as described above.
- Offline, the transaction and its movements go into the queue as one entry and are replayed together.

## Migration and rollout

**Script:** `scripts/pb-migrate.mjs` (Node, run locally)
- **Credentials:** `POCKETBASE_URL` and the admin login from `.env`, which is gitignored: `POCKETBASE_ADMIN_EMAIL` and `POCKETBASE_ADMIN_PASSWORD` (PocketBase 0.22 superuser login, exchanged once for a token). `POCKETBASE_ADMIN_TOKEN` is an optional alternative that skips the login. Credentials are never used by the app, never logged and never committed.
- **`--dry-run` (default):** prints the server version, the planned collection and field changes, the nine categories to seed, and the proposed article → category mapping.
- **`--apply`:**
  - creates or extends the collections;
  - seeds the categories;
  - applies the mapping from `scripts/category-mapping.json`, which the dry run writes and the owner edits;
  - reports how many accounts exist in `users` (informational; no owner is needed yet);
  - writes `pocketbase/schema.json`.
  - It is idempotent: running it twice changes nothing.
- **`--apply-rules [--owner <email>]`:** switches the access rules to the owner record and closes public sign-up on `users`. It lists `users` and picks the owner: the single account, or the one given by `--owner <email>` when there are several. It is a separate step because of the rollout order below.

**Rollout order**
1. Run `--apply`. The old rules stay in place, so the deployed app keeps working.
2. Edit the category mapping if needed, and set real stock counts afterwards with "Correct count".
3. Deploy the new app.
4. Run `--apply-rules`. From then on only a logged-in owner can write.

## Testing

Playwright, with PocketBase mocked through route handlers in the same style as today's fixtures. The `api` fixture gains handlers for auth, categories, articles, `stock_movements` and batch requests.
- **Login:** logged out, `/`, `/reports` and `/settings` redirect to `/login`. A successful login returns to the requested page. Logging out hides management.
- **Articles:** create with a category; the price-override fallback; edit; soft delete hides the article from the catalog.
- **Stock:** "Add printed" and "Correct count" write the right movements. Checkout deducts stock and logs `sale`. Overselling shows the warning, ends at 0 and notes the oversell.
- **Offline:** checkout queues the transaction and movements, then syncs them in order.
- **Categories:** create, reprice, reorder. Deleting a category in use is blocked with a count.
- **Migration script:** a Node unit test of the plan builder against a recorded copy of the current schema (`tests/fixtures/pb-schema-current.json`), covering both the dry-run output and idempotency.

## Out of scope

- Bundle and cross-category discounts (sub-project 2), commissions (3), the print board (4) and Etsy sync (5).
- Multiple users or roles, and password reset flows. The owner account is managed in the PocketBase admin.
- Auto-deploy to the VPS (parked).
- Removing legacy fields or renaming the articles collection.
