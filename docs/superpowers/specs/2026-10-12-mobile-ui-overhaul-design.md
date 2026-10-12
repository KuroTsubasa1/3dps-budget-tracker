# Mobile-first UI overhaul — design

Date: 2026-10-12
Status: Draft for review

## Goal

Make every page of the budget tracker work as well on a phone as on desktop, and refresh the visual style to a clean, calm look.

**Stated by the owner**
- All five pages (Dashboard, Catalog, Business Card, Reports, Settings) matter equally on mobile.
- Mobile-first layouts plus a visual refresh, not just targeted fixes.
- Phone navigation: bottom tab bar with all five pages.
- Visual direction: "clean & calm".

**Assumptions (accepted)**
- Desktop remains fully supported.
- No feature or behaviour changes: offline queue, sync, PWA, dark mode, settings persistence and currency formatting all work as today.
- Front-end only. Composables (`useTransactions`, `useAppSettings`, `useOfflineQueue`) and `utils/` keep their public API.

## Success criteria

1. No horizontal page scroll at 375px width on any page, in light or dark mode.
2. Interactive controls on mobile have a tap target of at least 44×44px.
3. Primary actions on mobile sit in the bottom half of the screen: the tab bar, add-transaction button, cart bar and sheet actions.
4. Notched phones are handled: the top bar and tab bar respect `env(safe-area-inset-*)`.
5. Every existing Playwright spec passes on Desktop Chrome. Mobile coverage runs on a new `Pixel 7` project (see Testing).
6. Dark mode is styled only through Tailwind `dark:` variants. Templates contain no `displaySettings.darkMode ? … : …` class ternaries.

## Visual system

- **Surfaces:** solid, with no gradients, `backdrop-blur` or glass effects.
  - Light mode: page `gray-50`, cards `white` with a `gray-200` hairline border and no heavy shadow.
  - Dark mode: page `gray-950`, cards `gray-900`, borders `gray-800`.
- **Accent:** a single blue (`blue-600`, or `blue-500` in dark mode) for primary actions, the active tab and focus rings.
- **Money semantics:** green (`emerald-600`, or `emerald-400` in dark mode) for income and positive balances; red (`red-600`, or `red-400` in dark mode) for expenses and negative balances. These colours are used for nothing else.
- **Type:** system font stack. Page title `text-xl font-semibold`, section title `text-base font-semibold`, body `text-sm`/`text-base`. Money figures use `tabular-nums`.
- **Shape and spacing:** `rounded-xl` on cards, `rounded-lg` on controls. Mobile page gutter is 16px (`px-4`), with `gap-4` between cards.
- **Motion:** remove the hover-scale and translate effects. Keep short (150–200ms) opacity and transform transitions, used only for sheets and toasts. Respect `prefers-reduced-motion`.
- **Tokens:** colours go in `tailwind.config.js` under semantic names: `surface`, `surface-muted`, `border`, `accent`, `income`, `expense`. Component classes in `assets/css/main.css` (`.card`, `.btn`, `.input`, …) are rewritten to use these tokens so pages stay short.
- **PWA manifest:** `theme_color` becomes the light surface colour. Add `<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">` and `theme-color` meta tags for light and dark mode via `app.head`.

## App shell

`app.vue` becomes a thin shell, roughly 60 lines:

```
AppTopBar        sticky top; app title (+ display name on ≥sm), header balance (if enabled)
NetworkBanner    under top bar; offline / pending / sync state (moved out of index.vue)
<main>           NuxtPage; bottom padding = tab bar height + safe area on mobile
AppBottomNav     md:hidden; fixed bottom; 5 tabs, icon + label, active = accent
AppSideNav       hidden md:flex; fixed left rail (lg: icons + labels, md: icons only)
ToastHost        stacks toasts above the tab bar (bottom-center on mobile, bottom-right on desktop)
PWAInstall       rendered through ToastHost position rules instead of its own corners
```

- Navigation items live in one array, `NAV_ITEMS` (`to`, `label`, `icon`) in `utils/navigation.js`, shared by both nav components. This removes the five copies of each link that `app.vue` has today.
- Icons move to an `AppIcon` component (`name` prop → inline SVG path map) so the SVG path strings appear once.
- The hamburger menu, outside-click handling, resize listener and `IntersectionObserver` balance-hiding logic are removed.
- `NetworkBanner` stays on the Dashboard only, as it does today. The existing "1 pending" text and sync button are kept.

## Shared components (`components/`)

| Component | Purpose |
|---|---|
| `AppTopBar`, `AppBottomNav`, `AppSideNav`, `AppIcon` | Shell (above) |
| `PageHeader` | Page title (`<h1>`) and optional actions slot. Every page uses it. The heading text is unchanged so tests keep matching it. |
| `BaseCard` | Card with optional `title` (`<h2>`) and `icon`, `#actions` slot, and body slot |
| `BaseButton` | `variant`: primary / secondary / ghost / danger; `size`: md / lg; `block`; min height 44px |
| `SegmentedControl` | Pill toggle (`v-model`, `options`). Used for the Income/Expense toggle. |
| `BottomSheet` | `v-model:open` and `title`. On mobile it slides up from the bottom with a handle, backdrop and safe-area padding, and closes on backdrop tap or Esc. From `md` up it renders as a centred dialog. It traps focus and locks body scroll. |
| `ToastHost` + `useToast()` | Replaces the ad-hoc success notification in Settings. `useToast` lives in `composables/useToast.js`. |
| `ListRow` | Leading icon, title/subtitle, and trailing value/chevron. Used for transactions, report tables and the settings list. |

## Pages

### Dashboard (`pages/index.vue`)

- **Balance hero:** shows the all-time balance large, with its Japan (10%) figure beneath it. Today's balance and today's Japan (10%) figure appear as a secondary 2-column row inside the same card. The `Balance Summary` heading is kept.
- **Recent transactions:** rendered as `ListRow`s, with the amount coloured by type and the date as the subtitle.
- **Add transaction on mobile:** a floating "+" button sits bottom-right above the tab bar and opens `BottomSheet` "Add Transaction". The sheet contains:
  - the Income/Expense `SegmentedControl`;
  - the description input (placeholder `What is this transaction for?`, unchanged);
  - the amount input (placeholder `0.00`, unchanged) with the existing numpad;
  - notes;
  - a full-width `Add to Balance` button.
- **Add transaction on desktop (`lg+`):** two-column layout. The form card is inline on the right and the balance and transactions are on the left, with no floating button.
- The form is extracted into `components/TransactionForm.vue`, so the sheet and the inline card render the same component. Validation messages are unchanged.

### Catalog (`pages/catalog.vue`)

- The fixed 1/3 sidebar is removed.
- The top section has the search input (placeholder `Search products...`, unchanged). Below it, the existing sort controls (name/price select and the `A to Z`/`Z to A` direction toggle) sit on one row as compact chips. There are no category filters today and none are added.
- **Product grid:** 2 columns on mobile, 3 on `md`, 4 on `xl`. Cards show a square image, name (`<h3>`), price and an add/quantity stepper.
- **Cart on mobile:** a sticky bar sits above the tab bar when the cart is not empty, showing `N items · €X` and "View cart". Tapping it opens `BottomSheet` "Cart" with line items, the total and `Add to Balance`.
- **Cart on desktop (`lg+`):** a sticky right-hand column (`w-80`) shows the same cart content.
- The cart content is extracted to `components/CartPanel.vue` and used in both places. The `N items` text format is kept, including `0 items`.
- Loading, error (`Try Again`) and empty (`No products match your search`, `Clear Search`) states are kept and restyled.

### Reports (`pages/reports.vue`)

- The period selector keeps its six options (This Week, This Month, Last Month, This Quarter, This Year, Custom Range). They become a horizontally scrolling chip row on mobile and wrap on `md+`; six options are too many for a segmented control at 375px. Custom Range shows two date inputs stacked on mobile and side by side on `md`. The refresh button moves into the `PageHeader` actions.
- **KPI cards:** income, expenses and net in a 2-column grid on mobile, with net spanning both columns; 3 columns on `md`.
- **Charts:** stack full-width on mobile and sit 2-up on `lg`. Chart.js runs with `maintainAspectRatio: false` inside fixed-height containers (`h-56` on mobile, `h-72` on desktop). Chart colours come from the money tokens and are re-applied when dark mode toggles.
- **Tables:** "Top Expense Categories" and "Recent Transactions" render as `ListRow` lists on mobile and keep a `<table>` from `md`.

### Settings (`pages/settings.vue`)

- **Mobile:** a grouped list of the five sections (Account, API, Display, Notifications, Data). Tapping one shows that section with a back button, held in local state with the URL hash synced (`/settings#display`). Each section fits in one column.
- **Desktop (`md+`):** two-pane layout with the section list on the left and content on the right, as today but restyled.
- Toggles become proper switch controls with 44px rows.
- The "Clear All Data" confirmation moves to `BottomSheet`. The success notification moves to `useToast`.
- **Danger zone:** kept visually separate with the expense colour.

### Business Card (`pages/business-card.vue`)

- One centred card (`max-w-sm`) with the shop name, contact rows and the QR code (`Scan QR Code`, unchanged).
- Share (Web Share API where available) and Print buttons sit full-width under the card.
- The `Digital Business Card` heading is moved into `PageHeader`.

## Existing-code cleanup in scope

- Remove the `displaySettings.darkMode` class ternaries from `app.vue` and the pages. Dark mode is still applied by toggling `html.dark` (existing plugin and watcher).
- Delete the `.nav-link`, `.transaction-item` and `.transaction-icon` classes and any other `main.css` classes that become unused.
- Unrelated refactors are out of scope.

## Testing

- **`playwright.config.js`:** add a `mobile` project using `devices['Pixel 7']` alongside `chromium`.
- **Existing specs:** unchanged on desktop. On mobile, the transaction and catalog specs reach the form or cart through a small fixture helper, `openTransactionForm(page)` / `openCart(page)`, which taps the floating button or cart bar on mobile and is a no-op on desktop. User-visible labels and placeholders are kept stable so assertions do not change.
- **New `tests/e2e/mobile.spec.js`** (mobile project only):
  - tapping each bottom tab navigates to the matching page and marks it active (`aria-current="page"`);
  - the add-transaction sheet opens, submits and closes, and the new transaction appears in the list;
  - the cart bar appears after adding a product, and the cart sheet shows items and total;
  - for every page, in light and dark mode, `document.documentElement.scrollWidth <= window.innerWidth`.
- **Desktop:** a side-nav navigation test is added to `navigation.spec.js`.
- **Manual check before completion:** screenshots of every page at 375×812 and 1280×800, in light and dark mode.

## Delivery order

Each step is its own commit and keeps the full test suite green:

1. Tokens, `main.css` rewrite, viewport/theme meta, mobile Playwright project
2. Shell: `AppIcon`, nav components, `NAV_ITEMS`, `ToastHost`/`useToast`, slim `app.vue`, `PWAInstall` positioning
3. Base components: `PageHeader`, `BaseCard`, `BaseButton`, `SegmentedControl`, `BottomSheet`, `ListRow`
4. Dashboard and `TransactionForm`
5. Catalog and `CartPanel`
6. Reports
7. Settings
8. Business Card
9. `mobile.spec.js`, overflow checks, manual screenshot pass, cleanup of unused CSS

## Out of scope

- New features, data-model or API changes
- Switching UI libraries or upgrading Tailwind to v4
- i18n or copy rewrites, other than wording a restyle requires
