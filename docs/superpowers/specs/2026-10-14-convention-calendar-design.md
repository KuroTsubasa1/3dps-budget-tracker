# Convention calendar: design

Date: 2026-10-14
Status: Draft for review

The app is now Akinai (商い) at https://akinai.lasseharm.space. It builds on the catalog, inventory, print board (low-stock rule in `utils/printBoard.js`), the commission delivery (which books income as a transaction) and the Reports page. All of these are merged into `main` and deployed.

## Goal

The owner keeps every convention in one place: open applications with their deadlines, applications waiting for an answer, and booked conventions with their setup details and stand fee. Akinai reminds the owner of application deadlines, of the event itself and of low print stock before an event:
- as push notifications on the installed app;
- and as a private calendar link that the phone's Calendar subscribes to.

The README is rewritten at the end of this project to describe the whole app.

**Decided with the owner**
- **Reminders:** application deadlines, the event itself, and print stock before an event. Answers and payments are not reminded.
- **Delivery:** push notifications plus a calendar feed (`.ics`).
- **Fields:** name, place, dates and status, plus the application dates, the setup details and the stand fee. There is no link or notes field.
- **Stand fee:** *Mark fee paid* books the fee as an expense.
- **Page:** an Upcoming list plus a Month grid, side by side on desktop.
- **Reminder times:** defaults that can be edited per convention, with custom reminders added freely.
- **Approach A:** Akinai's own Nuxt server sends the push and serves the feed, reading PocketBase with a dedicated `akinai-notifier` account.

**Assumptions**
- **Local time:** times are the owner's local time (Europe/Berlin). The server runs with `TZ=Europe/Berlin` for message texts and the feed.
- **Push on iPhone:** this needs iOS 16.4+ and Akinai installed to the home screen.
- **One owner:** the feed has a single secret, set on the server.

## Success criteria

1. **Conventions.**
   - The owner creates, edits and deletes conventions.
   - Statuses: `interested` · `applied` · `booked` · `rejected` · `cancelled`. A booked convention whose `ends_on` has passed shows as **Done**; that is derived, not stored.
   - Quick buttons *Mark applied*, *Mark booked* and *Rejected* save immediately.
2. **Default reminders.** These are created and kept in step with the dates (`auto: true`), in local time:
   - **Applications close:** 7 days and 1 day before `applications_close`, at 09:00. Only while the convention is *interested*.
   - **Stock check:** 14 days before `starts_on`, at 09:00. Only while *booked*.
   - **Pack:** 2 days before `starts_on`, at 18:00. Only while *booked*.
   - **Setup:** 08:00 on `starts_on`, or 1 hour before `setup_at` when set. Only while *booked*.

   A change of dates or of setup time moves the unsent `auto` reminders. A reminder the owner edits loses `auto` and stays as set. The owner can remove reminders and add custom ones (date, time, text). A sent reminder is never sent again.
3. **Upcoming view** (the default):
   - **Open applications:** *interested* conventions whose `applications_close` is ahead, soonest first, each with `Applications close in N days`. The warning token is used from 7 days.
   - **By month:** *applied* and *booked* conventions, each with its dates, place and status chip. An applied convention shows `Results expected <date>` when that date is set.
   - **Past:** a collapsed section for done, rejected and cancelled conventions.
4. **Month view:**
   - weeks start on Monday;
   - convention days are drawn as bars (booked solid accent, applied and interested outlined);
   - application deadlines are drawn as dots;
   - arrows move between months;
   - tapping a day lists its entries.

   On `lg+`, Month and Upcoming sit side by side.
5. **Convention sheet** (`BottomSheet` on phones, an inline panel on `lg+`), with these groups:
   - **Basics:** name (required), city, venue, start, end, status.
   - **Application:** opens, closes, results expected.
   - **Setup:** hall, table, setup time.
   - **Stand fee:** the amount and *Mark fee paid*. That button adds an expense transaction `Stand fee: <name>` for the fee, dated today, and stores `fee_paid_at` and `fee_transaction`. The sheet then shows `Paid <date>`.
   - **Reminders:** each listed with its kind, its rule and its local time, with edit and remove, plus *Add reminder*.
6. **Navigation:**
   - **Desktop:** "Calendar" in the side navigation.
   - **Phone:** "Calendar" in the More sheet.
   - **Dashboard:** a **Next up** card shows the next application deadline and the next booked convention, each with how many days are left. The card links to the convention and is hidden when there is nothing to show or the collection is missing.
7. **Push.** Settings → Notifications has:
   - **Turn on notifications on this device:** permission, then subscription, then a `push_subscriptions` record.
   - **On iPhone Safari, when not installed:** an explanation that Akinai must be on the home screen first.
   - **Send test notification.**
   - **Turn off:** unsubscribe and delete the record.
   - **A status line:** `Reminders last checked <time>`, or the job's last error, or `Notifications aren't configured on the server`.
   - **Denied permission:** how to allow it again.
8. **Server job** (every 5 minutes, inside the Nuxt server):
   - **Due reminders:** it sends every reminder whose `at` is in the past and not yet sent, while the convention's status allows it.
   - **Recording:** it records `sent_at` on each reminder.
   - **Skipped reminders:** a reminder whose status no longer allows it gets `sent_at` with `skipped: true`.
   - **Missed reminders:** a reminder more than 24 hours overdue gets `sent_at` with `missed: true`, and nothing is sent.
   - **Dead devices:** a subscription answered with 404 or 410 is deleted.
   - **Messages:** tapping a notification opens `/calendar?c=<id>`.

   | Kind | Title | Body |
   |---|---|---|
   | deadline | `Applications close in N days` (`tomorrow` for 1) | `<name> · closes <Tue 21 Oct>` |
   | stock | `<name> in 14 days` | `Low stock: <article> (print N), …` (at most 5 articles, then `+N more`), else `Stock looks fine` |
   | pack | `<name> in 2 days` | `Time to pack` plus ` · <hall>, Table <table>` when set |
   | setup | `Setup today: <name>` | the hall, table and setup time that are set, joined by ` · ` |
   | custom | `<name>` | the reminder's text |

   The low-stock list uses the print board's rule: active articles at or below `low_stock_threshold`, with `suggestedQuantity`.
9. **Calendar feed:** `GET /api/calendar/<secret>.ics` returns `text/calendar` containing:
   - **conventions:** each *interested*, *applied* or *booked* one as an all-day event `<name> (<status>)` from `starts_on` to `ends_on` (DTEND is exclusive), with LOCATION `venue, city` and DESCRIPTION hall and table;
   - **deadlines:** `Applications close: <name>` as an all-day event on `applications_close`;
   - **setup:** `Setup: <name>` as a one-hour timed event at `setup_at`.

   Rejected and cancelled conventions are left out. Text is escaped and lines are folded at 75 octets, as RFC 5545 requires. A wrong secret gets a 404. Settings shows the link with *Copy calendar link* and the iPhone hint.
10. **Offline:**
    - The calendar shows the last loaded list from local storage, with `Saved copy from <time>`.
    - Editing, the status buttons and *Mark fee paid* are disabled with `Needs a connection`.
    - The Notifications settings that need the server are disabled the same way.
11. **Errors:**
    - **Failed save:** a toast, and the sheet stays open.
    - **Missing collection** (404 or 403): `The calendar isn't set up on the server yet`.
    - **Job failures:** logged and shown in the status line, then retried on the next run.
12. **Layout:** works at 375px with 44px tap targets, no horizontal scroll, and correct colours in light and dark mode.

## Data model (PocketBase 0.22)

### `conventions` (new)

| Field | Type | Rules |
|---|---|---|
| `name` | text | required |
| `city`, `venue`, `hall`, `table` | text | optional |
| `starts_on`, `ends_on` | date | optional, so an application can exist before its dates are known. Booking needs both. |
| `status` | select | `interested`, `applied`, `booked`, `rejected`, `cancelled`, required |
| `applications_open`, `applications_close`, `results_expected` | date | optional |
| `setup_at` | date | optional, a date with time |
| `stand_fee` | number | optional, ≥ 0 |
| `fee_paid_at` | date | optional |
| `fee_transaction` | text | optional, the expense's record id |
| `reminders` | json (`maxSize` 200000) | `[{ id, kind: 'deadline'\|'stock'\|'pack'\|'setup'\|'custom', at: ISO, text?, auto: boolean, sent_at?: ISO, skipped?: true, missed?: true }]` |

### `push_subscriptions` (new)

| Field | Type | Rules |
|---|---|---|
| `endpoint` | url | required, unique index |
| `keys` | json | `{ p256dh, auth }`, required |
| `device` | text | optional, e.g. `iPhone` |

### Rules

New collections start locked, as before. `--apply-rules` sets:
- **`conventions`:** list, view and update `O || N`; create and delete `O`.
- **`push_subscriptions`:** list, view and delete `O || N`; create `O`; update `null`.

`O` is the existing owner rule. `N` is `@request.auth.collectionName = "users" && @request.auth.id = "<notifierId>"`. `--apply-rules` gains `--notifier <email>`, which looks the account up in `users` the way `--owner <email>` does. Once the notifier exists, `users` holds two accounts, so `--owner` becomes required, and the script stops with a clear message when it is missing. Without `--notifier`, the rules are `O` only, as today.

The notifier also reads active articles, which are already public, and nothing else.

## Pure logic (`utils/calendar/`, unit-tested)

- **`reminders.js`:**
  - `defaultReminders(convention)` builds the `auto` reminders for its dates and status rule, in local time.
  - `syncReminders(convention, previous)` keeps sent, edited and custom reminders and recomputes the unsent `auto` ones.
  - `allowedFor(reminder, convention, now)` applies the status rule.
  - `dueReminders(conventions, now)` returns `[{ convention, reminder, action: 'send'|'skip'|'miss' }]`.
- **`messages.js`:** `messageFor({ convention, reminder, articles, now })` returns `{ title, body, url }`.
- **`ics.js`:** `calendarFeed(conventions, { now })` returns the `.ics` text.
- **`views.js`:**
  - `upcoming(conventions, now)` returns `{ openApplications, byMonth, past }`;
  - `monthGrid(year, month, conventions)` returns the weeks of days with bars and dots;
  - `nextUp(conventions, now)`;
  - `displayStatus(convention, now)` gives `Done` for a booked convention that is past.

## Server (Nitro, inside the existing Nuxt process)

- **`server/utils/notifier.js`:** the PocketBase client for the notifier account. It logs in from the env, re-authenticates on 401, and has a `pocketbase@0.21.5` SDK instance of its own.
- **`server/plugins/reminders.js`:**
  - runs every 5 minutes, only when the env is complete;
  - loads conventions with unsent reminders, the active articles and the subscriptions;
  - sends with `web-push`, then writes `sent_at`;
  - keeps `{ lastRun, lastError }` in memory.
- **Routes the owner calls:** `server/api/push/test.post.js`, `server/api/push/status.get.js` and `server/api/calendar/link.get.js`.
  - Each verifies the caller's `Authorization` PocketBase token by listing `push_subscriptions` or `conventions` with it against PocketBase, which only the owner (or the notifier) may do.
  - Without a valid token they return 401.
- **`server/routes/api/calendar/[file].get.js`:** serves `<secret>.ics`. The secret is compared in constant time.
- **Env** (server-only, in `/opt/budget-tracker/shared/akinai.env`):
  - `NOTIFIER_EMAIL`, `NOTIFIER_PASSWORD`
  - `VAPID_PRIVATE_KEY`, `VAPID_SUBJECT` (`mailto:` address)
  - `CALENDAR_SECRET`
  - `NUXT_PUBLIC_VAPID_PUBLIC_KEY` (public by design)
- **Loading the env:** `ecosystem.config.cjs` adds `node_args: --env-file=<path>` only when the file exists, and sets `TZ=Europe/Berlin`. Node 20.20 on the server supports `--env-file`.
- **New dependency:** `web-push`.
- **Service worker:** `public/push-sw.js`, loaded by Workbox `importScripts`. It handles `push` (`showNotification`) and `notificationclick` (focus or open `url`).

## App changes

- `composables/useConventions.js`: list, create, update, delete, plus `markFeePaid` through `useTransactions().addTransaction`.
- `composables/usePushNotifications.js`: support check, permission, subscribe and unsubscribe, test, status, calendar link.
- `pages/calendar.vue`, and `components/calendar/UpcomingList.vue`, `MonthGrid.vue`, `ConventionSheet.vue`, `ReminderEditor.vue`.
- `components/NextUpCard.vue` on the dashboard.
- Settings: a new **Notifications** category.
- Navigation: `utils/navigation.js` gets Calendar, placed in the More sheet on phones.

## Migration

`planSchema` adds `conventions` and `push_subscriptions` when missing, locked. `planRules` takes an optional notifier id. `tests/unit/pb-plan.test.js` covers the ops, idempotency and the rules, with the live snapshot check holding before and after `--apply`.

## Testing

- **Unit tests:**
  - **Reminders:** default reminders, including across the 25 Oct 2026 change from summer time, so 09:00 stays local; `syncReminders` keeps edited, custom and sent reminders.
  - **Due reminders:** status gating, the 24-hour miss window, already sent.
  - **Messages:** the message texts, including the stock list limit.
  - **Feed:** `.ics` escaping, all-day DTEND, folding and the excluded statuses.
  - **Views:** the month grid with weeks from Monday; the Upcoming grouping; `nextUp`; Done derived.
  - **Server job:** with a fake PocketBase and a fake sender, covering sending, skipping, missing, deleting a gone subscription, and an error kept for the status line.
- **e2e** (fake PocketBase):
  - create a convention and see its reminders, then change the dates and see the reminders move;
  - the status buttons;
  - *Mark fee paid* posts the expense;
  - Upcoming order, the Month grid and tapping a day;
  - the More sheet link and the dashboard card;
  - the Settings flow, with `Notification` and `PushManager` stubbed;
  - offline read-only mode;
  - a missing collection;
  - the 375px sweep for `/calendar` in light and dark mode.

## Rollout (owner, with `!` commands; written into the README)

1. `npm run pb:migrate`, then `npm run pb:migrate -- --apply`.
2. Create the user `akinai-notifier` (its own email and a long random password) in the PocketBase admin. Then run `npm run pb:migrate -- --apply-rules --owner <your email> --notifier <notifier email>`.
3. `npx web-push generate-vapid-keys`. Then write `/opt/budget-tracker/shared/akinai.env` on the server, mode 600, owned by `deploy`.
4. Deploy. Then on each phone: Settings → Notifications → turn on, send a test, copy the calendar link.

## README

The whole README is rewritten in the style of the other repos:
- the header, as already done;
- what Akinai does: sales, catalog and deals, commissions, the print board, Reports, the calendar and reminders, the business card;
- setup;
- PocketBase and migrations;
- deploy and the env file;
- credits.

## Out of scope

- Reminders for answers and payments.
- Links and notes on conventions.
- Several owners or per-device feeds.
- Recurring conventions and copying last year's convention.
- Email or SMS reminders.
- A convention's profit (takings minus fee) in Reports.
