# Gatcha prizes, one stock field, and reminder delivery fixes: design

Date: 2026-10-14
Status: Draft for review

This builds on the catalog and checkout (`pages/catalog.vue`, `priceCart`, sale lines), the inventory log (`stock_movements` through `useInventory`), the article sheet, and the convention reminders (`server/utils/reminderJob.js`, Settings → Notifications). All of these are merged into `main` and deployed at https://akinai.lasseharm.space.

## Goal

The owner sells a special article, the gatcha (today "GatchaPon", category GatchaPon, base price 4 €). A customer who buys one picks a prize article at the stall. After the checkout, Akinai lets the owner record each prize in a few taps, so stock stays right.

The same release:
- simplifies stock editing to one field;
- fixes how the reminder job handles undelivered reminders.

**Decided with the owner**
- **Prize pool:** articles from chosen categories. The categories are set once on the gatcha article.
- **Gatcha stock:** only the prize's stock goes down. The gatcha article's own stock is not touched.
- **Timing:** the picker appears right after checkout. If the owner closes it early, a banner on the catalog keeps the open prizes until they are picked.
- **Stock field:** one "Stock now" field.
  - A higher number is recorded as *printed*, a lower one as a *correction*.
  - There is no note field.
- **Reports:** stay as they are. Older sales without line data keep 0 € revenue per article.
- **Deals:** stay as they are.
- **Push:** the job must not use up a reminder when no device is registered, and it must log what it does.

## Success criteria

1. **Gatcha article.**
   - The article sheet has a **Prize categories** multi-select listing all categories.
   - An article with at least one prize category is a gatcha.
   - Its price, deal and sale line work as for any article.
   - The checkout does not lower the gatcha's own stock: its sale line has no stock movement.
2. **Prize picker after checkout.** When a checkout contains N gatcha units (summed over gatcha articles), a bottom sheet **Gatcha prizes · k of N** opens once the checkout succeeds, including an offline checkout.
   - **List:** the active articles from the gatcha's prize categories with stock > 0, grouped by category and sorted by name. Each row shows the name and current stock.
   - **Search:** a search field filters the list by name.
   - **Several gatchas:** with different prize categories, the list is the union of them, and each pick counts toward the open total.
   - **Tapping an article** records one prize:
     - a `sale` movement of −1 for that article, with the note `Gatcha prize`;
     - the shown stock drops at once;
     - the pick appears under **Picked** with an **Undo** button.
   - **Undo:**
     - before the pick has synced, Undo removes it;
     - after it has synced, Undo records a `correction` of +1 with the note `Gatcha prize undone`.
   - **Closing:** when k reaches N, the sheet shows `All prizes picked` and closes after a moment.
   - **Later:** closes the sheet with prizes still open.
3. **Open prizes.**
   - **Storage:** open prizes are kept on the device in local storage, as a count plus the prize categories, until picked.
   - **Banner:** the catalog page shows **N gatcha prizes to pick** with **Pick now**, which reopens the sheet.
   - **Adding up:** a second checkout with gatchas adds to the open prizes.
   - **Logout:** clears open prizes, like the other local data.
4. **Offline.**
   - Picks and undos work without a connection: they are queued on the device and sent when the connection returns.
   - Movement ids are generated on the device, so a resend is idempotent, the same way as the checkout's movements.
   - While a pick is waiting, it shows `Waiting to sync`.
5. **Stock field.** The inventory panel replaces *Add printed*, *Set to* and the note with one field, **Stock now** (whole number ≥ 0), and **Save**.
   - **Higher than the current stock:** a `printed` movement for the difference.
   - **Lower:** a `correction` movement to the new count.
   - **Equal:** nothing is recorded, and the panel says `Stock unchanged`.
   - **Invalid input** (empty, negative, not a whole number): `Enter how many are in stock now`.
   - **Unchanged:** the starting stock on a new article and the movement history list.
6. **Reminder delivery.**
   - **No device:** with no registered device, a due reminder is **not** marked sent. It stays waiting, until a device is registered or it is more than 24 h late, when it is marked missed as before.
   - **All devices gone:** if every device turns out to be gone (404/410) during a run, the reminder also stays waiting, as with no devices.
   - **Logging:** every run that sends, removes or fails anything writes one line to the server log:
     - `[reminders] sent N, removed M (410 web.push.apple.com), failed K (403 …)`;
     - the push host and status code are logged, never the endpoint path or keys.
   - **Removed devices:** a device removed because its push service answered 404/410 is logged with that status.
   - **Settings status line:**
     - `No device has notifications on` when there are none;
     - otherwise, after `Reminders last checked <time>`, the last delivery problem (for example `Apple answered 410 for a device; it was removed`) until the next successful delivery.
7. **Layout.** Works at 375px with 44px targets and no horizontal scroll, in light and dark mode. Semantic tokens only.

## Data model (PocketBase 0.22)

- `budget_tracket_catalog` gains `prize_categories`, a relation to `categories`: multiple, optional, `cascadeDelete: false`.
- The migration adds it when missing, in the existing article `addFields` style, with the 1.5 s gap.
- Rules are unchanged.

## Out of scope

- Prize statistics in Reports.
- Gatcha odds or random draws.
- Choosing a prize from another category than the configured ones.
- Revenue estimates for older sales.
- Changing deals.
