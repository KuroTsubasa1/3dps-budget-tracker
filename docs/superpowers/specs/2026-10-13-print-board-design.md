# Print board: design

Date: 2026-10-13
Status: Draft for review
Sub-project 4 of 5. It builds on sub-project 1 (articles, low-stock threshold, stock movements, owner login), sub-project 2 (deals) and sub-project 3 (commissions), all merged into `feat/mobile-ui-overhaul`.

## Goal

The owner sees what to print next and tracks it to done. Low stock and open commissions appear on the board automatically. Finishing a stock print adds it to stock. Finishing a commission marks it Ready.

**Decided with the owner**
- **Cards come from live data plus print jobs.**
  - Low-stock articles and Open commissions appear in "To print" automatically.
  - Starting a low-stock card creates a print job (article + quantity).
  - Jobs move To print → Printing → Done.
- **Suggested quantity: back up to a target.**
  - Each article has an optional `target_stock`. When it is empty, the target is 2 × `low_stock_threshold`.
  - The suggestion is `target − stock`, at least 1. The owner can change it before starting.
- **Commissions mirror their own status.** Open → "To print"; Start sets it to Printing; Done sets it to Ready. There is no separate job, and commissions never touch stock.
- **Placement.** A "Print board" button in the Catalog header and a Dashboard link "N to print". The bottom tab bar stays at 5 tabs.
- **Interaction.** Buttons, no drag-and-drop. Desktop (`lg+`) shows three columns side by side; phones show the columns as chips with counts.

**Assumptions**
- One printing job per article at a time.
- Only articles with `low_stock_threshold` > 0 qualify. An out-of-stock article without a threshold does not appear.
- Inactive (archived) articles never appear.
- "Today" is the device's local calendar day.

## Success criteria

1. "To print" lists every active article with threshold > 0, stock ≤ threshold and no printing job, with its suggested quantity, plus every Open commission.
2. "Print N" creates one `print_jobs` record (status `printing`). The article leaves "To print" and appears under Printing.
3. "Done" on a stock job writes exactly one `printed +N` stock movement, then sets the job to `done` with `done_at`. A retried Done never adds stock twice.
4. "Back" on a stock job deletes it. The article returns to "To print" if it is still low.
5. Commission cards use the existing lifecycle: Start = open → printing; Done = printing → ready; Back = printing → open. A commission already moved on another device is refused with `Already updated — the board has been refreshed`.
6. "Done today" lists jobs with `done_at` today and commissions that moved to Ready today, read-only.
7. Only the pinned owner can list, view, create, update or delete print jobs (PocketBase rules via `--apply-rules`).
8. The page works at 375px, with 44px tap targets and no horizontal scroll.

## Data model (PocketBase 0.22)

### `print_jobs` (new)

| Field | Type | Rules |
|---|---|---|
| `article` | relation → articles (`budget_tracket_catalog`), single | required |
| `quantity` | number | integer, min 1, required |
| `status` | select | `printing` \| `done`, required |
| `done_at` | date | set when the status becomes `done` |

- Created locked (all five rules `null`). `--apply-rules` sets all five to `ownerRule(ownerId)`.

### `articles.target_stock` (new field)

- number, integer, min 0, optional. Empty or 0 means "2 × threshold".
- Added by the migration's `addFields` step, like `stock` and `low_stock_threshold`.

### Commission "ready today"

Commissions have no `ready_at`. `transitionPatch` sets `ready_at` (ISO) when the target is `ready`, and the migration adds a `ready_at` date field to `commissions`. "Done today" uses it. Moving back from Ready to Printing clears it.

## Board logic (`utils/printBoard.js`, pure)

```
targetFor(article)            = article.target_stock > 0 ? article.target_stock : 2 × article.low_stock_threshold
suggestedQuantity(article)    = max(1, targetFor(article) − article.stock)
buildBoard({ articles, jobs, commissions, now }) → { toPrint, printing, doneToday }
```

- `toPrint`:
  - articles where `active`, threshold > 0, `stock ≤ threshold`, and no job with status `printing`. Each card is `{ kind: 'stock', article, quantity: suggestedQuantity }`. They are sorted by stock ascending, then name.
  - commissions with status `open`. Each card is `{ kind: 'commission', commission }`. They are sorted oldest first.
- `printing`: jobs with status `printing` (`kind: 'job'`) and commissions with status `printing`.
- `doneToday`: jobs with `done_at` on the local day of `now`, and commissions with status `ready` and `ready_at` on that day.

## App changes

### Data access (`composables/usePrintJobs.js`)
- `listPrintJobs()` (expand `article`, only `printing` jobs plus `done` jobs from the last 2 days).
- `startJob(article, quantity)`: refuses with `This article is already printing` when a printing job for the article exists (it re-lists first).
- `finishJob(job)`:
  1. Writes the stock movement through `useInventory` with the movement id equal to the job id. A duplicate-id error counts as already written.
  2. Patches the job to `done` with `done_at`.
- `cancelJob(job)`: deletes the job.

### Print board page (`pages/print-board.vue`, `middleware: 'owner'`)
- **Header:** "Print board".
- **Columns:** "To print", "Printing", "Done today". Phones show chips (group "Print board columns") with counts; the default is "To print".
- **Stock card:**
  - the article name, `<stock> left · target <target>`;
  - a `QuantityStepper` pre-set to the suggestion;
  - the button `Print <n>`.
- **Commission card:**
  - `Commission · <customer name>` (or "Anonymised"), `<article> × <qty>`, and the notes when present;
  - the button `Start`.
- **Printing cards:** `Done` and `Back`.
- **Done today:** `+<n> to stock` or `Commission ready`.
- **Errors:**
  - offline: `You're offline — the print board needs a connection`;
  - other failures: `Could not update the print board. Try again.`
- **Missing collection:** when `print_jobs` returns 404, a hint says `Run the migration to enable the print board`, and the commission cards still work.

### Article editor (`components/ArticleSheet.vue`)
- A new optional field: "Target stock", with the hint `Empty = 2× low-stock threshold`. Validation: a whole number of 0 or more (`Target stock must be a whole number of 0 or more`).

### Entry points
- **Catalog header** (owner): a "Print board" button next to Commissions.
- **Dashboard** (owner): a link `N to print` (singular `1 to print`) counting the "To print" cards, linking to `/print-board`. It is hidden at 0 and quietly hidden when loading fails.

## Migration
- `planSchema` creates `print_jobs` (locked) and adds `articles.target_stock` and `commissions.ready_at` when they are missing.
- `rulesFor(ownerId)` gains `print_jobs` with all five rules set to the owner rule.
- `writeSnapshot` includes `print_jobs`.
- Unit tests cover the ops, the rules and idempotency.

## Testing
- **Unit** (`tests/unit/printBoard.test.js`):
  - `targetFor` with and without `target_stock`;
  - `suggestedQuantity` never below 1;
  - `buildBoard`: threshold 0 excluded, inactive excluded, an article with a printing job excluded, sorting, and the "today" boundary at local midnight.
- **Unit** (`tests/unit/commissions.test.js`): `ready_at` set on → ready and cleared on ready → printing.
- **e2e** (`tests/e2e/print-board.spec.js`; the fake PocketBase gains `print_jobs`, owner-only):
  - a low-stock article (stock 2, threshold 5) shows `2 left · target 10` and `Print 8`; Print → Printing; Done → stock 10 and one `printed +8` movement;
  - a changed stepper quantity is used;
  - Back returns the article to To print;
  - a retried Done (dropped reply) adds stock once;
  - commission Start → Printing → Done → status ready, with no stock movement;
  - a commission changed elsewhere shows `Already updated — the board has been refreshed`;
  - the Dashboard link count and the Catalog button;
  - logged out: `/print-board` redirects to login.
- **375px sweep:** add `/print-board`.

## Out of scope
- Printer or plate scheduling, print time and filament tracking, drag-and-drop, and multiple printing jobs per article.
- Etsy (sub-project 5).
