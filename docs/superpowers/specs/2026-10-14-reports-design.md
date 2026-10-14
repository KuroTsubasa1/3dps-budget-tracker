# Reports and analysis: design

Date: 2026-10-14
Status: Draft for review
It builds on the catalog and inventory, deals, commissions, the print board, and the shared transaction list (transactions loaded from PocketBase on every device). All of these are merged into `main` and deployed.

## Goal

The owner sees four things:
- what sells best;
- how a market day went;
- how the money develops over time;
- where stock and production stand.

To make this exact, each sale and each commission income from now on stores its lines and its sale time.

**Decided with the owner**
- **Sale lines from now on.** Each new transaction stores `items` (its lines) and `sold_at` (the sale time). Older transactions still count in totals, and their units come from stock movements. They are marked as "before line data". No guessing from description text.
- **One Reports page with four tabs:** Sales · Market day · Money · Stock, plus one shared period picker (Today / Week / Month / Year / Custom).
  - Phones show the tabs as chips.
  - `lg+` shows the same layout with wider charts.
- **Charts are plain SVG** (bar and line), drawn with the semantic colour tokens, dark-mode aware. No chart library.

**Assumptions**
- A "day" is the device's local calendar day. A "market day" is any day with at least one sale (income with `items`, or income dated that day).
- Expenses (negative amounts) appear only on the Money tab, never in sales figures.
- Stock value uses current prices: the article override, else the category base price.
- "Runs out in" uses the average daily units sold over the last 30 days.

## Success criteria

1. **Recording lines.** A checkout from the cart stores, on its transaction:
   - `items: [{ article, name, category, categoryName, quantity, unitPrice, lineTotal, discount }]`;
   - `sold_at`, as an ISO time.

   The `discount` of all lines adds up to the cart's deal savings, and Σ lineTotal − Σ discount = amount. A commission's income stores its commission lines in the same way, with the agreed price spread proportionally and the rounding remainder on the last line.
2. **Sales tab**, for the period:
   - **Top articles:** by revenue and by units. Revenue comes from lines; units come from lines, plus older sales from stock movements.
   - **Top categories:** the same.
   - **Deals used:** times applied and total discount.
   - **A hint** when older sales without lines fall in the period: `N older sales aren't split by article`.
3. **Market day tab:**
   - A day picker that lists market days only, defaulting to the latest.
   - That day's takings, items sold and number of sales.
   - Takings per hour from `sold_at`, falling back to `created`.
   - A comparison with the average of the previous 5 market days: takings, items and average sale.
4. **Money tab**, for the period:
   - income, expenses and profit per week, or per month for Year/Custom periods longer than 90 days;
   - the running balance;
   - the Japan line (10% of income), as on the dashboard.
5. **Stock tab:**
   - **Stock value:** Σ stock × price over active articles.
   - **Runs out soonest:** the top 5 articles by `stock / avg daily units (30 days)`, shown as `~N days`. Articles with no sales are not listed.
   - **Printed vs sold** in the period, from stock movements.
   - **Commissions:** open value (open, printing and ready), delivered value in the period, and the average days from created to delivered.
6. **Edge cases:**
   - **Offline:** the Money tab works from the cached transactions; the Sales, Market day and Stock tabs show `Needs a connection` instead of figures.
   - **Empty period:** each tab shows a friendly empty state.
7. **Export.** The existing Export action downloads a CSV of the current tab's table for the period.
8. **Layout.** Works at 375px with 44px targets, no horizontal scroll, and correct colours in light and dark mode.

## Data model (PocketBase 0.22)

### `budget_tracker_transactions` (changes)

| Field | Type | Rules |
|---|---|---|
| `items` | json (`maxSize` 2000000) | optional. The lines listed in criterion 1 |
| `sold_at` | date | optional. The sale time, sent by the app |

- The migration adds both fields when they are missing (`addFields`, keeping the 1.5 s gap for automigrate). The rules don't change.
- Before the migration, PocketBase ignores the two fields, so the app works with either order of migrating and deploying.
- `fromRecord` (utils/transactions.js) keeps `items` and `sold_at` on the local entries, so the cached list carries them offline.

## Pure logic (`utils/reports/`, unit-tested)

- `period.js`:
  - `periodRange(kind, now, custom?)` returns `{ start, end }` in local time.
  - `inPeriod(dateOrIso, range)`.
- `sales.js`: `salesSummary({ transactions, movements, articles, categories, range })` returns `{ topArticles, topCategories, deals, olderSalesCount }`.
- `marketDay.js`:
  - `marketDays(transactions)` lists the local dates with sales, newest first.
  - `dayReport({ transactions, day })` returns `{ takings, items, sales, perHour[24] }`.
  - `compareWithPrevious({ transactions, day, count: 5 })` returns `{ takings, items, averageSale }` as deltas.
- `money.js`: `moneySeries({ transactions, range, bucket: 'week' | 'month' })` returns `[{ label, income, expenses, profit }]`, plus `{ balanceLine, japan }`.
- `stock.js`:
  - `stockValue(articles, categories)`;
  - `runsOutSoonest({ articles, movements, now, limit: 5 })`;
  - `printedVsSold(movements, range)`;
  - `commissionFigures(commissions, range)`.
- `lines.js`: `saleLines(pricedCart, deals)` and `commissionLines(commission, articles)` build the `items` for criterion 1.

All money is computed in cents and displayed with `formatCurrency()`.

## App changes

- **Checkout** (`pages/catalog.vue`):
  - builds `items` with `saleLines(priceCart(...))`;
  - passes `items` and `sold_at` to `addTransaction`;
  - `postTransaction` (useTransactions) sends `items` and `sold_at`;
  - the offline queue keeps them.
- **Commission income** (`components/CommissionSheet.vue`): adds `items: commissionLines(...)` and `sold_at`.
- **Data access:** a new `composables/useReportData.js`.
  - It loads, for the period: `stock_movements` (filtered by `created`), all articles with their category, categories, deals and commissions.
  - It returns `{ data, loading, needsConnection }`.
  - Transactions come from `useTransactions().transactions`.
- **Page** (`pages/reports.vue`, rewritten):
  - a period picker;
  - a chip group "Report" (Sales / Market day / Money / Stock);
  - one component per tab: `components/reports/SalesReport.vue`, `MarketDayReport.vue`, `MoneyReport.vue`, `StockReport.vue`;
  - small SVG chart components: `components/charts/BarChart.vue` and `LineChart.vue`.
- **Removed:** the old trend placeholders and "Expenses by Category". Their content moves into the Money tab.

## Migration

- `planSchema` adds `items` (json) and `sold_at` (date) to `budget_tracker_transactions` when missing.
- Unit tests in `tests/unit/pb-plan.test.js` cover:
  - the op;
  - idempotency;
  - the live snapshot needing nothing beyond these two fields. The check must hold both before and after `--apply`, using the "without these fields" pattern.
- **README rollout:** `npm run pb:migrate` (the dry run shows only the two fields), then `--apply`. The order relative to the deploy doesn't matter.

## Testing

- **Unit tests** for every function in `utils/reports/` against a fixed data set, covering:
  - top articles and categories;
  - deal discount totals;
  - older-sales units from movements;
  - market days;
  - hourly takings (`sold_at` vs `created` fallback);
  - the comparison with the previous 5 days;
  - week and month buckets, the running balance and the Japan line;
  - stock value;
  - runs-out days (no sales → excluded);
  - printed vs sold;
  - commission figures;
  - `saleLines` / `commissionLines` sums and rounding.
- **e2e**:
  - a cart checkout posts `items` and `sold_at`, and the lines add up to the amount;
  - a delivered commission posts its lines;
  - each tab shows the expected figures for seeded data;
  - the period picker changes them;
  - offline shows `Needs a connection` on the Sales tab and figures on Money;
  - the CSV export of the Sales tab;
  - the 375px sweep for `/reports`.

## Out of scope

- Forecasts beyond "runs out in" and profit margins (no material costs are tracked).
- Comparisons across years, and PDF export.
- Reports per customer.
- Etsy.
