# Mobile-first UI Overhaul Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rebuild every page of the budget tracker mobile-first, with a bottom tab bar, bottom sheets and a calm token-based visual style, while desktop stays fully usable.

**Architecture:** Semantic colour tokens are CSS variables redefined under `html.dark` and exposed through Tailwind. A thin `app.vue` shell holds a top bar, a bottom tab bar (phones) and a side rail (md+). A small kit of shared components (`BottomSheet`, `SegmentedControl`, `ListRow`, `BaseCard`, …) sits on top of that. Each page is then rebuilt on the kit. Flows that are inline on desktop (the add-transaction form, the cart) move into bottom sheets below `lg`. `useMediaQuery` picks one layout, so the DOM never holds both.

**Tech Stack:** Nuxt 3.15 (Vue 3.5, `<script setup>`), Tailwind 3.4 + `@tailwindcss/forms`, Playwright 1.63 (`chromium` and the new `mobile` Pixel 7 projects).

**Spec:** `docs/superpowers/specs/2026-10-12-mobile-ui-overhaul-design.md`

## Global Constraints

- No horizontal page scroll at 375px wide on any page, in light or dark mode.
- Mobile tap targets are at least 44×44px (`min-h-[44px]`, `h-11 w-11`). A control inside a `<label>` row counts the row.
- Phone bottom chrome (tab bar, add button, cart bar, sheets) respects `env(safe-area-inset-bottom)`, and the top bar respects `env(safe-area-inset-top)`.
- Colours come from the tokens `surface`, `card`, `muted`, `line`, `ink`, `ink-muted`, `accent`, `income` and `expense`. Green and red (`income`/`expense`) are only for money in/out and errors. Do not reintroduce gradients, `backdrop-blur` or hover-scale effects.
- No `displaySettings.darkMode ? … : …` class ternaries. In `<script>`, settings refs are read with `.value` (`displaySettings.value.darkMode`). Templates auto-unwrap them.
- Composables (`useTransactions`, `useAppSettings`, `useOfflineQueue`) and `utils/currency.js`/`utils/date.js` keep their public API. Do not edit them.
- Keep these user-visible strings exactly, because tests and muscle memory rely on them:
  - headings: `Balance Summary`, `Product Catalog`, `Digital Business Card`, `Financial Reports`, `Settings`, `Scan QR Code`;
  - buttons: `Add to Balance`, `Try Again`, `Clear Search`;
  - placeholders: `What is this transaction for?`, `0.00`, `Search products...`;
  - messages: `N items`, `N pending`, `Please enter a description for the transaction`, `Please enter a valid amount`, `No products match your search`, `Failed to save transaction to server`.
- Code style (CLAUDE.md):
  - 2-space indent, single quotes, no semicolons in `.js`/`<script>`;
  - imports ordered Vue core, then composables, then utils;
  - currency always goes through `formatCurrency()`.
- Breakpoints: phone below `md` (768px), with the bottom tab bar. Rail at `md` and up. Inline cart and form at `lg` (1024px) and up, otherwise sheets.

## Review Focus

1. **Saving Display Settings in dark mode must keep dark mode.** Today the save handler reads `displaySettings.darkMode` off a ref (undefined) and removes `html.dark`. *Pinned by the Task 6 test "dark mode survives saving and reloading".*
2. **Long descriptions, big amounts and long product names must not cause sideways scroll at 375px.** *Pinned by the Task 8 overflow sweep, which seeds long content.*
3. **Leaving the Dashboard with the add sheet open (browser back) must unlock page scroll.** *Pinned by the Task 3 test "leaving the page with the sheet open unlocks scrolling".*
4. **Crossing the `lg` breakpoint with a sheet open (rotating a tablet) must drop the sheet, unlock scroll and show the inline form.** *Pinned by the Task 3 test "growing past the desktop breakpoint swaps the sheet for the inline form".*
5. **Opening `/settings#display` directly on a phone shows that section, and Back returns to the list.** *Pinned by the Task 6 test "deep link opens a section and back returns to the list".*

## Working setup (read before Task 1)

- Run `npm run dev` in a second terminal (port 3000) while working. `playwright.config.js` has `reuseExistingServer: true` locally, so test runs use the dev server with hot reload and don't rebuild.
- The production check at the end of Task 8 stops the dev server and lets Playwright run `npm run build && npm run preview` itself.
- Run one project: `npx playwright test tests/e2e/<file> --project=mobile` (or `--project=chromium`).
- Until Task 8, the `mobile` project only runs the spec files listed in its `testMatch`. Each task adds its own files.

## File map

| File | Responsibility | Task |
|---|---|---|
| `tailwind.config.js` | Token colours → Tailwind names | 1 |
| `assets/css/main.css` | Token values (light/dark), component classes, safe-area utilities, sheet/toast transitions | 1, 8 |
| `nuxt.config.ts` | `viewport-fit=cover` | 1 |
| `playwright.config.js` | `mobile` project (Pixel 7) | 1, each task, 8 |
| `utils/icons.js`, `components/AppIcon.vue` | One inline-SVG icon set | 2 |
| `utils/navigation.js` | `NAV_ITEMS`, `isActivePath()` | 2 |
| `components/AppTopBar.vue`, `AppBottomNav.vue`, `AppSideNav.vue` | Shell chrome | 2 |
| `composables/useToast.js`, `components/ToastHost.vue` | Toast queue and stack (with PWA prompts) | 2 |
| `components/PWAInstall.vue` | Restyled, no own positioning | 2 |
| `app.vue` | Thin shell, dark-mode watcher, hydration marker | 2 |
| `composables/useMediaQuery.js` | SSR-safe `matchMedia` ref | 3 |
| `components/PageHeader.vue`, `BaseCard.vue`, `BaseButton.vue`, `SegmentedControl.vue`, `BottomSheet.vue`, `ListRow.vue` | Shared kit | 3 |
| `components/TransactionForm.vue`, `NetworkBanner.vue` | Dashboard pieces | 3 |
| `pages/index.vue` | Dashboard | 3 |
| `components/QuantityStepper.vue`, `CartPanel.vue` | Catalog pieces | 4 |
| `pages/catalog.vue` | Catalog | 4 |
| `pages/reports.vue` | Reports | 5 |
| `components/ToggleSwitch.vue`, `pages/settings.vue` | Settings | 6 |
| `pages/business-card.vue` | Business card | 7 |
| `tests/e2e/fixtures.js` | `gotoReady`, `openTransactionForm` helpers | 2, 3 |
| `tests/e2e/theme.spec.js`, `shell.spec.js`, `dashboard.spec.js`, `reports.spec.js`, `settings.spec.js`, `business-card.spec.js`, `mobile.spec.js` | New specs | 1–8 |

---

### Task 1: Theme tokens and foundation

**Files:**
- Modify: `tailwind.config.js`
- Modify: `assets/css/main.css` (full rewrite)
- Modify: `nuxt.config.ts` (add `app.head.viewport`)
- Modify: `playwright.config.js` (add `mobile` project)
- Test: `tests/e2e/theme.spec.js` (create)

**Interfaces:**
- Produces:
  - Tailwind colours `surface`, `card`, `muted`, `line`, `ink` (`text-ink`), `ink-muted` (`text-ink-muted`), `accent`, `income` and `expense`. All accept opacity, e.g. `bg-accent/10`.
  - Component classes `.card`, `.btn`, `.btn-lg`, `.btn-primary`, `.btn-secondary`, `.btn-ghost`, `.btn-danger`, `.input`, `.label`, `.hint`, `.chip`, `.chip-active` and `.chip-idle`.
  - Utilities `.pt-safe`, `.pb-safe`, `.pb-nav` (main content padding above the tab bar), `.bottom-above-nav` (fixed elements sitting above the tab bar) and `.no-scrollbar`.
  - Transition classes `sheet-*` and `toast-*`.
  - Legacy `.card-header` and `.card-body` stay until Task 8.

Intermediate state: pages not yet rebuilt keep working, but their dark mode looks rough until their own task. That is expected; Task 2 restores dark mode at the shell level.

- [ ] **Step 1: Write the failing test**

Create `tests/e2e/theme.spec.js`:

```js
import { test, expect } from './fixtures.js'

const bodyBackground = page =>
  page.evaluate(() => getComputedStyle(document.body).backgroundColor)

test.describe('theme foundation', () => {
  test('page uses the light surface colour by default', async ({ page }) => {
    await page.goto('/business-card')
    expect(await bodyBackground(page)).toBe('rgb(249, 250, 251)')
  })

  test('the dark class switches the surface tokens', async ({ page }) => {
    await page.goto('/business-card')
    await page.evaluate(() => document.documentElement.classList.add('dark'))
    expect(await bodyBackground(page)).toBe('rgb(3, 7, 18)')
  })

  test('viewport lets the layout reach under the notch', async ({ page }) => {
    await page.goto('/business-card')
    await expect(page.locator('meta[name="viewport"]')).toHaveAttribute('content', /viewport-fit=cover/)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx playwright test tests/e2e/theme.spec.js --project=chromium`
Expected: 3 FAIL. The body background is `rgba(0, 0, 0, 0)` (it's a gradient image today), and the viewport content has no `viewport-fit`.

- [ ] **Step 3: Add the `mobile` Playwright project**

In `playwright.config.js`, replace the `projects` array with:

```js
  projects: [
    { name: 'chromium', use: { ...devices['Desktop Chrome'] } },
    {
      name: 'mobile',
      use: { ...devices['Pixel 7'] },
      // Widened task by task as pages are rebuilt mobile-first; the last task removes this filter
      testMatch: /(theme)\.spec\.js$/
    }
  ],
```

- [ ] **Step 4: Rewrite `tailwind.config.js`**

```js
/** @type {import('tailwindcss').Config} */
// Colours are CSS variables (see assets/css/main.css) so one class covers light and dark mode
const token = name => `rgb(var(--color-${name}) / <alpha-value>)`

module.exports = {
  darkMode: 'class',
  content: [
    "./components/**/*.{js,vue,ts}",
    "./layouts/**/*.vue",
    "./pages/**/*.vue",
    "./plugins/**/*.{js,ts}",
    "./app.vue",
    "./error.vue",
  ],
  theme: {
    extend: {
      colors: {
        surface: token('surface'),
        card: token('card'),
        muted: token('muted'),
        line: token('line'),
        ink: {
          DEFAULT: token('ink'),
          muted: token('ink-muted')
        },
        accent: token('accent'),
        income: token('income'),
        expense: token('expense')
      }
    },
  },
  plugins: [
    require('@tailwindcss/forms'),
  ],
}
```

- [ ] **Step 5: Rewrite `assets/css/main.css`**

```css
@tailwind base;
@tailwind components;
@tailwind utilities;

@layer base {
  :root {
    --color-surface: 249 250 251;
    --color-card: 255 255 255;
    --color-muted: 243 244 246;
    --color-line: 229 231 235;
    --color-ink: 17 24 39;
    --color-ink-muted: 107 114 128;
    --color-accent: 37 99 235;
    --color-income: 5 150 105;
    --color-expense: 220 38 38;
    color-scheme: light;
  }
  html.dark {
    --color-surface: 3 7 18;
    --color-card: 17 24 39;
    --color-muted: 31 41 55;
    --color-line: 31 41 55;
    --color-ink: 243 244 246;
    --color-ink-muted: 156 163 175;
    --color-accent: 59 130 246;
    --color-income: 52 211 153;
    --color-expense: 248 113 113;
    color-scheme: dark;
  }
  body {
    @apply min-h-screen bg-surface font-sans text-ink antialiased;
    -webkit-tap-highlight-color: transparent;
  }
  h1, h2, h3, h4, h5, h6 {
    @apply tracking-tight;
  }
}

@layer components {
  .card {
    @apply rounded-xl border border-line bg-card;
  }
  /* Legacy page sections, removed once every page uses BaseCard (Task 8) */
  .card-header {
    @apply border-b border-line p-4 md:p-5;
  }
  .card-body {
    @apply p-4 md:p-5;
  }
  .btn {
    @apply inline-flex min-h-[44px] items-center justify-center gap-2 rounded-lg px-4 text-sm font-semibold transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-accent/50 disabled:cursor-not-allowed disabled:opacity-50;
  }
  .btn-lg {
    @apply min-h-[52px] text-base;
  }
  .btn-primary {
    @apply bg-accent text-white hover:bg-accent/90;
  }
  .btn-secondary {
    @apply border border-line bg-card text-ink hover:bg-muted;
  }
  .btn-ghost {
    @apply text-ink-muted hover:bg-muted hover:text-ink;
  }
  .btn-danger {
    @apply bg-expense text-white hover:bg-expense/90;
  }
  /* text-base keeps iOS from zooming into focused inputs */
  .input {
    @apply block min-h-[44px] w-full rounded-lg border-line bg-card px-3 text-base text-ink placeholder:text-ink-muted focus:border-accent focus:ring-2 focus:ring-accent/30;
  }
  .label {
    @apply mb-1.5 block text-sm font-medium text-ink;
  }
  .hint {
    @apply mt-1 text-xs text-ink-muted;
  }
  .chip {
    @apply inline-flex min-h-[44px] shrink-0 items-center gap-1.5 rounded-full border px-4 text-sm font-medium transition-colors;
  }
  .chip-active {
    @apply border-accent bg-accent/10 text-accent;
  }
  .chip-idle {
    @apply border-line bg-card text-ink-muted hover:text-ink;
  }
}

@layer utilities {
  .pt-safe {
    padding-top: env(safe-area-inset-top);
  }
  .pb-safe {
    padding-bottom: env(safe-area-inset-bottom);
  }
  /* Tab bar is h-16 (4rem); keep page content and floating controls clear of it */
  .pb-nav {
    padding-bottom: calc(5.5rem + env(safe-area-inset-bottom));
  }
  .bottom-above-nav {
    bottom: calc(5rem + env(safe-area-inset-bottom));
  }
  .no-scrollbar {
    scrollbar-width: none;
  }
  .no-scrollbar::-webkit-scrollbar {
    display: none;
  }
}

.sheet-enter-active,
.sheet-leave-active {
  transition: opacity 200ms ease;
}
.sheet-enter-active .sheet-panel,
.sheet-leave-active .sheet-panel {
  transition: transform 200ms ease;
}
.sheet-enter-from,
.sheet-leave-to {
  opacity: 0;
}
.sheet-enter-from .sheet-panel,
.sheet-leave-to .sheet-panel {
  transform: translateY(100%);
}
@media (min-width: 768px) {
  .sheet-enter-from .sheet-panel,
  .sheet-leave-to .sheet-panel {
    transform: translateY(1rem);
  }
}

.toast-enter-active,
.toast-leave-active {
  transition: opacity 150ms ease, transform 150ms ease;
}
.toast-enter-from,
.toast-leave-to {
  opacity: 0;
  transform: translateY(-0.5rem);
}

@media (prefers-reduced-motion: reduce) {
  .sheet-enter-active,
  .sheet-leave-active,
  .sheet-enter-active .sheet-panel,
  .sheet-leave-active .sheet-panel,
  .toast-enter-active,
  .toast-leave-active {
    transition: none;
  }
}
```

- [ ] **Step 6: Set the viewport in `nuxt.config.ts`**

Add an `app` key directly after `devtools`:

```ts
  app: {
    head: {
      viewport: 'width=device-width, initial-scale=1, viewport-fit=cover'
    }
  },
```

- [ ] **Step 7: Run tests to verify they pass**

Run: `npx playwright test tests/e2e/theme.spec.js`
Expected: 6 passed (3 chromium + 3 mobile).

Run: `npx playwright test --project=chromium`
Expected: all existing specs still pass.

- [ ] **Step 8: Commit**

```bash
git add tailwind.config.js assets/css/main.css nuxt.config.ts playwright.config.js tests/e2e/theme.spec.js
git commit -m "Add colour tokens and mobile test project"
```

---

### Task 2: App shell: tab bar, side rail, top bar, toasts

**Files:**
- Create: `utils/icons.js`, `utils/navigation.js`
- Create: `components/AppIcon.vue`, `components/AppTopBar.vue`, `components/AppBottomNav.vue`, `components/AppSideNav.vue`, `components/ToastHost.vue`
- Create: `composables/useToast.js`
- Modify: `components/PWAInstall.vue` (template only)
- Modify: `app.vue` (full rewrite)
- Modify: `tests/e2e/fixtures.js` (add `gotoReady`)
- Modify: `playwright.config.js` (`testMatch`)
- Test: `tests/e2e/shell.spec.js` (create)

**Interfaces:**
- Consumes: Task 1 tokens and utilities.
- Produces:
  - `<AppIcon name="…" />`, where `name` is a key of `ICONS` in `utils/icons.js`. An unknown name throws.
  - `NAV_ITEMS: Array<{ to, label, shortLabel, icon }>` and `isActivePath(path: string, to: string): boolean` from `utils/navigation.js`.
  - `useToast()` → `{ toasts: Ref<Array<{ id, message, tone }>>, toast(message: string, { tone?: 'success' | 'warning' | 'error', duration?: number }): number, dismiss(id: number): void }`.
  - Both navs are `<nav aria-label="Primary">`, and only one is ever displayed.
  - After hydration, `app.vue` sets the `data-hydrated` attribute on `<html>`.
  - Test helper `gotoReady(page, path)` in `fixtures.js`.

- [ ] **Step 1: Add the `gotoReady` helper**

Append to `tests/e2e/fixtures.js` (after the `test` definition, before `export { expect }`):

```js
// Layouts switch (sheet vs inline, tab bar vs rail) once the client has mounted;
// app.vue marks <html data-hydrated> in its onMounted, which runs after every child
export async function gotoReady (page, path) {
  await page.goto(path)
  await page.locator('html[data-hydrated]').waitFor({ state: 'attached' })
}
```

- [ ] **Step 2: Write the failing test**

Create `tests/e2e/shell.spec.js`:

```js
import { test, expect, gotoReady } from './fixtures.js'
import { NAV_ITEMS } from '../../utils/navigation.js'

const SETTINGS_KEY = 'budget-tracker-settings'
const TRANSACTIONS_KEY = 'budget-tracker-transactions'

test.describe('app shell', () => {
  test('primary navigation reaches every page and marks it current', async ({ page, api }) => {
    await api.mockCatalog()
    await gotoReady(page, '/business-card')
    const nav = page.getByRole('navigation', { name: 'Primary' })
    await expect(nav).toHaveCount(1)

    for (const item of NAV_ITEMS) {
      const link = nav.getByRole('link', { name: item.label, exact: true })
      await link.click()
      await page.waitForURL(url => url.pathname === item.to)
      await expect(link).toHaveAttribute('aria-current', 'page')
    }
  })

  test('phones get a bottom tab bar, larger screens a side rail', async ({ page, isMobile }) => {
    await gotoReady(page, '/business-card')
    const box = await page.getByRole('navigation', { name: 'Primary' }).boundingBox()
    const viewport = page.viewportSize()

    if (isMobile) {
      expect(box.y + box.height).toBeCloseTo(viewport.height, 0)
      expect(box.width).toBeCloseTo(viewport.width, 0)
    } else {
      expect(box.x).toBe(0)
      expect(box.height).toBeCloseTo(viewport.height, 0)
    }
  })

  test('tab bar links are comfortable tap targets', async ({ page, isMobile }) => {
    test.skip(!isMobile, 'Tab bar is phone-only')
    await gotoReady(page, '/business-card')
    const links = page.getByRole('navigation', { name: 'Primary' }).getByRole('link')
    await expect(links).toHaveCount(NAV_ITEMS.length)
    for (const link of await links.all()) {
      const box = await link.boundingBox()
      expect(box.height).toBeGreaterThanOrEqual(44)
      expect(box.width).toBeGreaterThanOrEqual(44)
    }
  })

  test('header shows the balance on every screen size', async ({ page }) => {
    await page.addInitScript(key => {
      localStorage.setItem(key, JSON.stringify([{ id: 1, description: 'Sale', amount: 12.5, date: '2026-10-12' }]))
    }, TRANSACTIONS_KEY)
    await gotoReady(page, '/business-card')
    await expect(page.getByTestId('header-balance')).toBeVisible()
    await expect(page.getByTestId('header-balance')).toContainText('12,50')
  })

  test('stored dark mode survives hydration', async ({ page }) => {
    await page.addInitScript(key => {
      localStorage.setItem(key, JSON.stringify({ display: { darkMode: true } }))
    }, SETTINGS_KEY)
    await gotoReady(page, '/business-card')
    await expect(page.locator('html')).toHaveClass(/dark/)
  })
})
```

- [ ] **Step 3: Run the mobile project with the new spec to verify it fails**

In `playwright.config.js` change the mobile `testMatch` to `/(theme|shell|navigation)\.spec\.js$/`.

Run: `npx playwright test tests/e2e/shell.spec.js`
Expected: FAIL. The import of `utils/navigation.js` fails ("Cannot find module").

- [ ] **Step 4: Create `utils/icons.js`**

```js
// Heroicons v1 outline paths (24×24, stroke 2), the set the app already used inline
export const ICONS = {
  home: 'M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6',
  bag: 'M16 11V7a4 4 0 00-8 0v4M5 9h14l1 12H4L5 9z',
  'id-card': 'M10 6H5a2 2 0 00-2 2v9a2 2 0 002 2h14a2 2 0 002-2V8a2 2 0 00-2-2h-5m-4 0V5a2 2 0 114 0v1m-4 0a2 2 0 104 0m-5 8a2 2 0 100-4 2 2 0 000 4zm0 0c1.306 0 2.417.835 2.83 2M9 14a3.001 3.001 0 00-2.83 2M15 11h3m-3 4h2',
  chart: 'M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z',
  cog: [
    'M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z',
    'M15 12a3 3 0 11-6 0 3 3 0 016 0z'
  ],
  plus: 'M12 6v6m0 0v6m0-6h6m-6 0H6',
  minus: 'M18 12H6',
  x: 'M6 18L18 6M6 6l12 12',
  check: 'M5 13l4 4L19 7',
  exclamation: 'M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z',
  trash: 'M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16',
  search: 'M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z',
  sort: 'M7 16V4m0 0L3 8m4-4l4 4m6 0v12m0 0l4-4m-4 4l-4-4',
  refresh: 'M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15',
  'chevron-right': 'M9 5l7 7-7 7',
  'chevron-left': 'M15 19l-7-7 7-7',
  cash: 'M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z',
  clipboard: 'M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2',
  calendar: 'M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z',
  cart: 'M3 3h2l.4 2M7 13h10l4-8H5.4M7 13L5.4 5M7 13l-2.293 2.293c-.63.63-.184 1.707.707 1.707H17m0 0a2 2 0 100 4 2 2 0 000-4zm-8 2a2 2 0 11-4 0 2 2 0 014 0z',
  image: 'M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z',
  backspace: 'M12 14l2-2m0 0l2-2m-2 2l-2-2m2 2l2 2M3 12l6.414 6.414a2 2 0 001.414.586H19a2 2 0 002-2V7a2 2 0 00-2-2h-8.172a2 2 0 00-1.414.586L3 12z',
  mail: 'M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z',
  'map-pin': [
    'M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z',
    'M15 11a3 3 0 11-6 0 3 3 0 016 0z'
  ],
  user: 'M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z',
  code: 'M10 20l4-16m4 4l4 4-4 4M6 16l-4-4 4-4',
  desktop: 'M9.75 17L9 20l-1 1h8l-1-1-.75-3M3 13h18M5 17h14a2 2 0 002-2V5a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z',
  bell: 'M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9',
  database: 'M4 7v10c0 2.21 3.582 4 8 4s8-1.79 8-4V7M4 7c0 2.21 3.582 4 8 4s8-1.79 8-4M4 7c0-2.21 3.582-4 8-4s8 1.79 8 4m0 5c0 2.21-3.582 4-8 4s-8-1.79-8-4',
  download: 'M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4',
  share: 'M8.684 13.342C8.886 12.938 9 12.482 9 12c0-.482-.114-.938-.316-1.342m0 2.684a3 3 0 110-2.684m0 2.684l6.632 3.316m-6.632-6l6.632-3.316m0 0a3 3 0 105.367-2.684 3 3 0 00-5.367 2.684zm0 9.316a3 3 0 105.368 2.684 3 3 0 00-5.368-2.684z',
  printer: 'M17 17h2a2 2 0 002-2v-4a2 2 0 00-2-2H5a2 2 0 00-2 2v4a2 2 0 002 2h2m2 4h6a2 2 0 002-2v-4a2 2 0 00-2-2H9a2 2 0 00-2 2v4a2 2 0 002 2zm8-12V5a2 2 0 00-2-2H9a2 2 0 00-2 2v4h10z',
  eye: [
    'M15 12a3 3 0 11-6 0 3 3 0 016 0z',
    'M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z'
  ],
  'eye-off': 'M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.88 9.88l-3.29-3.29m7.532 7.532l3.29 3.29M3 3l3.588 3.59m0 0A9.953 9.953 0 0112 5c4.478 0 8.268 2.943 9.543 7a10.025 10.025 0 01-4.132 5.411m0 0L21 21'
}
```

- [ ] **Step 5: Create `components/AppIcon.vue`**

```vue
<template>
  <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2" aria-hidden="true">
    <path v-for="(d, index) in paths" :key="index" stroke-linecap="round" stroke-linejoin="round" :d="d" />
  </svg>
</template>

<script setup>
import { computed } from 'vue'
import { ICONS } from '~/utils/icons'

const props = defineProps({
  name: { type: String, required: true }
})

const paths = computed(() => {
  const icon = ICONS[props.name]
  // Fail loudly so a typo breaks the page-render tests instead of shipping a blank icon
  if (!icon) throw new Error(`Unknown icon: ${props.name}`)
  return Array.isArray(icon) ? icon : [icon]
})
</script>
```

- [ ] **Step 6: Create `utils/navigation.js`**

```js
export const NAV_ITEMS = [
  { to: '/', label: 'Dashboard', shortLabel: 'Home', icon: 'home' },
  { to: '/catalog', label: 'Catalog', shortLabel: 'Catalog', icon: 'bag' },
  { to: '/business-card', label: 'Business Card', shortLabel: 'Card', icon: 'id-card' },
  { to: '/reports', label: 'Reports', shortLabel: 'Reports', icon: 'chart' },
  { to: '/settings', label: 'Settings', shortLabel: 'Settings', icon: 'cog' }
]

export const isActivePath = (path, to) =>
  to === '/' ? path === '/' : path === to || path.startsWith(`${to}/`)
```

- [ ] **Step 7: Create `components/AppBottomNav.vue`**

```vue
<template>
  <nav class="fixed inset-x-0 bottom-0 z-40 border-t border-line bg-card pb-safe md:hidden print:hidden" aria-label="Primary">
    <ul class="grid grid-cols-5">
      <li v-for="item in NAV_ITEMS" :key="item.to">
        <NuxtLink
          :to="item.to"
          :aria-label="item.label"
          class="flex h-16 flex-col items-center justify-center gap-1 text-[11px] font-medium transition-colors"
          :class="isActivePath($route.path, item.to) ? 'text-accent' : 'text-ink-muted'"
        >
          <AppIcon :name="item.icon" class="h-6 w-6" />
          {{ item.shortLabel }}
        </NuxtLink>
      </li>
    </ul>
  </nav>
</template>

<script setup>
import { NAV_ITEMS, isActivePath } from '~/utils/navigation'
</script>
```

- [ ] **Step 8: Create `components/AppSideNav.vue`**

```vue
<template>
  <nav class="fixed inset-y-0 left-0 z-30 hidden w-20 flex-col border-r border-line bg-card md:flex lg:w-60 print:hidden" aria-label="Primary">
    <div class="flex h-14 items-center justify-center border-b border-line px-4 lg:justify-start">
      <span class="text-base font-semibold text-accent lg:hidden" aria-hidden="true">BT</span>
      <span class="hidden text-base font-semibold text-ink lg:inline">Budget Tracker</span>
    </div>
    <ul class="flex-1 space-y-1 p-3">
      <li v-for="item in NAV_ITEMS" :key="item.to">
        <NuxtLink
          :to="item.to"
          :aria-label="item.label"
          :title="item.label"
          class="flex min-h-[44px] items-center justify-center gap-3 rounded-lg px-3 text-sm font-medium transition-colors lg:justify-start"
          :class="isActivePath($route.path, item.to) ? 'bg-accent/10 text-accent' : 'text-ink-muted hover:bg-muted hover:text-ink'"
        >
          <AppIcon :name="item.icon" class="h-5 w-5 shrink-0" />
          <span class="hidden lg:inline">{{ item.label }}</span>
        </NuxtLink>
      </li>
    </ul>
  </nav>
</template>

<script setup>
import { NAV_ITEMS, isActivePath } from '~/utils/navigation'
</script>
```

- [ ] **Step 9: Create `components/AppTopBar.vue`**

```vue
<template>
  <header class="sticky top-0 z-30 border-b border-line bg-card pt-safe print:hidden">
    <div class="mx-auto flex h-14 max-w-6xl items-center justify-between gap-3 px-4 md:px-6">
      <div class="flex min-w-0 items-baseline gap-2">
        <span class="text-base font-semibold text-ink md:hidden">Budget Tracker</span>
        <span v-if="accountSettings.displayName" class="hidden truncate text-sm text-ink-muted sm:inline">
          {{ accountSettings.displayName }}
        </span>
      </div>
      <p
        v-if="displaySettings.showHeaderBalance"
        class="shrink-0 text-sm font-semibold tabular-nums"
        :class="earnings >= 0 ? 'text-income' : 'text-expense'"
        data-testid="header-balance"
      >
        <span class="sr-only">Current balance: </span>{{ formatCurrency(earnings, displaySettings.currencyFormat) }}
      </p>
    </div>
  </header>
</template>

<script setup>
import { useTransactions } from '~/composables/useTransactions'
import { useAppSettings } from '~/composables/useAppSettings'
import { formatCurrency } from '~/utils/currency'

const { earnings } = useTransactions()
const { accountSettings, displaySettings } = useAppSettings()
</script>
```

- [ ] **Step 10: Create `composables/useToast.js`**

```js
import { ref } from 'vue'

const toasts = ref([])
let nextId = 1

export const useToast = () => {
  const dismiss = (id) => {
    toasts.value = toasts.value.filter(item => item.id !== id)
  }

  const toast = (message, { tone = 'success', duration = 4000 } = {}) => {
    const id = nextId++
    toasts.value = [...toasts.value, { id, message, tone }]
    if (duration > 0) setTimeout(() => dismiss(id), duration)
    return id
  }

  return { toasts, toast, dismiss }
}
```

- [ ] **Step 11: Create `components/ToastHost.vue`**

```vue
<template>
  <!-- Top of the screen on phones keeps toasts clear of the add button and cart bar -->
  <div
    class="pointer-events-none fixed inset-x-4 top-[calc(4rem+env(safe-area-inset-top))] z-[60] flex flex-col items-center gap-2 md:inset-x-auto md:bottom-6 md:right-6 md:top-auto md:items-end print:hidden"
    aria-live="polite"
  >
    <slot />
    <TransitionGroup name="toast">
      <div
        v-for="item in toasts"
        :key="item.id"
        role="status"
        class="pointer-events-auto flex w-full max-w-sm items-start gap-3 rounded-xl border border-line bg-card py-2 pl-4 pr-1 text-sm text-ink shadow-lg"
      >
        <AppIcon :name="item.tone === 'success' ? 'check' : 'exclamation'" class="mt-2.5 h-5 w-5 shrink-0" :class="TONE_CLASS[item.tone]" />
        <p class="flex-1 py-2">{{ item.message }}</p>
        <button
          type="button"
          class="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg text-ink-muted hover:bg-muted"
          aria-label="Dismiss"
          @click="dismiss(item.id)"
        >
          <AppIcon name="x" class="h-4 w-4" />
        </button>
      </div>
    </TransitionGroup>
  </div>
</template>

<script setup>
import { useToast } from '~/composables/useToast'

const TONE_CLASS = {
  success: 'text-income',
  warning: 'text-amber-500',
  error: 'text-expense'
}

const { toasts, dismiss } = useToast()
</script>
```

- [ ] **Step 12: Restyle `components/PWAInstall.vue`**

Replace only the `<template>` block. The script is unchanged:

```vue
<template>
  <div v-if="updateAvailable || (isInstallable && !isInstalled)" class="pointer-events-auto flex w-full max-w-sm flex-col gap-2">
    <div v-if="updateAvailable" class="rounded-xl border border-line bg-card p-4 shadow-lg">
      <h3 class="text-sm font-semibold text-ink">Update Available</h3>
      <p class="mb-3 text-sm text-ink-muted">A new version of the app is available.</p>
      <button type="button" class="btn btn-primary" @click="updateApp">Update Now</button>
    </div>

    <div v-if="isInstallable && !isInstalled" class="rounded-xl border border-line bg-card p-4 shadow-lg">
      <h3 class="text-sm font-semibold text-ink">Install App</h3>
      <p class="mb-3 text-sm text-ink-muted">Install this app on your device for a better experience.</p>
      <div class="flex gap-2">
        <button type="button" class="btn btn-primary" @click="installApp">Install</button>
        <button type="button" class="btn btn-ghost" @click="dismissInstall">Not Now</button>
      </div>
    </div>
  </div>
</template>
```

- [ ] **Step 13: Rewrite `app.vue`**

```vue
<template>
  <div class="min-h-screen">
    <AppSideNav />
    <div class="md:pl-20 lg:pl-60">
      <AppTopBar />
      <main class="mx-auto max-w-6xl px-4 pb-nav pt-4 md:px-6 md:pb-10 md:pt-6">
        <NuxtPage />
      </main>
    </div>
    <AppBottomNav />
    <ToastHost>
      <PWAInstall />
    </ToastHost>
  </div>
</template>

<script setup>
import { computed, onMounted, watch } from 'vue'
import { useAppSettings } from '~/composables/useAppSettings'

const { displaySettings } = useAppSettings()
const isDark = computed(() => !!displaySettings.value.darkMode)

useHead({
  meta: [{ name: 'theme-color', content: computed(() => (isDark.value ? '#111827' : '#ffffff')) }]
})

onMounted(() => {
  // useAppSettings loads stored settings in its own onMounted, registered before this one
  watch(isDark, dark => document.documentElement.classList.toggle('dark', dark), { immediate: true })
  document.documentElement.dataset.hydrated = ''
})
</script>
```

- [ ] **Step 14: Run tests to verify they pass**

Run: `npx playwright test tests/e2e/shell.spec.js tests/e2e/navigation.spec.js tests/e2e/theme.spec.js`
Expected: all pass on both projects (the tap-target test is skipped on chromium).

Run: `npx playwright test --project=chromium`
Expected: all pass. The catalog page still has its old fixed sidebar, which now sits under the side rail on desktop. That is expected until Task 4, and its tests still pass.

- [ ] **Step 15: Commit**

```bash
git add utils/icons.js utils/navigation.js components/AppIcon.vue components/AppTopBar.vue components/AppBottomNav.vue components/AppSideNav.vue components/ToastHost.vue components/PWAInstall.vue composables/useToast.js app.vue tests/e2e/fixtures.js tests/e2e/shell.spec.js playwright.config.js
git commit -m "Replace hamburger menu with tab bar and side rail shell"
```

---

### Task 3: Shared kit and Dashboard

**Files:**
- Create: `composables/useMediaQuery.js`
- Create: `components/PageHeader.vue`, `BaseCard.vue`, `BaseButton.vue`, `SegmentedControl.vue`, `BottomSheet.vue`, `ListRow.vue`
- Create: `components/TransactionForm.vue`, `components/NetworkBanner.vue`
- Modify: `pages/index.vue` (full rewrite)
- Modify: `tests/e2e/fixtures.js` (add `openTransactionForm`)
- Modify: `tests/e2e/transactions.spec.js`
- Modify: `playwright.config.js` (`testMatch`)
- Test: `tests/e2e/dashboard.spec.js` (create)

**Interfaces:**
- Consumes: `AppIcon`, `useToast`, `gotoReady`, and the tokens and classes from Tasks 1–2.
- Produces:
  - `useMediaQuery(query: string): Ref<boolean>`. It is `false` during SSR and until mount.
  - `<PageHeader title subtitle?>` with an `#actions` slot. It renders an `<h1>`.
  - `<BaseCard title? subtitle? icon? flush?>` with `#actions` and default slots. The title renders as an `<h2>`. `flush` removes body padding so lists can touch the edges.
  - `<BaseButton variant="primary|secondary|ghost|danger" size="md|lg" block? icon? loading? type="button|submit" disabled?>`.
  - `<SegmentedControl v-model label options>`, where `options` is `Array<{ value, label, activeClass? }>`. It renders `role="radiogroup"` with `role="radio"` buttons.
  - `<BottomSheet v-model:open title>` with a default slot. It renders `role="dialog"` named by its title, teleported to `#teleports`. While open it locks `body` scroll and restores it on close or unmount. Escape, the backdrop (`data-testid="sheet-backdrop"`) and the close button all emit `update:open` = false.
  - `<ListRow title subtitle? icon? iconClass? clickable?>` with a `#trailing` slot. `clickable` renders a `<button>` with a chevron.
  - `<TransactionForm @saved>`.
  - `<NetworkBanner>`.
  - Test helper `openTransactionForm(page)`.

- [ ] **Step 1: Add the `openTransactionForm` helper**

Append to `tests/e2e/fixtures.js`:

```js
// Below lg the add-transaction form lives in a bottom sheet behind the floating + button
export async function openTransactionForm (page) {
  if (page.viewportSize().width < 1024) {
    await page.getByRole('button', { name: 'Add transaction', exact: true }).click()
  }
}
```

- [ ] **Step 2: Write the failing tests**

Create `tests/e2e/dashboard.spec.js`:

```js
import { test, expect, gotoReady, openTransactionForm } from './fixtures.js'

const bodyOverflow = page => page.evaluate(() => document.body.style.overflow)

test.describe('dashboard on phones', () => {
  test.beforeEach(({ isMobile }) => {
    test.skip(!isMobile, 'Phone layout only')
  })

  test('add button opens the transaction sheet and Escape closes it', async ({ page }) => {
    await gotoReady(page, '/')
    await openTransactionForm(page)
    const sheet = page.getByRole('dialog', { name: 'Add Transaction' })
    await expect(sheet).toBeVisible()
    await expect.poll(() => bodyOverflow(page)).toBe('hidden')

    await page.keyboard.press('Escape')
    await expect(sheet).toHaveCount(0)
    await expect.poll(() => bodyOverflow(page)).toBe('')
  })

  test('tapping the backdrop closes the sheet', async ({ page }) => {
    await gotoReady(page, '/')
    await openTransactionForm(page)
    await page.getByTestId('sheet-backdrop').click({ position: { x: 20, y: 20 } })
    await expect(page.getByRole('dialog')).toHaveCount(0)
  })

  test('saving closes the sheet and lists the transaction', async ({ page, api }) => {
    await api.mockTransactions()
    await gotoReady(page, '/')
    await openTransactionForm(page)
    await page.getByPlaceholder('What is this transaction for?').fill('Market sale')
    await page.getByPlaceholder('0.00').fill('25')
    await page.getByRole('button', { name: 'Add to Balance' }).click()

    await expect(page.getByRole('dialog')).toHaveCount(0)
    await expect(page.getByText('Market sale')).toBeVisible()
  })

  test('leaving the page with the sheet open unlocks scrolling', async ({ page }) => {
    await gotoReady(page, '/business-card')
    await page.getByRole('navigation', { name: 'Primary' }).getByRole('link', { name: 'Dashboard', exact: true }).click()
    await page.waitForURL(url => url.pathname === '/')
    await openTransactionForm(page)
    await expect.poll(() => bodyOverflow(page)).toBe('hidden')

    await page.goBack()
    await page.waitForURL(url => url.pathname === '/business-card')
    await expect.poll(() => bodyOverflow(page)).toBe('')
  })

  test('growing past the desktop breakpoint swaps the sheet for the inline form', async ({ page }) => {
    await gotoReady(page, '/')
    await openTransactionForm(page)
    await page.setViewportSize({ width: 1280, height: 800 })

    await expect(page.getByRole('dialog')).toHaveCount(0)
    await expect(page.getByRole('button', { name: 'Add to Balance' })).toHaveCount(1)
    await expect.poll(() => bodyOverflow(page)).toBe('')
  })
})

test('desktop shows the form inline without a floating button', async ({ page, isMobile }) => {
  test.skip(isMobile, 'Desktop layout only')
  await gotoReady(page, '/')
  await expect(page.getByRole('button', { name: 'Add to Balance' })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Add transaction', exact: true })).toHaveCount(0)
})

test('keypad decimal point works after typing digits', async ({ page }) => {
  await gotoReady(page, '/')
  await openTransactionForm(page)
  const amount = page.getByPlaceholder('0.00')
  await amount.fill('12')
  await page.getByRole('button', { name: '.', exact: true }).click()
  await page.getByRole('button', { name: '5', exact: true }).click()
  await expect(amount).toHaveValue('12.5')
})
```

Update `tests/e2e/transactions.spec.js`:
1. Change the import line to `import { test, expect, gotoReady, openTransactionForm } from './fixtures.js'`.
2. In every test, replace `await page.goto('/')` with:

```js
    await gotoReady(page, '/')
    await openTransactionForm(page)
```

3. In `adds an income transaction and syncs it to the API`, insert `await openTransactionForm(page)` directly above the comment `// Form resets after a successful add`. On phones the sheet closes after saving.

Add `transactions|dashboard` to the mobile `testMatch`: `/(theme|shell|navigation|transactions|dashboard)\.spec\.js$/`.

- [ ] **Step 3: Run tests to verify they fail**

Run: `npx playwright test tests/e2e/dashboard.spec.js tests/e2e/transactions.spec.js`
Expected: FAIL. On mobile there is no `Add transaction` button. On desktop, the keypad test fails because the `.` key throws `transactionAmount.value.includes is not a function` (the number input holds a number).

- [ ] **Step 4: Create `composables/useMediaQuery.js`**

```js
import { ref, onMounted, onBeforeUnmount } from 'vue'

// false during SSR and hydration, so server and first client render agree (compact layout)
export const useMediaQuery = (query) => {
  const matches = ref(false)
  let mediaQueryList = null
  const update = () => { matches.value = mediaQueryList.matches }

  onMounted(() => {
    mediaQueryList = window.matchMedia(query)
    update()
    mediaQueryList.addEventListener('change', update)
  })

  onBeforeUnmount(() => {
    mediaQueryList?.removeEventListener('change', update)
  })

  return matches
}
```

- [ ] **Step 5: Create the kit components**

`components/PageHeader.vue`:

```vue
<template>
  <div class="mb-4 flex items-start justify-between gap-3 md:mb-6">
    <div class="min-w-0">
      <h1 class="text-xl font-semibold text-ink">{{ title }}</h1>
      <p v-if="subtitle" class="mt-0.5 text-sm text-ink-muted">{{ subtitle }}</p>
    </div>
    <div v-if="$slots.actions" class="flex shrink-0 items-center gap-2">
      <slot name="actions" />
    </div>
  </div>
</template>

<script setup>
defineProps({
  title: { type: String, required: true },
  subtitle: { type: String, default: '' }
})
</script>
```

`components/BaseCard.vue`:

```vue
<template>
  <section class="card overflow-hidden">
    <header v-if="title" class="flex items-center gap-3 px-4 pt-4 md:px-5 md:pt-5">
      <AppIcon v-if="icon" :name="icon" class="h-5 w-5 shrink-0 text-ink-muted" />
      <div class="min-w-0 flex-1">
        <h2 class="text-base font-semibold text-ink">{{ title }}</h2>
        <p v-if="subtitle" class="text-xs text-ink-muted">{{ subtitle }}</p>
      </div>
      <slot name="actions" />
    </header>
    <div :class="flush ? 'pt-2' : 'p-4 md:p-5'">
      <slot />
    </div>
  </section>
</template>

<script setup>
defineProps({
  title: { type: String, default: '' },
  subtitle: { type: String, default: '' },
  icon: { type: String, default: '' },
  flush: { type: Boolean, default: false }
})
</script>
```

`components/BaseButton.vue`:

```vue
<template>
  <button
    :type="type"
    :disabled="disabled || loading"
    class="btn"
    :class="[`btn-${variant}`, { 'btn-lg': size === 'lg', 'w-full': block }]"
  >
    <span v-if="loading" class="h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent" aria-hidden="true" />
    <AppIcon v-else-if="icon" :name="icon" class="h-4 w-4" />
    <slot />
  </button>
</template>

<script setup>
defineProps({
  variant: { type: String, default: 'primary' },
  size: { type: String, default: 'md' },
  type: { type: String, default: 'button' },
  icon: { type: String, default: '' },
  block: { type: Boolean, default: false },
  loading: { type: Boolean, default: false },
  disabled: { type: Boolean, default: false }
})
</script>
```

`components/SegmentedControl.vue`:

```vue
<template>
  <div
    role="radiogroup"
    :aria-label="label"
    class="grid gap-1 rounded-lg bg-muted p-1"
    :style="{ gridTemplateColumns: `repeat(${options.length}, minmax(0, 1fr))` }"
  >
    <button
      v-for="option in options"
      :key="option.value"
      type="button"
      role="radio"
      :aria-checked="modelValue === option.value"
      class="min-h-[44px] truncate rounded-md px-2 text-sm font-medium transition-colors"
      :class="modelValue === option.value ? ['bg-card shadow-sm', option.activeClass || 'text-ink'] : 'text-ink-muted hover:text-ink'"
      @click="$emit('update:modelValue', option.value)"
    >
      {{ option.label }}
    </button>
  </div>
</template>

<script setup>
defineProps({
  modelValue: { type: [String, Number], required: true },
  label: { type: String, required: true },
  options: { type: Array, required: true }
})
defineEmits(['update:modelValue'])
</script>
```

`components/BottomSheet.vue`:

```vue
<template>
  <!-- Nuxt only server-renders teleports into #teleports -->
  <Teleport to="#teleports">
    <Transition name="sheet">
      <div v-if="open" class="fixed inset-0 z-50 flex items-end justify-center md:items-center md:p-6">
        <div class="absolute inset-0 bg-black/40" aria-hidden="true" data-testid="sheet-backdrop" @click="close" />
        <div
          ref="panel"
          role="dialog"
          aria-modal="true"
          :aria-labelledby="titleId"
          tabindex="-1"
          class="sheet-panel relative flex max-h-[90dvh] w-full flex-col rounded-t-2xl bg-card pb-safe shadow-xl focus:outline-none md:max-w-lg md:rounded-2xl md:pb-0"
        >
          <div class="flex justify-center pt-2 md:hidden" aria-hidden="true">
            <span class="h-1.5 w-10 rounded-full bg-line" />
          </div>
          <div class="flex items-center justify-between px-4 py-1 md:px-6 md:pt-4">
            <h2 :id="titleId" class="text-base font-semibold text-ink">{{ title }}</h2>
            <button
              type="button"
              class="-mr-2 flex h-11 w-11 items-center justify-center rounded-lg text-ink-muted hover:bg-muted"
              aria-label="Close"
              @click="close"
            >
              <AppIcon name="x" class="h-5 w-5" />
            </button>
          </div>
          <div class="overflow-y-auto px-4 pb-4 md:px-6 md:pb-6">
            <slot />
          </div>
        </div>
      </div>
    </Transition>
  </Teleport>
</template>

<script setup>
import { ref, watch, nextTick, onBeforeUnmount, useId } from 'vue'

const props = defineProps({
  open: { type: Boolean, default: false },
  title: { type: String, required: true }
})
const emit = defineEmits(['update:open'])

const panel = ref(null)
const titleId = useId()
let previouslyFocused = null

const close = () => emit('update:open', false)

const FOCUSABLE = 'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled])'

const onKeydown = (event) => {
  if (event.key === 'Escape') {
    close()
    return
  }
  if (event.key !== 'Tab' || !panel.value) return
  const focusable = [...panel.value.querySelectorAll(FOCUSABLE)]
  if (!focusable.length) return
  const first = focusable[0]
  const last = focusable[focusable.length - 1]
  if (event.shiftKey && document.activeElement === first) {
    event.preventDefault()
    last.focus()
  } else if (!event.shiftKey && document.activeElement === last) {
    event.preventDefault()
    first.focus()
  }
}

const release = () => {
  document.body.style.overflow = ''
  document.removeEventListener('keydown', onKeydown)
}

watch(() => props.open, async (isOpen) => {
  if (isOpen) {
    previouslyFocused = document.activeElement
    document.body.style.overflow = 'hidden'
    document.addEventListener('keydown', onKeydown)
    await nextTick()
    panel.value?.focus()
  } else {
    release()
    previouslyFocused?.focus?.()
  }
})

// Route changes and breakpoint swaps unmount an open sheet without closing it first
onBeforeUnmount(release)
</script>
```

`components/ListRow.vue`:

```vue
<template>
  <component
    :is="clickable ? 'button' : 'div'"
    :type="clickable ? 'button' : undefined"
    class="flex min-h-[56px] w-full items-center gap-3 px-4 py-3 text-left md:px-5"
    :class="{ 'transition-colors hover:bg-muted focus:outline-none focus-visible:bg-muted': clickable }"
  >
    <div v-if="icon" class="flex h-10 w-10 shrink-0 items-center justify-center rounded-full" :class="iconClass">
      <AppIcon :name="icon" class="h-5 w-5" />
    </div>
    <div class="min-w-0 flex-1">
      <p class="truncate text-sm font-medium text-ink">{{ title }}</p>
      <p v-if="subtitle" class="truncate text-xs text-ink-muted">{{ subtitle }}</p>
    </div>
    <slot name="trailing" />
    <AppIcon v-if="clickable" name="chevron-right" class="h-4 w-4 shrink-0 text-ink-muted" />
  </component>
</template>

<script setup>
defineProps({
  title: { type: String, required: true },
  subtitle: { type: String, default: '' },
  icon: { type: String, default: '' },
  iconClass: { type: String, default: 'bg-muted text-ink-muted' },
  clickable: { type: Boolean, default: false }
})
</script>
```

- [ ] **Step 6: Create `components/TransactionForm.vue`**

```vue
<template>
  <form class="space-y-4" novalidate @submit.prevent="handleSubmit">
    <SegmentedControl v-model="transactionType" label="Transaction type" :options="TYPE_OPTIONS" />

    <p v-if="error" role="alert" class="rounded-lg bg-expense/10 px-3 py-2 text-sm text-expense">{{ error }}</p>

    <div>
      <label for="tx-description" class="label">Description</label>
      <input
        id="tx-description"
        v-model="transactionDescription"
        type="text"
        class="input"
        placeholder="What is this transaction for?"
        autocomplete="off"
      >
    </div>

    <div>
      <label for="tx-amount" class="label">Amount</label>
      <div class="relative">
        <span class="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-ink-muted">€</span>
        <!-- Text + inputmode keeps "12." intact for the keypad and accepts a decimal comma -->
        <input
          id="tx-amount"
          v-model="transactionAmount"
          type="text"
          inputmode="decimal"
          class="input pl-8 text-lg font-semibold tabular-nums"
          placeholder="0.00"
          autocomplete="off"
        >
      </div>
    </div>

    <div class="grid grid-cols-3 gap-2" role="group" aria-label="Keypad">
      <button
        v-for="key in KEYPAD"
        :key="key"
        type="button"
        class="flex h-12 items-center justify-center rounded-lg bg-muted text-lg font-semibold text-ink active:bg-line"
        :aria-label="key === 'back' ? 'Delete last digit' : undefined"
        @click="pressKey(key)"
      >
        <AppIcon v-if="key === 'back'" name="backspace" class="h-5 w-5" />
        <template v-else>{{ key }}</template>
      </button>
    </div>

    <div>
      <label for="tx-notes" class="label">Notes <span class="font-normal text-ink-muted">(optional)</span></label>
      <textarea
        id="tx-notes"
        v-model="transactionNotes"
        rows="2"
        class="input py-2"
        placeholder="Additional details about this transaction..."
      />
    </div>

    <BaseButton type="submit" size="lg" block :loading="isLoading">
      {{ isLoading ? 'Saving...' : 'Add to Balance' }}
    </BaseButton>
  </form>
</template>

<script setup>
import { ref, watch, onBeforeUnmount } from 'vue'
import { useTransactions } from '~/composables/useTransactions'

const emit = defineEmits(['saved'])

const TYPE_OPTIONS = [
  { value: 'income', label: 'Income', activeClass: 'text-income' },
  { value: 'expense', label: 'Expense', activeClass: 'text-expense' }
]
const KEYPAD = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '.', '0', 'back']

const { addTransaction, isLoading } = useTransactions()

const transactionType = ref('income')
const transactionDescription = ref('')
const transactionAmount = ref('')
const transactionNotes = ref('')
const error = ref('')
let errorTimer = null

// Auto-dismiss validation errors after 5 seconds
watch(error, (message) => {
  clearTimeout(errorTimer)
  if (message) errorTimer = setTimeout(() => { error.value = '' }, 5000)
})
onBeforeUnmount(() => clearTimeout(errorTimer))

const pressKey = (key) => {
  const current = String(transactionAmount.value ?? '')
  if (key === 'back') {
    transactionAmount.value = current.slice(0, -1)
  } else if (key === '.') {
    if (!current.includes('.')) transactionAmount.value = `${current || '0'}.`
  } else {
    transactionAmount.value = `${current}${key}`.replace(/^0+(?=\d)/, '')
  }
}

const parseAmount = value => Number(String(value).trim().replace(',', '.'))

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

  // addTransaction saves locally first and never throws; API failures surface via apiError
  await addTransaction({
    id: Date.now(),
    description: transactionDescription.value.trim(),
    amount: transactionType.value === 'expense' ? -amount : amount,
    date: new Date().toISOString().split('T')[0],
    notes: transactionNotes.value
  })

  transactionDescription.value = ''
  transactionAmount.value = ''
  transactionNotes.value = ''
  emit('saved')
}
</script>
```

- [ ] **Step 7: Create `components/NetworkBanner.vue`**

```vue
<template>
  <div
    v-if="!syncStatus.isOnline || pendingTransactions.length"
    class="flex items-center gap-3 rounded-xl border border-line bg-card px-4 py-2"
    role="status"
  >
    <span class="h-2.5 w-2.5 shrink-0 rounded-full" :class="syncStatus.isOnline ? 'bg-income' : 'bg-expense'" />
    <div class="min-w-0 flex-1 py-1">
      <p class="text-sm font-medium text-ink">{{ syncStatus.isOnline ? 'Online' : 'Offline' }}</p>
      <p class="truncate text-xs text-ink-muted">{{ syncStatus.isOnline ? 'Connected to server' : 'Working in offline mode' }}</p>
    </div>
    <span v-if="pendingTransactions.length" class="shrink-0 rounded-full bg-amber-500/15 px-2.5 py-1 text-xs font-medium text-amber-700 dark:text-amber-300">
      {{ pendingTransactions.length }} pending
    </span>
    <BaseButton
      v-if="syncStatus.isOnline && pendingTransactions.length"
      variant="secondary"
      icon="refresh"
      :loading="queueSyncStatus === 'syncing'"
      @click="syncTransactionsQueue"
    >
      {{ queueSyncStatus === 'syncing' ? 'Syncing...' : 'Sync now' }}
    </BaseButton>
  </div>
</template>

<script setup>
import { useTransactions } from '~/composables/useTransactions'

const { syncStatus, pendingTransactions, syncTransactionsQueue, queueSyncStatus } = useTransactions()
</script>
```

- [ ] **Step 8: Rewrite `pages/index.vue`**

```vue
<template>
  <div class="pb-20 lg:pb-0">
    <PageHeader title="Dashboard" />
    <NetworkBanner class="mb-4" />

    <div class="grid gap-4 lg:grid-cols-[minmax(0,1fr)_24rem] lg:items-start">
      <div class="min-w-0 space-y-4">
        <BaseCard title="Balance Summary" icon="cash">
          <p class="text-xs font-medium uppercase tracking-wide text-ink-muted">Total Balance</p>
          <p class="mt-1 text-3xl font-semibold tabular-nums" :class="moneyClass(earnings)">{{ formatMoney(earnings) }}</p>
          <p class="mt-1 text-sm text-ink-muted">
            Japan Balance (10%)
            <span class="font-semibold tabular-nums" :class="moneyClass(earnings)">{{ formatMoney(earnings * 0.1) }}</span>
          </p>
          <div class="mt-4 grid grid-cols-2 gap-3 border-t border-line pt-4">
            <div class="min-w-0">
              <p class="text-xs text-ink-muted">Today's Total</p>
              <p class="truncate text-lg font-semibold tabular-nums" :class="moneyClass(todayEarnings)">{{ formatMoney(todayEarnings) }}</p>
            </div>
            <div class="min-w-0">
              <p class="text-xs text-ink-muted">Today's Japan (10%)</p>
              <p class="truncate text-lg font-semibold tabular-nums" :class="moneyClass(todayEarnings)">{{ formatMoney(todayEarnings * 0.1) }}</p>
            </div>
          </div>
        </BaseCard>

        <BaseCard title="Recent Transactions" icon="clipboard" flush>
          <template #actions>
            <BaseButton variant="ghost">View All</BaseButton>
          </template>
          <div v-if="sortedTransactions.length === 0" class="px-4 py-10 text-center">
            <p class="text-sm font-medium text-ink">No transactions yet</p>
            <p class="mt-1 text-sm text-ink-muted">
              {{ isDesktop ? 'Use the form to add your first transaction' : 'Tap + to add your first transaction' }}
            </p>
          </div>
          <div v-else class="divide-y divide-line">
            <ListRow
              v-for="transaction in sortedTransactions"
              :key="transaction.id"
              :title="transaction.description"
              :subtitle="transactionSubtitle(transaction)"
              :icon="transaction.amount < 0 ? 'minus' : 'plus'"
              :icon-class="transaction.amount < 0 ? 'bg-expense/10 text-expense' : 'bg-income/10 text-income'"
            >
              <template #trailing>
                <span class="shrink-0 text-sm font-semibold tabular-nums" :class="moneyClass(transaction.amount)">
                  {{ transaction.amount < 0 ? '-' : '+' }}{{ formatMoney(Math.abs(transaction.amount)) }}
                </span>
              </template>
            </ListRow>
          </div>
        </BaseCard>
      </div>

      <BaseCard v-if="isDesktop" title="Add Transaction" icon="plus" class="lg:sticky lg:top-20">
        <TransactionForm />
      </BaseCard>
    </div>

    <template v-if="!isDesktop">
      <button
        type="button"
        aria-label="Add transaction"
        class="fixed right-4 z-30 flex h-14 w-14 items-center justify-center rounded-full bg-accent text-white shadow-lg bottom-above-nav md:bottom-6 md:right-6"
        @click="isFormOpen = true"
      >
        <AppIcon name="plus" class="h-6 w-6" />
      </button>
      <BottomSheet v-model:open="isFormOpen" title="Add Transaction">
        <TransactionForm @saved="isFormOpen = false" />
      </BottomSheet>
    </template>
  </div>
</template>

<script setup>
import { ref, computed, watch } from 'vue'
import { useTransactions } from '~/composables/useTransactions'
import { useAppSettings } from '~/composables/useAppSettings'
import { useMediaQuery } from '~/composables/useMediaQuery'
import { useToast } from '~/composables/useToast'
import { formatCurrency } from '~/utils/currency'
import { formatDate } from '~/utils/date'

const { transactions, earnings, todayEarnings, apiError, clearApiError } = useTransactions()
const { displaySettings } = useAppSettings()
const { toast } = useToast()

const isDesktop = useMediaQuery('(min-width: 1024px)')
const isFormOpen = ref(false)

const formatMoney = amount => formatCurrency(amount, displaySettings.value.currencyFormat || 'EUR')
const moneyClass = amount => (amount < 0 ? 'text-expense' : 'text-income')

// Newest first (ids are creation timestamps)
const sortedTransactions = computed(() => [...transactions.value].sort((a, b) => b.id - a.id))

const transactionSubtitle = transaction =>
  [formatDate(transaction.date, displaySettings.value.dateFormat || 'DD/MM/YYYY'), transaction.notes]
    .filter(Boolean)
    .join(' · ')

// The form may already be closed (phones), so API problems are reported as a toast
watch(apiError, (message) => {
  if (!message) return
  toast(message.includes('saved locally') ? message : `${message} - Transaction saved locally.`, { tone: 'warning', duration: 6000 })
  clearApiError()
})
</script>
```

- [ ] **Step 9: Run tests to verify they pass**

Run: `npx playwright test tests/e2e/dashboard.spec.js tests/e2e/transactions.spec.js tests/e2e/navigation.spec.js`
Expected: all pass on both projects (phone-only and desktop-only tests are skipped on the other project).

Run: `npx playwright test --project=chromium`
Expected: all pass.

- [ ] **Step 10: Commit**

```bash
git add composables/useMediaQuery.js components/PageHeader.vue components/BaseCard.vue components/BaseButton.vue components/SegmentedControl.vue components/BottomSheet.vue components/ListRow.vue components/TransactionForm.vue components/NetworkBanner.vue pages/index.vue tests/e2e/fixtures.js tests/e2e/dashboard.spec.js tests/e2e/transactions.spec.js playwright.config.js
git commit -m "Rebuild dashboard mobile-first with add-transaction sheet"
```

---

### Task 4: Catalog with cart sheet

**Files:**
- Create: `components/QuantityStepper.vue`, `components/CartPanel.vue`
- Modify: `pages/catalog.vue` (full rewrite; product-loading/sorting/favourites script logic is kept as is)
- Modify: `tests/e2e/catalog.spec.js`
- Modify: `playwright.config.js` (`testMatch`)

**Interfaces:**
- Consumes: `useMediaQuery`, `PageHeader`, `BaseCard`, `BaseButton`, `BottomSheet`, `AppIcon`, `useToast`, `gotoReady`.
- Produces:
  - `<QuantityStepper :quantity :name @increment @decrement>`. Its buttons are named `Remove one {name}` and `Add one {name}`, and clicks don't propagate.
  - `<CartPanel :items :total @increment(item) @decrement(item) @remove(item) @submit>`. It shows `{items.length} items`, the total, line items (names as `<p>`, never headings), `Your cart is empty` when empty, and an `Add to Balance` button disabled when empty.

- [ ] **Step 1: Write the failing test**

In `tests/e2e/catalog.spec.js`:
1. Change the import to `import { test, expect, gotoReady } from './fixtures.js'`.
2. Update the comment above `card` to `// The cart repeats product names, so target the catalog card heading`.
3. Make `adds selected products to the balance as one transaction` desktop-only. Change its signature to `async ({ page, api, isMobile }) => {` and add this first line:

```js
    test.skip(isMobile, 'Phones check out through the cart sheet (next test)')
```

4. Append this test inside the `describe` block:

```js
  test('checks out from the cart sheet on phones', async ({ page, api, isMobile }) => {
    test.skip(!isMobile, 'Phone layout only')
    await api.mockCatalog()
    await api.mockTransactions()
    await gotoReady(page, '/catalog')

    const cartBar = page.getByRole('button', { name: /View cart/ })
    await expect(cartBar).toHaveCount(0)

    await card(page, 'Dragon Figure').click()
    await card(page, 'Dragon Figure').click()
    await card(page, 'Phone Stand').click()
    await expect(cartBar).toContainText('2 items')
    await expect(cartBar).toContainText('29,00')

    await cartBar.click()
    const sheet = page.getByRole('dialog', { name: 'Cart' })
    await expect(sheet.getByText('Dragon Figure')).toBeVisible()
    await sheet.getByRole('button', { name: 'Add to Balance' }).click()

    await expect.poll(() => api.posted.length).toBe(1)
    expect(api.posted[0].amount).toBe(29)
    await expect(sheet).toHaveCount(0)
    await expect(cartBar).toHaveCount(0)
    await expect(page.getByText(/Added 29,00/)).toBeVisible()
  })

  test('product cards fit two per row on phones', async ({ page, api, isMobile }) => {
    test.skip(!isMobile, 'Phone layout only')
    await api.mockCatalog()
    await gotoReady(page, '/catalog')
    const first = await card(page, 'Cable Clip').boundingBox()
    const second = await card(page, 'Dragon Figure').boundingBox()
    expect(Math.abs(first.y - second.y)).toBeLessThan(2)
  })
```

Add `catalog` to the mobile `testMatch`: `/(theme|shell|navigation|transactions|dashboard|catalog)\.spec\.js$/`.

- [ ] **Step 2: Run test to verify it fails**

Run: `npx playwright test tests/e2e/catalog.spec.js --project=mobile`
Expected: the two phone tests FAIL (no `View cart` button; the cards are in one column).

- [ ] **Step 3: Create `components/QuantityStepper.vue`**

```vue
<template>
  <div class="flex shrink-0 items-center rounded-lg border border-line bg-card">
    <button
      type="button"
      class="flex h-11 w-11 items-center justify-center text-ink-muted hover:text-ink"
      :aria-label="`Remove one ${name}`"
      @click.stop="$emit('decrement')"
    >
      <AppIcon name="minus" class="h-4 w-4" />
    </button>
    <span class="w-6 text-center text-sm font-semibold tabular-nums text-ink">{{ quantity }}</span>
    <button
      type="button"
      class="flex h-11 w-11 items-center justify-center text-ink-muted hover:text-ink"
      :aria-label="`Add one ${name}`"
      @click.stop="$emit('increment')"
    >
      <AppIcon name="plus" class="h-4 w-4" />
    </button>
  </div>
</template>

<script setup>
defineProps({
  quantity: { type: Number, required: true },
  name: { type: String, required: true }
})
defineEmits(['increment', 'decrement'])
</script>
```

- [ ] **Step 4: Create `components/CartPanel.vue`**

```vue
<template>
  <div class="flex flex-col gap-4">
    <div class="flex items-baseline justify-between gap-3">
      <p class="text-sm text-ink-muted">{{ items.length }} items</p>
      <p class="text-2xl font-semibold tabular-nums text-ink">{{ formatCurrency(total) }}</p>
    </div>

    <ul v-if="items.length" class="divide-y divide-line rounded-lg border border-line">
      <li v-for="item in items" :key="item.id" class="flex items-center gap-2 py-2 pl-3 pr-1">
        <div class="min-w-0 flex-1">
          <p class="truncate text-sm font-medium text-ink">{{ item.name }}</p>
          <p class="truncate text-xs tabular-nums text-ink-muted">
            {{ formatCurrency(item.price) }} each · {{ formatCurrency(item.price * item.quantity) }}
          </p>
        </div>
        <QuantityStepper
          :quantity="item.quantity"
          :name="item.name"
          @increment="$emit('increment', item)"
          @decrement="$emit('decrement', item)"
        />
        <button
          type="button"
          class="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg text-ink-muted hover:bg-muted hover:text-expense"
          :aria-label="`Remove ${item.name}`"
          @click="$emit('remove', item)"
        >
          <AppIcon name="trash" class="h-4 w-4" />
        </button>
      </li>
    </ul>
    <div v-else class="rounded-lg border border-dashed border-line px-4 py-6 text-center">
      <p class="text-sm font-medium text-ink">Your cart is empty</p>
      <p class="mt-1 text-sm text-ink-muted">Select products from the catalog</p>
    </div>

    <BaseButton size="lg" block icon="cash" :disabled="!items.length" @click="$emit('submit')">
      Add to Balance
    </BaseButton>
  </div>
</template>

<script setup>
import { formatCurrency } from '~/utils/currency'

defineProps({
  items: { type: Array, required: true },
  total: { type: Number, required: true }
})
defineEmits(['increment', 'decrement', 'remove', 'submit'])
</script>
```

- [ ] **Step 5: Rewrite `pages/catalog.vue`**

```vue
<template>
  <div :class="{ 'pb-20': !isDesktop && selectedProducts.length }">
    <div class="lg:grid lg:grid-cols-[minmax(0,1fr)_20rem] lg:items-start lg:gap-6">
      <div class="min-w-0">
        <PageHeader title="Product Catalog" subtitle="Browse and select 3D printing products" />

        <div class="mb-4 space-y-3">
          <div class="relative">
            <AppIcon name="search" class="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-muted" />
            <input
              ref="searchInput"
              v-model="searchQuery"
              type="text"
              class="input pl-9"
              placeholder="Search products..."
              aria-label="Search products"
            >
          </div>
          <div class="flex gap-2">
            <select ref="sortSelect" v-model="sortOption" class="input w-auto flex-1 pr-9 sm:flex-none" aria-label="Sort by">
              <option value="name">Sort by Name</option>
              <option value="price">Sort by Price</option>
            </select>
            <button type="button" class="chip chip-idle" @click="sortDirection = sortDirection === 'asc' ? 'desc' : 'asc'">
              <AppIcon name="sort" class="h-4 w-4" />
              {{ sortDirection === 'asc' ? 'A to Z' : 'Z to A' }}
            </button>
          </div>
        </div>

        <div v-if="loading" class="card flex h-48 flex-col items-center justify-center gap-3">
          <span class="h-8 w-8 animate-spin rounded-full border-4 border-muted border-t-accent" aria-hidden="true" />
          <p class="text-sm text-ink-muted">Loading products...</p>
        </div>

        <div v-else-if="error" class="card px-4 py-8 text-center">
          <AppIcon name="exclamation" class="mx-auto mb-3 h-8 w-8 text-expense" />
          <p class="mb-4 text-sm text-expense">{{ error }}</p>
          <BaseButton variant="secondary" icon="refresh" @click="fetchProducts">Try Again</BaseButton>
        </div>

        <div v-else-if="filteredProducts.length === 0" class="card px-4 py-8 text-center">
          <p class="text-sm font-medium text-ink">No products match your search</p>
          <p class="mb-4 mt-1 text-sm text-ink-muted">Try adjusting your search criteria</p>
          <BaseButton variant="secondary" icon="x" @click="searchQuery = ''">Clear Search</BaseButton>
        </div>

        <div v-else class="grid grid-cols-2 gap-3 md:grid-cols-3 md:gap-4 xl:grid-cols-4">
          <article
            v-for="product in filteredProducts"
            :key="product.id"
            class="card flex cursor-pointer flex-col overflow-hidden transition-shadow"
            :class="{ 'ring-2 ring-accent': isSelected(product) }"
            @click="incrementQuantity(product)"
          >
            <div class="relative aspect-square bg-muted">
              <img
                v-if="product.images && product.images.length > 0"
                :src="imageUrl(product)"
                :alt="product.name"
                class="h-full w-full object-cover"
                loading="lazy"
              >
              <div v-else class="flex h-full items-center justify-center text-ink-muted">
                <AppIcon name="image" class="h-10 w-10" />
              </div>
              <span
                v-if="isSelected(product)"
                class="absolute right-2 top-2 flex h-6 min-w-[1.5rem] items-center justify-center rounded-full bg-accent px-1.5 text-xs font-semibold text-white"
              >
                {{ product.quantity }}
              </span>
            </div>
            <div class="flex flex-1 flex-col gap-2 p-3">
              <h3 class="line-clamp-2 break-words text-sm font-semibold text-ink">{{ product.name }}</h3>
              <div class="hidden sm:block">
                <p class="line-clamp-2 text-xs text-ink-muted">{{ product.description }}</p>
              </div>
              <div class="mt-auto flex flex-wrap items-center justify-between gap-2">
                <p class="text-sm font-semibold tabular-nums text-ink">{{ formatCurrency(product.price) }}</p>
                <QuantityStepper
                  v-if="isSelected(product)"
                  :quantity="product.quantity"
                  :name="product.name"
                  @increment="incrementQuantity(product)"
                  @decrement="decrementQuantity(product)"
                />
                <button
                  v-else
                  type="button"
                  class="flex h-11 w-11 items-center justify-center rounded-lg bg-accent/10 text-accent hover:bg-accent/20"
                  :aria-label="`Add ${product.name} to cart`"
                  @click.stop="incrementQuantity(product)"
                >
                  <AppIcon name="plus" class="h-5 w-5" />
                </button>
              </div>
            </div>
          </article>
        </div>
      </div>

      <aside v-if="isDesktop" class="lg:sticky lg:top-20">
        <BaseCard title="Cart" subtitle="Selected products for purchase" icon="cart">
          <CartPanel
            :items="selectedProducts"
            :total="totalAmount"
            @increment="incrementQuantity"
            @decrement="decrementQuantity"
            @remove="removeProduct"
            @submit="submitToBalance"
          />
        </BaseCard>
      </aside>
    </div>

    <template v-if="!isDesktop">
      <button
        v-if="selectedProducts.length && !isCartOpen"
        type="button"
        class="fixed inset-x-4 z-30 flex min-h-[52px] items-center justify-between gap-3 rounded-xl bg-accent px-4 text-white shadow-lg bottom-above-nav md:bottom-6 md:left-auto md:right-6 md:w-80"
        @click="isCartOpen = true"
      >
        <span class="text-sm font-medium">
          {{ selectedProducts.length }} items · <span class="tabular-nums">{{ formatCurrency(totalAmount) }}</span>
        </span>
        <span class="flex items-center gap-1 text-sm font-semibold">
          View cart
          <AppIcon name="chevron-right" class="h-4 w-4" />
        </span>
      </button>
      <BottomSheet v-model:open="isCartOpen" title="Cart">
        <CartPanel
          :items="selectedProducts"
          :total="totalAmount"
          @increment="incrementQuantity"
          @decrement="decrementQuantity"
          @remove="removeProduct"
          @submit="submitToBalance"
        />
      </BottomSheet>
    </template>
  </div>
</template>

<script setup>
import { ref, computed, onMounted, onBeforeUnmount } from 'vue'
import { useTransactions } from '~/composables/useTransactions'
import { useMediaQuery } from '~/composables/useMediaQuery'
import { useToast } from '~/composables/useToast'
import { formatCurrency } from '~/utils/currency'

const products = ref([])
const loading = ref(false)
const error = ref(null)

const isDesktop = useMediaQuery('(min-width: 1024px)')
const isCartOpen = ref(false)
const searchInput = ref(null)
const sortSelect = ref(null)

const fetchProducts = async () => {
  loading.value = true
  error.value = null
  try {
    const response = await fetch('https://pocket.lasseharm.space/api/collections/budget_tracket_catalog/records')
    if (!response.ok) throw new Error('Failed to fetch products')
    const data = await response.json()
    products.value = data.items.map(item => ({
      ...item,
      quantity: 0
    }))
  } catch (err) {
    error.value = err.message
  } finally {
    loading.value = false
  }
}

const imageUrl = product =>
  `https://pocket.lasseharm.space/api/files/${product.collectionId}/${product.id}/${product.images[0]}?thumb=300x300`

const sortOption = ref('name') // 'name', 'price'
const sortDirection = ref('asc') // 'asc', 'desc'
const favorites = ref([])

const toggleFavorite = (product) => {
  const index = favorites.value.findIndex(fav => fav.id === product.id)
  if (index === -1) {
    favorites.value.push(product)
  } else {
    favorites.value.splice(index, 1)
  }
  localStorage.setItem('favorites', JSON.stringify(favorites.value))
}

const isFavorite = (product) => {
  return favorites.value.some(fav => fav.id === product.id)
}

const sortProducts = (products) => {
  return [...products].sort((a, b) => {
    const modifier = sortDirection.value === 'asc' ? 1 : -1
    if (sortOption.value === 'price') {
      return (a.price - b.price) * modifier
    }
    return a.name.localeCompare(b.name) * modifier
  })
}

const searchQuery = ref('')

const filteredProducts = computed(() => {
  let result = products.value
  if (searchQuery.value) {
    const query = searchQuery.value.toLowerCase()
    result = result.filter(product =>
      product.name.toLowerCase().includes(query) ||
      product.description.toLowerCase().includes(query)
    )
  }
  return sortProducts(result)
})

const selectedProducts = computed(() => products.value.filter(p => p.quantity > 0))

const totalAmount = computed(() => {
  return products.value.reduce((sum, product) => sum + (product.price * product.quantity), 0)
})

const isSelected = product => product.quantity > 0

const incrementQuantity = (product) => {
  product.quantity++
}

const decrementQuantity = (product) => {
  if (product.quantity > 0) {
    product.quantity--
  }
}

const removeProduct = (product) => {
  product.quantity = 0
}

const { addTransaction } = useTransactions()
const { toast } = useToast()

const submitToBalance = () => {
  if (selectedProducts.value.length === 0) return

  const total = totalAmount.value
  const productNames = selectedProducts.value
    .map(product => `${product.name} (${formatCurrency(product.price)} × ${product.quantity})`)
    .join('\n')

  addTransaction({
    description: `3D Printing Products:\n${productNames}`,
    amount: total,
    date: new Date().toISOString().split('T')[0]
  })

  // Reset all product quantities to 0
  products.value.forEach(product => { product.quantity = 0 })
  isCartOpen.value = false
  toast(`Added ${formatCurrency(total)} to balance`)
}

// Ctrl/Cmd+F focuses search, Ctrl/Cmd+S focuses sort
const handleKeyboardShortcuts = (event) => {
  if (!(event.ctrlKey || event.metaKey)) return
  if (event.key === 'f') {
    event.preventDefault()
    searchInput.value?.focus()
  } else if (event.key === 's') {
    event.preventDefault()
    sortSelect.value?.focus()
  }
}

onMounted(() => {
  fetchProducts()
  const savedFavorites = localStorage.getItem('favorites')
  if (savedFavorites) {
    favorites.value = JSON.parse(savedFavorites)
  }
  window.addEventListener('keydown', handleKeyboardShortcuts)
})

onBeforeUnmount(() => {
  window.removeEventListener('keydown', handleKeyboardShortcuts)
})
</script>
```

Behavior changes from the old page, all intentional:
- The keyboard listener is now removed on unmount (before, it leaked on every visit).
- `focusFirstProduct` and its `@keyup.enter` are dropped. They targeted `.card`, which was never focusable.

- [ ] **Step 6: Run tests to verify they pass**

Run: `npx playwright test tests/e2e/catalog.spec.js`
Expected: all pass on both projects (phone-only and desktop-only tests are skipped on the other).

Run: `npx playwright test --project=chromium`
Expected: all pass.

- [ ] **Step 7: Commit**

```bash
git add components/QuantityStepper.vue components/CartPanel.vue pages/catalog.vue tests/e2e/catalog.spec.js playwright.config.js
git commit -m "Rebuild catalog with two-column grid and cart sheet"
```

---

### Task 5: Reports

**Files:**
- Modify: `pages/reports.vue` (rewrite the template and remove `<style scoped>`; the sample data in the script is kept)
- Modify: `playwright.config.js` (`testMatch`)
- Test: `tests/e2e/reports.spec.js` (create)

**Interfaces:**
- Consumes: `PageHeader`, `BaseCard`, `BaseButton`, `ListRow`, `AppIcon`, `.chip` classes, `gotoReady`.
- Produces: nothing used later.

- [ ] **Step 1: Write the failing test**

Create `tests/e2e/reports.spec.js`:

```js
import { test, expect, gotoReady } from './fixtures.js'

test.describe('reports', () => {
  test('period chips toggle and custom range reveals date inputs', async ({ page }) => {
    await gotoReady(page, '/reports')
    const periods = page.getByRole('group', { name: 'Time period' })
    await expect(periods.getByRole('button', { name: 'This Month' })).toHaveAttribute('aria-pressed', 'true')

    await periods.getByRole('button', { name: 'Custom Range' }).click()
    await expect(periods.getByRole('button', { name: 'Custom Range' })).toHaveAttribute('aria-pressed', 'true')
    await expect(page.getByLabel('Start Date')).toBeVisible()
    await expect(page.getByLabel('End Date')).toBeVisible()
  })

  test('tables become lists on phones', async ({ page, isMobile }) => {
    await gotoReady(page, '/reports')
    await expect(page.getByRole('table')).toHaveCount(isMobile ? 0 : 2)
    // Both layouts are in the DOM (one display:none), so only assert on the visible copy
    await expect(page.getByText('PLA Filament Purchase').filter({ visible: true })).toHaveCount(1)
  })
})
```

Add `reports` to the mobile `testMatch`: `/(theme|shell|navigation|transactions|dashboard|catalog|reports)\.spec\.js$/`.

- [ ] **Step 2: Run test to verify it fails**

Run: `npx playwright test tests/e2e/reports.spec.js`
Expected: FAIL. There is no group named `Time period` and no `aria-pressed`, and the tables are always rendered.

- [ ] **Step 3: Rewrite the `<template>` of `pages/reports.vue` and delete its `<style scoped>` block**

```vue
<template>
  <div>
    <PageHeader title="Financial Reports" subtitle="Analyze your income and expense trends">
      <template #actions>
        <BaseButton variant="secondary" icon="refresh" aria-label="Refresh Data" @click="refreshData">
          <span class="hidden sm:inline">Refresh Data</span>
        </BaseButton>
      </template>
    </PageHeader>

    <div class="no-scrollbar -mx-4 mb-4 flex gap-2 overflow-x-auto px-4 md:mx-0 md:flex-wrap md:px-0" role="group" aria-label="Time period">
      <button
        v-for="period in timePeriods"
        :key="period.value"
        type="button"
        class="chip"
        :class="selectedPeriod === period.value ? 'chip-active' : 'chip-idle'"
        :aria-pressed="selectedPeriod === period.value"
        @click="selectedPeriod = period.value"
      >
        {{ period.label }}
      </button>
    </div>

    <div v-if="selectedPeriod === 'custom'" class="mb-4 grid gap-3 md:grid-cols-2">
      <div>
        <label for="report-start" class="label">Start Date</label>
        <input id="report-start" v-model="customDateRange.start" type="date" class="input">
      </div>
      <div>
        <label for="report-end" class="label">End Date</label>
        <input id="report-end" v-model="customDateRange.end" type="date" class="input">
      </div>
    </div>

    <div class="mb-4 grid grid-cols-2 gap-3 md:grid-cols-3 md:gap-4">
      <div v-for="kpi in kpis" :key="kpi.label" class="card min-w-0 p-4" :class="{ 'col-span-2 md:col-span-1': kpi.wide }">
        <p class="text-xs font-medium text-ink-muted">{{ kpi.label }}</p>
        <p class="mt-1 truncate text-xl font-semibold tabular-nums md:text-2xl" :class="kpi.valueClass">{{ formatCurrency(kpi.value) }}</p>
        <p class="mt-1 text-xs text-ink-muted">
          <span class="font-medium" :class="(kpi.change >= 0) === kpi.goodWhenUp ? 'text-income' : 'text-expense'">
            {{ kpi.change >= 0 ? '+' : '' }}{{ kpi.change }}%
          </span>
          from previous period
        </p>
      </div>
    </div>

    <div class="mb-4 grid gap-4 lg:grid-cols-2">
      <BaseCard v-for="chart in TREND_CHARTS" :key="chart.title" :title="chart.title" :subtitle="chart.subtitle" :icon="chart.icon">
        <div class="flex h-56 items-center justify-center rounded-lg border border-dashed border-line px-4 text-center text-sm text-ink-muted md:h-72">
          Chart would be displayed here
        </div>
      </BaseCard>
    </div>

    <div class="mb-4 grid gap-4 lg:grid-cols-3">
      <BaseCard title="Expenses by Category" subtitle="Where you spend money" icon="chart">
        <div class="flex h-56 items-center justify-center rounded-lg border border-dashed border-line px-4 text-center text-sm text-ink-muted md:h-72">
          Chart would be displayed here
        </div>
      </BaseCard>

      <BaseCard title="Top Expense Categories" subtitle="Your biggest spending areas" icon="cash" flush class="lg:col-span-2">
        <ul class="divide-y divide-line md:hidden">
          <li v-for="category in topExpenseCategories" :key="category.name" class="px-4 py-3">
            <div class="flex items-center gap-3">
              <span class="h-3 w-3 shrink-0 rounded-full" :class="category.bgColor" />
              <p class="min-w-0 flex-1 truncate text-sm font-medium text-ink">{{ category.name }}</p>
              <p class="text-sm font-semibold tabular-nums text-ink">{{ formatCurrency(Math.abs(category.amount)) }}</p>
            </div>
            <div class="mt-2 flex items-center gap-3 pl-6">
              <div class="h-1.5 flex-1 overflow-hidden rounded-full bg-muted">
                <div class="h-full rounded-full" :class="category.barColor" :style="{ width: `${category.percentage}%` }" />
              </div>
              <span class="w-10 text-right text-xs tabular-nums text-ink-muted">{{ category.percentage }}%</span>
              <span class="w-14 text-right text-xs font-medium tabular-nums" :class="category.change >= 0 ? 'text-expense' : 'text-income'">
                {{ category.change >= 0 ? '+' : '' }}{{ category.change }}%
              </span>
            </div>
          </li>
        </ul>
        <table class="hidden w-full text-sm md:table">
          <thead>
            <tr class="border-b border-line text-left text-xs font-medium uppercase tracking-wide text-ink-muted">
              <th class="px-5 py-2 font-medium">Category</th>
              <th class="px-5 py-2 font-medium">Amount</th>
              <th class="px-5 py-2 font-medium">% of Total</th>
              <th class="px-5 py-2 font-medium">Change</th>
            </tr>
          </thead>
          <tbody class="divide-y divide-line">
            <tr v-for="category in topExpenseCategories" :key="category.name">
              <td class="px-5 py-3">
                <div class="flex items-center gap-3">
                  <span class="h-3 w-3 shrink-0 rounded-full" :class="category.bgColor" />
                  <span class="font-medium text-ink">{{ category.name }}</span>
                </div>
              </td>
              <td class="px-5 py-3 tabular-nums text-ink">{{ formatCurrency(Math.abs(category.amount)) }}</td>
              <td class="px-5 py-3">
                <div class="flex items-center gap-2">
                  <div class="h-1.5 w-24 overflow-hidden rounded-full bg-muted">
                    <div class="h-full rounded-full" :class="category.barColor" :style="{ width: `${category.percentage}%` }" />
                  </div>
                  <span class="tabular-nums text-ink-muted">{{ category.percentage }}%</span>
                </div>
              </td>
              <td class="px-5 py-3 font-medium tabular-nums" :class="category.change >= 0 ? 'text-expense' : 'text-income'">
                {{ category.change >= 0 ? '+' : '' }}{{ category.change }}%
              </td>
            </tr>
          </tbody>
        </table>
      </BaseCard>
    </div>

    <BaseCard title="Recent Transactions" subtitle="For the selected period" icon="clipboard" flush>
      <template #actions>
        <BaseButton variant="ghost" icon="download">Export</BaseButton>
      </template>
      <div class="divide-y divide-line md:hidden">
        <ListRow
          v-for="(transaction, index) in recentTransactions"
          :key="index"
          :title="transaction.description"
          :subtitle="`${formatDate(transaction.date)} · ${transaction.amount >= 0 ? 'Income' : 'Expense'}`"
          :icon="transaction.amount >= 0 ? 'plus' : 'minus'"
          :icon-class="transaction.amount >= 0 ? 'bg-income/10 text-income' : 'bg-expense/10 text-expense'"
        >
          <template #trailing>
            <span class="shrink-0 text-sm font-semibold tabular-nums" :class="transaction.amount >= 0 ? 'text-income' : 'text-expense'">
              {{ transaction.amount >= 0 ? '+' : '' }}{{ formatCurrency(transaction.amount) }}
            </span>
          </template>
        </ListRow>
      </div>
      <table class="hidden w-full text-sm md:table">
        <thead>
          <tr class="border-b border-line text-left text-xs font-medium uppercase tracking-wide text-ink-muted">
            <th class="px-5 py-2 font-medium">Date</th>
            <th class="px-5 py-2 font-medium">Description</th>
            <th class="px-5 py-2 font-medium">Category</th>
            <th class="px-5 py-2 text-right font-medium">Amount</th>
          </tr>
        </thead>
        <tbody class="divide-y divide-line">
          <tr v-for="(transaction, index) in recentTransactions" :key="index">
            <td class="whitespace-nowrap px-5 py-3 text-ink-muted">{{ formatDate(transaction.date) }}</td>
            <td class="px-5 py-3 text-ink">{{ transaction.description }}</td>
            <td class="whitespace-nowrap px-5 py-3">
              <span
                class="rounded-full px-2 py-1 text-xs font-medium"
                :class="transaction.amount >= 0 ? 'bg-income/10 text-income' : 'bg-expense/10 text-expense'"
              >
                {{ transaction.amount >= 0 ? 'Income' : 'Expense' }}
              </span>
            </td>
            <td class="whitespace-nowrap px-5 py-3 text-right font-semibold tabular-nums" :class="transaction.amount >= 0 ? 'text-income' : 'text-expense'">
              {{ transaction.amount >= 0 ? '+' : '' }}{{ formatCurrency(transaction.amount) }}
            </td>
          </tr>
        </tbody>
      </table>
    </BaseCard>
  </div>
</template>
```

- [ ] **Step 4: Add the KPI and chart definitions to the script**

In `pages/reports.vue` `<script setup>`, keep everything that exists. Then:
1. Change the first import to `import { ref, computed } from 'vue'`. It already is, so confirm nothing else is needed.
2. Add the following after the `summaryData` ref:

```js
// KPI tiles; an expense increase is bad news, so its change colours the other way round
const kpis = computed(() => [
  { label: 'Total Income', value: summaryData.value.income, change: summaryData.value.incomePercentChange, goodWhenUp: true, valueClass: 'text-income' },
  { label: 'Total Expenses', value: Math.abs(summaryData.value.expenses), change: summaryData.value.expensesPercentChange, goodWhenUp: false, valueClass: 'text-expense' },
  {
    label: 'Net Balance',
    value: summaryData.value.netBalance,
    change: summaryData.value.netBalancePercentChange,
    goodWhenUp: true,
    valueClass: summaryData.value.netBalance >= 0 ? 'text-income' : 'text-expense',
    wide: true
  }
])

// Placeholders until real charts are built (out of scope for the UI overhaul)
const TREND_CHARTS = [
  { title: 'Income vs Expenses', subtitle: 'Monthly comparison', icon: 'chart' },
  { title: 'Balance Trend', subtitle: 'Over time analysis', icon: 'chart' }
]
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `npx playwright test tests/e2e/reports.spec.js tests/e2e/navigation.spec.js`
Expected: all pass on both projects.

- [ ] **Step 6: Commit**

```bash
git add pages/reports.vue tests/e2e/reports.spec.js playwright.config.js
git commit -m "Rebuild reports with period chips and phone-friendly lists"
```

---

### Task 6: Settings

**Files:**
- Create: `components/ToggleSwitch.vue`
- Modify: `pages/settings.vue` (full rewrite)
- Modify: `playwright.config.js` (`testMatch`)
- Test: `tests/e2e/settings.spec.js` (create)

**Interfaces:**
- Consumes: `useMediaQuery`, `useToast`, `PageHeader`, `BaseCard`, `BaseButton`, `SegmentedControl`, `BottomSheet`, `ListRow`, `AppIcon`, `gotoReady`.
- Produces: `<ToggleSwitch v-model label description? disabled?>`. It renders a `<label>` row (min 44px) containing `role="switch"` with `aria-checked`.

- [ ] **Step 1: Write the failing test**

Create `tests/e2e/settings.spec.js`:

```js
import { test, expect, gotoReady } from './fixtures.js'

const categoryButton = (page, name) => page.getByRole('button', { name: new RegExp(`^${name}`) })

test.describe('settings', () => {
  test('phones drill from the group list into a section and back', async ({ page, isMobile }) => {
    test.skip(!isMobile, 'Phone layout only')
    await gotoReady(page, '/settings')
    await expect(page.getByRole('heading', { name: 'Display Settings' })).toHaveCount(0)

    await categoryButton(page, 'Display Settings').click()
    await expect(page).toHaveURL(/#display$/)
    await expect(page.getByRole('heading', { name: 'Display Settings' })).toBeVisible()
    await expect(categoryButton(page, 'Account Settings')).toHaveCount(0)

    await page.getByRole('button', { name: 'All settings' }).click()
    await expect(categoryButton(page, 'Account Settings')).toBeVisible()
  })

  test('deep link opens a section and back returns to the list', async ({ page, isMobile }) => {
    test.skip(!isMobile, 'Phone layout only')
    await gotoReady(page, '/settings#display')
    await expect(page.getByRole('heading', { name: 'Display Settings' })).toBeVisible()

    await page.getByRole('button', { name: 'All settings' }).click()
    await expect(categoryButton(page, 'Display Settings')).toBeVisible()
    await expect(page).not.toHaveURL(/#display$/)
  })

  test('larger screens show the list and a section side by side', async ({ page, isMobile }) => {
    test.skip(isMobile, 'Desktop layout only')
    await gotoReady(page, '/settings')
    await expect(categoryButton(page, 'Display Settings')).toBeVisible()
    await expect(page.getByRole('heading', { name: 'Account Settings' })).toBeVisible()
  })

  test('dark mode survives saving and reloading', async ({ page }) => {
    await gotoReady(page, '/settings#display')
    const html = page.locator('html')

    await page.getByRole('switch', { name: /Dark Mode/ }).click()
    await expect(html).toHaveClass(/dark/)

    await page.getByRole('button', { name: 'Save Display Settings' }).click()
    await expect(page.getByText('Display settings saved successfully')).toBeVisible()
    await expect(html).toHaveClass(/dark/)

    await page.reload()
    await page.locator('html[data-hydrated]').waitFor({ state: 'attached' })
    await expect(html).toHaveClass(/dark/)
  })

  test('clearing data asks for confirmation in a sheet', async ({ page }) => {
    await gotoReady(page, '/settings#data')
    await page.getByRole('button', { name: 'Clear All Local Data' }).click()
    const dialog = page.getByRole('dialog', { name: 'Clear All Data' })
    await expect(dialog).toBeVisible()
    await dialog.getByRole('button', { name: 'Cancel' }).click()
    await expect(dialog).toHaveCount(0)
  })
})
```

Add `settings` to the mobile `testMatch`: `/(theme|shell|navigation|transactions|dashboard|catalog|reports|settings)\.spec\.js$/`.

- [ ] **Step 2: Run test to verify it fails**

Run: `npx playwright test tests/e2e/settings.spec.js`
Expected: FAIL. There is no `All settings` button, no `role="switch"`, and the hash is ignored. The dark-mode test also fails after save, because today's save handler strips `html.dark`.

- [ ] **Step 3: Create `components/ToggleSwitch.vue`**

```vue
<template>
  <label class="flex min-h-[44px] cursor-pointer items-center justify-between gap-4 py-1" :class="{ 'cursor-not-allowed opacity-50': disabled }">
    <span class="min-w-0">
      <span class="block text-sm font-medium text-ink">{{ label }}</span>
      <span v-if="description" class="block text-xs text-ink-muted">{{ description }}</span>
    </span>
    <button
      type="button"
      role="switch"
      :aria-checked="modelValue"
      :disabled="disabled"
      class="relative inline-flex h-7 w-12 shrink-0 items-center rounded-full transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-accent/50"
      :class="modelValue ? 'bg-accent' : 'bg-line'"
      @click="$emit('update:modelValue', !modelValue)"
    >
      <span class="inline-block h-5 w-5 rounded-full bg-white shadow transition-transform" :class="modelValue ? 'translate-x-6' : 'translate-x-1'" />
    </button>
  </label>
</template>

<script setup>
defineProps({
  modelValue: { type: Boolean, default: false },
  label: { type: String, required: true },
  description: { type: String, default: '' },
  disabled: { type: Boolean, default: false }
})
defineEmits(['update:modelValue'])
</script>
```

- [ ] **Step 4: Rewrite `pages/settings.vue`**

```vue
<template>
  <div>
    <PageHeader title="Settings" subtitle="Configure your application preferences" />

    <div class="md:grid md:grid-cols-[16rem_minmax(0,1fr)] md:items-start md:gap-6">
      <nav v-if="isWide || !activeCategory" class="card overflow-hidden" aria-label="Settings sections">
        <div class="divide-y divide-line">
          <ListRow
            v-for="category in SETTINGS_CATEGORIES"
            :key="category.id"
            clickable
            :title="category.name"
            :subtitle="category.description"
            :icon="category.icon"
            :icon-class="activeCategory === category.id ? 'bg-accent/10 text-accent' : 'bg-muted text-ink-muted'"
            :aria-current="activeCategory === category.id ? 'true' : undefined"
            @click="openCategory(category.id)"
          />
        </div>
      </nav>

      <section v-if="activeCategory" :id="activeCategory" class="scroll-mt-20">
        <button
          v-if="!isWide"
          type="button"
          class="-ml-2 mb-2 flex min-h-[44px] items-center gap-1 rounded-lg px-2 text-sm font-medium text-accent"
          @click="backToList"
        >
          <AppIcon name="chevron-left" class="h-4 w-4" />
          All settings
        </button>

        <BaseCard v-if="activeCategory === 'account'" title="Account Settings" subtitle="Manage your personal information" icon="user">
          <form class="space-y-4" @submit.prevent="handleSaveAccountSettings">
            <div>
              <label for="account-name" class="label">Display Name</label>
              <input id="account-name" v-model="accountSettings.displayName" type="text" class="input" placeholder="Enter your display name">
            </div>
            <div>
              <label for="account-email" class="label">Email Address</label>
              <input id="account-email" v-model="accountSettings.email" type="email" class="input" placeholder="Enter your email address">
            </div>
            <div>
              <p class="label">Profile Picture</p>
              <div class="flex items-center gap-3">
                <div class="flex h-14 w-14 items-center justify-center rounded-full bg-muted text-ink-muted">
                  <AppIcon name="user" class="h-7 w-7" />
                </div>
                <BaseButton variant="ghost">Change</BaseButton>
              </div>
            </div>
            <BaseButton type="submit" block icon="check">Save Account Settings</BaseButton>
          </form>
        </BaseCard>

        <BaseCard v-if="activeCategory === 'api'" title="API Configuration" subtitle="Set up Pocketbase API integration" icon="code">
          <form class="space-y-4" @submit.prevent="handleSaveApiSettings">
            <div>
              <label for="api-base" class="label">API Base URL</label>
              <input id="api-base" v-model="apiSettings.baseUrl" type="text" class="input" placeholder="https://example.com/api/">
              <p class="hint">The base URL for your Pocketbase API</p>
            </div>
            <div>
              <label for="api-endpoint" class="label">API Endpoint</label>
              <input id="api-endpoint" v-model="apiSettings.endpoint" type="text" class="input" placeholder="collections/budget_tracker_transactions/records">
              <p class="hint">The specific endpoint for transactions</p>
            </div>
            <div>
              <label for="api-token" class="label">API Token</label>
              <div class="relative">
                <input id="api-token" v-model="apiSettings.token" :type="showToken ? 'text' : 'password'" class="input pr-12" placeholder="Enter your API token">
                <button
                  type="button"
                  class="absolute inset-y-0 right-0 flex w-11 items-center justify-center text-ink-muted hover:text-ink"
                  :aria-label="showToken ? 'Hide token' : 'Show token'"
                  @click="showToken = !showToken"
                >
                  <AppIcon :name="showToken ? 'eye-off' : 'eye'" class="h-5 w-5" />
                </button>
              </div>
              <p class="hint">Your authentication token for API access</p>
            </div>
            <BaseButton type="submit" block icon="check">Save API Configuration</BaseButton>
          </form>
        </BaseCard>

        <BaseCard v-if="activeCategory === 'display'" title="Display Settings" subtitle="Customize the application appearance" icon="desktop">
          <form class="space-y-5" @submit.prevent="handleSaveDisplaySettings">
            <div>
              <p class="label">Currency Format</p>
              <SegmentedControl v-model="displaySettings.currencyFormat" label="Currency Format" :options="CURRENCY_OPTIONS" />
            </div>
            <div>
              <p class="label">Date Format</p>
              <SegmentedControl v-model="displaySettings.dateFormat" label="Date Format" :options="DATE_FORMAT_OPTIONS" />
            </div>
            <div class="divide-y divide-line border-y border-line">
              <ToggleSwitch v-model="displaySettings.darkMode" label="Dark Mode" />
              <ToggleSwitch v-model="displaySettings.showHeaderBalance" label="Show Balance in Header" />
            </div>
            <BaseButton type="submit" block icon="check">Save Display Settings</BaseButton>
          </form>
        </BaseCard>

        <BaseCard v-if="activeCategory === 'notifications'" title="Notification Settings" subtitle="Configure when and how you receive alerts" icon="bell">
          <form class="space-y-5" @submit.prevent="handleSaveNotificationSettings">
            <ToggleSwitch
              v-model="notificationSettings.pushEnabled"
              label="Push Notifications"
              description="Receive notifications even when the app is closed"
            />
            <div>
              <p class="label">Notify me about</p>
              <div class="divide-y divide-line border-y border-line">
                <ToggleSwitch v-model="notificationSettings.newTransactions" label="New transactions" :disabled="!notificationSettings.pushEnabled" />
                <ToggleSwitch v-model="notificationSettings.syncCompleted" label="Sync completion" :disabled="!notificationSettings.pushEnabled" />
                <ToggleSwitch v-model="notificationSettings.balanceUpdates" label="Balance updates" :disabled="!notificationSettings.pushEnabled" />
              </div>
            </div>
            <BaseButton type="submit" block icon="check" :disabled="!notificationSettings.pushEnabled">Save Notification Settings</BaseButton>
          </form>
        </BaseCard>

        <BaseCard v-if="activeCategory === 'data'" title="Data Management" subtitle="Export and backup your financial data" icon="database">
          <div class="space-y-6">
            <div>
              <h3 class="text-sm font-semibold text-ink">Export Data</h3>
              <p class="mb-3 text-xs text-ink-muted">Download a copy of all your transactions and settings</p>
              <div class="grid grid-cols-2 gap-2">
                <BaseButton variant="secondary" icon="download" @click="handleExportData('json')">Export as JSON</BaseButton>
                <BaseButton variant="secondary" icon="download" @click="handleExportData('csv')">Export as CSV</BaseButton>
              </div>
            </div>

            <div class="border-t border-line pt-5">
              <h3 class="text-sm font-semibold text-ink">Data Synchronization</h3>
              <p class="mb-3 text-xs text-ink-muted">Manage how your data syncs across devices</p>
              <div class="rounded-lg bg-muted p-4">
                <div class="mb-3 flex items-center justify-between gap-3">
                  <div class="min-w-0">
                    <p class="text-sm font-medium text-ink">Last sync</p>
                    <p class="truncate text-xs text-ink-muted">{{ lastSyncTime || 'Never' }}</p>
                  </div>
                  <BaseButton icon="refresh" :loading="queueIsSyncing" @click="syncData">
                    {{ queueIsSyncing ? 'Syncing...' : 'Sync Now' }}
                  </BaseButton>
                </div>
                <div class="h-2 overflow-hidden rounded-full bg-line">
                  <div class="h-full rounded-full bg-accent" :style="{ width: `${syncProgress}%` }" />
                </div>
                <p class="mt-1 text-right text-xs text-ink-muted">{{ syncProgress }}% complete</p>
              </div>
            </div>

            <div class="border-t border-line pt-5">
              <h3 class="text-sm font-semibold text-expense">Danger Zone</h3>
              <p class="mb-3 text-xs text-ink-muted">Permanent actions that can't be undone</p>
              <BaseButton variant="danger" block icon="trash" @click="showClearDataConfirm = true">Clear All Local Data</BaseButton>
            </div>
          </div>
        </BaseCard>
      </section>
    </div>

    <BottomSheet v-model:open="showClearDataConfirm" title="Clear All Data">
      <p class="mb-4 text-sm text-ink-muted">
        Are you sure you want to clear all local data? This action cannot be undone. All of your transactions, settings and offline data will be permanently removed.
      </p>
      <div class="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
        <BaseButton variant="secondary" @click="showClearDataConfirm = false">Cancel</BaseButton>
        <BaseButton variant="danger" @click="handleClearAllData">Delete All Data</BaseButton>
      </div>
    </BottomSheet>
  </div>
</template>

<script setup>
import { ref, computed, onMounted } from 'vue'
import { useTransactions } from '~/composables/useTransactions'
import { useAppSettings } from '~/composables/useAppSettings'
import { useOfflineQueue } from '~/composables/useOfflineQueue'
import { useMediaQuery } from '~/composables/useMediaQuery'
import { useToast } from '~/composables/useToast'

const { syncStatus, syncTransactionsQueue } = useTransactions()
const { offlineQueue, isSyncing: queueIsSyncing } = useOfflineQueue()
const {
  accountSettings,
  apiSettings,
  displaySettings,
  notificationSettings,
  saveAccountSettings,
  saveApiSettings,
  saveDisplaySettings,
  saveNotificationSettings,
  exportData,
  clearAllData
} = useAppSettings()
const { toast } = useToast()

const SETTINGS_CATEGORIES = [
  { id: 'account', name: 'Account Settings', description: 'Manage your personal details', icon: 'user' },
  { id: 'api', name: 'API Configuration', description: 'Set up Pocketbase integration', icon: 'code' },
  { id: 'display', name: 'Display Settings', description: 'Customize appearance', icon: 'desktop' },
  { id: 'notifications', name: 'Notifications', description: 'Configure alerts and reminders', icon: 'bell' },
  { id: 'data', name: 'Data Management', description: 'Export, backup or clear data', icon: 'database' }
]
const CURRENCY_OPTIONS = [
  { value: 'EUR', label: 'EUR (€)' },
  { value: 'USD', label: 'USD ($)' },
  { value: 'GBP', label: 'GBP (£)' }
]
const DATE_FORMAT_OPTIONS = [
  { value: 'DD/MM/YYYY', label: 'DD/MM/YYYY' },
  { value: 'MM/DD/YYYY', label: 'MM/DD/YYYY' },
  { value: 'YYYY-MM-DD', label: 'YYYY-MM-DD' }
]

// The active section lives in the URL hash so phones can deep link and use Back.
// The hash never reaches the server, so read it only after mount to keep hydration consistent.
const route = useRoute()
const router = useRouter()
const isWide = useMediaQuery('(min-width: 768px)')
const isMounted = ref(false)
onMounted(() => { isMounted.value = true })

const requestedCategory = computed(() => {
  if (!isMounted.value) return null
  const id = route.hash.slice(1)
  return SETTINGS_CATEGORIES.some(category => category.id === id) ? id : null
})
const activeCategory = computed(() => requestedCategory.value || (isWide.value ? 'account' : null))

const openCategory = id => router.push({ hash: `#${id}` })
const backToList = () => router.replace({ hash: '' })

// Data management state
const showClearDataConfirm = ref(false)
const lastSyncTime = ref(syncStatus.value?.lastSync ? new Date(syncStatus.value.lastSync).toLocaleString() : null)
const syncProgress = ref(0)
const showToken = ref(false)

const syncData = async () => {
  if (queueIsSyncing.value || !syncStatus.value.isOnline || !offlineQueue.value.length) {
    return
  }

  syncProgress.value = 0
  const result = await syncTransactionsQueue()

  if (result) {
    syncProgress.value = 100
    lastSyncTime.value = new Date().toLocaleString()
    toast(`Successfully synced ${result.processed} transactions.`)
  }
}

const handleSaveAccountSettings = async () => {
  if (await saveAccountSettings()) toast('Account settings saved successfully')
}

const handleSaveApiSettings = async () => {
  if (await saveApiSettings()) toast('API settings saved successfully')
}

// app.vue watches displaySettings.darkMode and applies html.dark, so saving only persists
const handleSaveDisplaySettings = async () => {
  if (await saveDisplaySettings()) toast('Display settings saved successfully')
}

const handleSaveNotificationSettings = async () => {
  if (await saveNotificationSettings()) toast('Notification settings saved successfully')
}

const handleExportData = async (format) => {
  const result = await exportData(format)
  if (result.success) {
    toast(`Data exported as ${format.toUpperCase()} successfully`)
  } else {
    toast(`Failed to export data: ${result.error}`, { tone: 'error' })
  }
}

const handleClearAllData = async () => {
  const result = await clearAllData()
  showClearDataConfirm.value = false
  if (result) {
    toast('All data cleared successfully')
  } else {
    toast('Failed to clear data', { tone: 'error' })
  }
}
</script>
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `npx playwright test tests/e2e/settings.spec.js tests/e2e/navigation.spec.js`
Expected: all pass on both projects. Phone-only and desktop-only tests are skipped on the other project. `navigation.spec.js` still finds the exact heading `Settings`.

- [ ] **Step 6: Commit**

```bash
git add components/ToggleSwitch.vue pages/settings.vue tests/e2e/settings.spec.js playwright.config.js
git commit -m "Rebuild settings as drill-in list with switches and sheet confirm"
```

---

### Task 7: Business Card

**Files:**
- Modify: `pages/business-card.vue` (full rewrite)
- Modify: `playwright.config.js` (`testMatch`)
- Test: `tests/e2e/business-card.spec.js` (create)

**Interfaces:**
- Consumes: `PageHeader`, `BaseButton`, `AppIcon`, `gotoReady`.
- Produces: nothing used later.

- [ ] **Step 1: Write the failing test**

Create `tests/e2e/business-card.spec.js`:

```js
import { test, expect, gotoReady } from './fixtures.js'

test.describe('business card', () => {
  test('QR code fits inside the screen', async ({ page }) => {
    await gotoReady(page, '/business-card')
    const qr = page.locator('img[src^="data:image"], canvas').first()
    await expect(qr).toBeVisible()
    const box = await qr.boundingBox()
    expect(box.x).toBeGreaterThanOrEqual(0)
    expect(box.x + box.width).toBeLessThanOrEqual(page.viewportSize().width)
  })

  test('print button opens the print dialog', async ({ page }) => {
    await page.addInitScript(() => { window.print = () => { window.__printed = true } })
    await gotoReady(page, '/business-card')
    await page.getByRole('button', { name: 'Print' }).click()
    expect(await page.evaluate(() => window.__printed)).toBe(true)
  })

  test('share button appears only where the share sheet exists', async ({ page }) => {
    await gotoReady(page, '/business-card')
    const hasShare = await page.evaluate(() => typeof navigator.share === 'function')
    await expect(page.getByRole('button', { name: 'Share' })).toHaveCount(hasShare ? 1 : 0)
  })

  test('contact rows are tappable links', async ({ page }) => {
    await gotoReady(page, '/business-card')
    await expect(page.getByRole('link', { name: 'service@3dps.space' })).toHaveAttribute('href', 'mailto:service@3dps.space')
  })
})
```

Add `business-card` to the mobile `testMatch`: `/(theme|shell|navigation|transactions|dashboard|catalog|reports|settings|business-card)\.spec\.js$/`.

- [ ] **Step 2: Run test to verify it fails**

Run: `npx playwright test tests/e2e/business-card.spec.js`
Expected: FAIL. On mobile the 300px QR canvas overflows its card, and the Print button and mailto link don't exist.

- [ ] **Step 3: Rewrite `pages/business-card.vue`**

```vue
<template>
  <div>
    <PageHeader title="Digital Business Card" />

    <div class="mx-auto max-w-sm space-y-4">
      <div class="card p-5 text-center">
        <h2 class="text-xl font-semibold tracking-tight text-ink">3D PRINT SHOP HARM</h2>

        <ul class="mt-4 divide-y divide-line text-left">
          <li>
            <a href="mailto:service@3dps.space" class="flex min-h-[44px] items-center gap-3 text-sm text-ink hover:text-accent">
              <AppIcon name="mail" class="h-5 w-5 shrink-0 text-ink-muted" />
              service@3dps.space
            </a>
          </li>
          <li class="flex min-h-[44px] items-center gap-3 text-sm text-ink">
            <AppIcon name="map-pin" class="h-5 w-5 shrink-0 text-ink-muted" />
            Krete 8, 23701 Eutin
          </li>
          <li class="flex min-h-[44px] items-center gap-3 text-sm text-ink">
            <AppIcon name="user" class="h-5 w-5 shrink-0 text-ink-muted" />
            Geschäftsführer: Lasse Harm
          </li>
        </ul>

        <div class="mt-5 border-t border-line pt-5">
          <h3 class="mb-3 text-sm font-semibold text-ink">Scan QR Code</h3>
          <!-- The QR library renders a fixed 300px canvas; let it shrink on narrow phones -->
          <div class="inline-block max-w-full rounded-lg bg-white p-3 [&_canvas]:!h-auto [&_canvas]:max-w-full [&_img]:h-auto [&_img]:max-w-full">
            <ClientOnly>
              <QRCode :value="websiteUrl" v-bind="qrcodeOptions" class="mx-auto" />
            </ClientOnly>
          </div>
          <p class="mt-3 text-sm text-ink-muted">Scan this QR code to visit our website</p>
        </div>
      </div>

      <div class="grid gap-2 print:hidden" :class="canShare ? 'grid-cols-2' : 'grid-cols-1'">
        <BaseButton v-if="canShare" variant="secondary" icon="share" @click="share">Share</BaseButton>
        <BaseButton variant="secondary" icon="printer" @click="print">Print</BaseButton>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, onMounted } from 'vue'
import QRCode from 'qrcode-vue3'
import qrcodeOptions from '@/assets/options.json'

const websiteUrl = 'https://3dps.space/'

const canShare = ref(false)
onMounted(() => { canShare.value = typeof navigator.share === 'function' })

// Dismissing the share sheet rejects the promise; that is not an error
const share = () => navigator.share({ title: '3D PRINT SHOP HARM', url: websiteUrl }).catch(() => {})
const print = () => window.print()
</script>
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx playwright test tests/e2e/business-card.spec.js tests/e2e/navigation.spec.js`
Expected: all pass on both projects. `navigation.spec.js` still finds `Digital Business Card` and the QR image.

- [ ] **Step 5: Commit**

```bash
git add pages/business-card.vue tests/e2e/business-card.spec.js playwright.config.js
git commit -m "Rebuild business card with share and print actions"
```

---

### Task 8: Mobile sweep, cleanup and full verification

**Files:**
- Test: `tests/e2e/mobile.spec.js` (create)
- Modify: `playwright.config.js` (remove the mobile `testMatch` filter)
- Modify: `assets/css/main.css` (delete the legacy `.card-header`/`.card-body`)
- Modify: `CLAUDE.md` (two lines on tokens and the mobile test project)

**Interfaces:**
- Consumes: everything above.

- [ ] **Step 1: Write the overflow and tap-target sweep**

Create `tests/e2e/mobile.spec.js`:

```js
import { test, expect, gotoReady } from './fixtures.js'

const PAGES = [
  '/',
  '/catalog',
  '/business-card',
  '/reports',
  '/settings',
  '/settings#account',
  '/settings#api',
  '/settings#display',
  '/settings#notifications',
  '/settings#data'
]

// Worst-case content: unbroken words, seven-digit amounts, long notes
const longTransaction = {
  id: 1,
  description: 'Supercalifragilisticexpialidocious-commission-for-a-very-large-custom-print-job',
  amount: 1234567.89,
  date: '2026-10-12',
  notes: 'Delivered in three batches; '.repeat(6)
}
const longProducts = [
  { id: 'p1', collectionId: 'c1', name: 'Extremely Long Articulated Dragon Figure With Movable Wings And Tail', description: 'A '.repeat(150), price: 123456.78, images: [] },
  { id: 'p2', collectionId: 'c1', name: 'Phone Stand', description: 'Adjustable desk stand', price: 4, images: [] },
  { id: 'p3', collectionId: 'c1', name: 'Cable Clip', description: 'Pack of cable organisers', price: 1.5, images: [] }
]

const seed = async (page, { dark }) => {
  await page.addInitScript(({ dark, transaction }) => {
    localStorage.setItem('budget-tracker-settings', JSON.stringify({ display: { darkMode: dark } }))
    localStorage.setItem('budget-tracker-transactions', JSON.stringify([transaction]))
  }, { dark, transaction: longTransaction })
}

test.describe('phone layout sweep', () => {
  test.beforeEach(async ({ page, isMobile }) => {
    test.skip(!isMobile, 'Runs on the mobile project')
    await page.setViewportSize({ width: 375, height: 812 })
  })

  for (const dark of [false, true]) {
    for (const path of PAGES) {
      test(`${path} has no horizontal scroll at 375px${dark ? ' (dark)' : ''}`, async ({ page, api }) => {
        await api.mockCatalog(longProducts)
        await seed(page, { dark })
        await gotoReady(page, path)
        await page.waitForLoadState('networkidle')

        const { scrollWidth, innerWidth } = await page.evaluate(() => ({
          scrollWidth: document.documentElement.scrollWidth,
          innerWidth: window.innerWidth
        }))
        expect(scrollWidth).toBeLessThanOrEqual(innerWidth)
      })
    }
  }

  for (const path of PAGES) {
    test(`${path} tap targets are at least 44px`, async ({ page, api }) => {
      await api.mockCatalog()
      await gotoReady(page, path)
      await page.waitForLoadState('networkidle')

      // Controls inside a <label> (switches) use the whole label row as their target
      const small = await page.evaluate(() =>
        [...document.querySelectorAll('a[href], button, input, select, textarea')]
          .filter(el => !el.closest('label'))
          .map(el => ({ el, box: el.getBoundingClientRect() }))
          .filter(({ box }) => box.width > 0 && box.height > 0)
          .filter(({ box }) => box.width < 44 || box.height < 44)
          .map(({ el, box }) => `${el.tagName.toLowerCase()} "${(el.getAttribute('aria-label') || el.textContent || '').trim().slice(0, 30)}" ${Math.round(box.width)}×${Math.round(box.height)}`)
      )
      expect(small).toEqual([])
    })
  }
})
```

- [ ] **Step 2: Open the mobile project to every spec and run it**

In `playwright.config.js`, delete the `testMatch` line and the comment above it from the `mobile` project.

Run: `npx playwright test --project=mobile`
Expected: every spec passes. If the sweep reports a page, fix the component it names. Typical fixes are a missing `min-w-0`/`truncate` on a flex child, or a missing `h-11 w-11` on an icon button. Re-run until clean, and commit the fixes with this task.

- [ ] **Step 3: Remove legacy CSS and confirm nothing uses it**

Run: `grep -rnE "card-header|card-body|nav-link|transaction-item|transaction-icon|backdrop-blur|bg-gradient|darkMode \?" app.vue pages components assets`
Expected: matches only for the `.card-header` and `.card-body` rule definitions in `assets/css/main.css`.

Delete these lines from `assets/css/main.css`:

```css
  /* Legacy page sections, removed once every page uses BaseCard (Task 8) */
  .card-header {
    @apply border-b border-line p-4 md:p-5;
  }
  .card-body {
    @apply p-4 md:p-5;
  }
```

Re-run the grep. Expected: no output.

- [ ] **Step 4: Note the conventions in `CLAUDE.md`**

In the `## Code Style Guidelines` list, replace the line `- Use Tailwind utility classes and component classes (defined in assets/css/main.css)` with:

```markdown
- Use Tailwind utility classes and component classes (defined in assets/css/main.css). Colours come from the semantic tokens (`surface`, `card`, `muted`, `line`, `ink`, `ink-muted`, `accent`, `income`, `expense`), which switch automatically in dark mode. Don't use raw gray/blue classes or `darkMode` ternaries.
- Mobile-first: phones get the bottom tab bar and bottom sheets (`BottomSheet`), and `lg+` renders panels inline (`useMediaQuery`). Keep tap targets ≥ 44px. `npx playwright test --project=mobile` runs the suite on a Pixel 7.
```

- [ ] **Step 5: Full production verification**

Stop the dev server, then run: `npx playwright test`
Expected: Playwright runs `npm run build && npm run preview`, and every test passes on both `chromium` and `mobile`. Copy the summary line (for example `NN passed, MM skipped`) into the commit or PR description.

- [ ] **Step 6: Screenshot pass (manual, not committed)**

With `npm run preview` running, save this as `test-results/shots.mjs` (gitignored) and run it with `node test-results/shots.mjs` from the repo root:

```js
import { mkdirSync } from 'node:fs'
import { chromium } from '@playwright/test'

const OUT = 'test-results/screenshots'
mkdirSync(OUT, { recursive: true })
const pages = ['/', '/catalog', '/business-card', '/reports', '/settings', '/settings#display']
const browser = await chromium.launch()
for (const [w, h] of [[375, 812], [1280, 800]]) {
  for (const dark of [false, true]) {
    const page = await browser.newPage({ viewport: { width: w, height: h } })
    await page.addInitScript(d => localStorage.setItem('budget-tracker-settings', JSON.stringify({ display: { darkMode: d } })), dark)
    for (const path of pages) {
      await page.goto(`http://localhost:3000${path}`)
      await page.waitForTimeout(500)
      const name = `${path.replace(/[\/#]/g, '_') || '_'}-${w}-${dark ? 'dark' : 'light'}.png`
      await page.screenshot({ path: `${OUT}/${name}`, fullPage: true })
    }
    await page.close()
  }
}
await browser.close()
```

Look at all 24 screenshots and check for:
- clipped text;
- content hidden under the tab bar or floating buttons;
- low-contrast text in dark mode;
- leftover gray or blue styling that doesn't follow the tokens.

Fix anything found, then re-run Step 5.

- [ ] **Step 7: Commit**

```bash
git add tests/e2e/mobile.spec.js playwright.config.js assets/css/main.css CLAUDE.md
git commit -m "Add phone layout sweep and run full suite on mobile"
```
