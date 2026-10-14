# 3DPS Budget Tracker

A modern, comprehensive budget tracking application built with Vue.js and Nuxt.js. This application helps 3D printing shop owners manage their finances by tracking income and expenses, with special features for calculating savings, managing product catalogs, and creating digital business cards.

## Features

### Core Functionality
- 💰 Track income and expenses with a beautiful, intuitive interface
- 📊 Real-time balance updates and transaction history
- 🗾 Automatic calculation of Japan savings (10% of total balance)
- 📱 Touch-friendly numpad for easy amount input
- 📝 Notes field for recording transaction details
- 📆 Date tracking for all transactions

### Advanced Features
- 🌐 Offline functionality with automatic sync when connection is restored
- 🔄 Synchronization with Pocketbase backend
- 🌙 Dark mode with customizable appearance
- 🔔 Notification system for important events
- 📱 Progressive Web App (PWA) support for mobile installation
- 📈 Reports and analytics dashboard
- 💱 Multiple currency support (EUR, USD, GBP)
- 🗓️ Customizable date formats

### Product Management
- 📦 Browse through a catalog of 3D printing products
- 🔍 Filter and search functionality
- 🛒 Cart functionality for easy ordering
- 🏷️ Product categorization and sorting

### Business Tools
- 💼 Customizable digital business card creator
- 🎨 Color picker and design options
- 📱 Mobile-responsive design for all devices
- 🖨️ Print and share functionality
- 📊 Financial reports with graphical visualization

## Installation

1. Clone the repository:
```bash
git clone https://github.com/yourusername/3dps-budget-tracker.git
cd 3dps-budget-tracker
```

2. Install dependencies:
```bash
npm install
```

3. Configure environment variables:
Create a `.env` file based on `.env.example` with your Pocketbase API details.

4. Start the development server:
```bash
npm run dev
```

## Usage

### Adding Transactions
1. Select transaction type (Income/Expense)
2. Enter a description for the transaction
3. Input the amount using either keyboard or the touch-friendly numpad
4. Add optional notes for context
5. Click "Add to Balance" to save

### Viewing Balances
- The main balance card shows your current available balance
- The Japan savings amount (10% of total) is automatically calculated and displayed
- Recent transactions are listed below with their details
- Toggle between today's balance and all-time balance

### Using the Catalog
- Browse through available 3D printing items in the catalog
- View detailed information about each item including price and specifications
- Use the catalog to quickly add common expenses to your budget tracker
- Filter and search functionality to easily find specific items

### Creating Business Cards
- Design custom digital business cards for your 3D printing business
- Customize colors, layout, and information
- Include QR codes linking to your website
- Save, print, or share your business card

### Customizing Settings
- Change appearance with dark/light mode
- Configure API connection to Pocketbase
- Set currency and date formats
- Manage notification preferences
- Export or backup your data

## Project Structure

```
3dps-budget-tracker/
├── pages/              # Application pages (index, settings, catalog, business-card, reports)
├── components/         # Vue components (PWAInstall, etc.)
├── composables/        # Vue composables (hooks for transactions, settings, offline queue)
├── utils/              # Utility functions (currency, date formatting)
├── assets/             # Static assets and CSS
├── public/             # Public files (favicon, icons)
├── plugins/            # Nuxt plugins (darkMode.client.js)
└── server/             # Server-side code
```

## Technologies Used

- Vue.js 3 with Composition API
- Nuxt.js 3
- Tailwind CSS
- Pocketbase backend
- Vite PWA plugin
- LocalStorage for offline persistence
- QR code generation
- Chart.js for data visualization

## Offline Functionality

The app is designed to work offline:
1. Transactions are stored locally first
2. When offline, they're added to a sync queue
3. When connection is restored, the app automatically syncs pending transactions
4. Visual indicators show sync status and pending items

## Customization Options

### Theme
- Dark mode / Light mode
- Customizable business card colors
- Consistent design system throughout the app

### Data
- Multiple currency formats
- Different date formats
- Configurable API endpoints
- Data export/import capabilities

## Contributing

1. Fork the repository
2. Create your feature branch (`git checkout -b feature/AmazingFeature`)
3. Commit your changes (`git commit -m 'Add some AmazingFeature'`)
4. Push to the branch (`git push origin feature/AmazingFeature`)
5. Open a Pull Request

## License

This project is licensed under the MIT License - see the LICENSE file for details.

## Acknowledgments

- Thanks to all contributors who have helped shape this project
- Inspired by the need for a comprehensive budget tracking solution for 3D printing businesses

## PocketBase setup: categories, stock and owner login

The app needs PocketBase **0.22** with an owner account in the `users` collection. Schema changes are made with a script that reads your PocketBase admin login from your local `.env`. Set `POCKETBASE_ADMIN_EMAIL` and `POCKETBASE_ADMIN_PASSWORD` there (`POCKETBASE_ADMIN_TOKEN` is an optional alternative). Never prefix these with `NUXT_PUBLIC_`.

```bash
npm run pb:migrate                  # dry run: prints the plan, writes scripts/category-mapping.json
npm run pb:migrate -- --apply       # create collections (incl. deals), seed categories and deals, assign article categories
npm run pb:migrate -- --apply-rules # pin owner-only writes and close public sign-up on users
npm run pb:migrate -- --apply-rules --owner you@example.com  # if users has more than one account
```

`--apply-rules` picks the owner from `users`: the only account, or the one named with `--owner`. Public sign-up on `users` is closed by the same step.

Order matters:
1. Run `--apply`. The deployed app keeps working.
2. Deploy the new app.
3. Run `--apply-rules` (add `--owner <email>` if `users` has more than one account). The old shared API token then stops working.

Run `--apply-rules` right after the new app is live, before selling or editing anything. Until then the new app cannot save sales, stock or categories.
Updating from an earlier version: re-run `npm run pb:migrate -- --apply` (creates and seeds `deals`) before deploying this build, then `--apply-rules` to open deal editing to the owner.

Rollout for the multi-article commissions release: run `npm run pb:migrate` (dry run, it should list the commissions to convert), then `npm run pb:migrate -- --apply`, then deploy right away. Don't edit commissions on a device until it has loaded the new app (reload an installed PWA once).

Afterwards, make one test sale and check it appears in PocketBase.

Each run writes the resulting schema to `pocketbase/schema.json`.

## Deployment (GitHub Actions → VPS)

Every push to `main` runs `.github/workflows/deploy.yml`, which can also be started by hand under Actions → Deploy → Run workflow. It does the following:
1. Installs the dependencies, runs the unit tests and builds the app.
2. Uploads the build to `/opt/budget-tracker/releases/<commit>` on the VPS and points `/opt/budget-tracker/current` at it.
3. Restarts it with pm2 (`ecosystem.config.cjs`: process `budget-tracker`, listening on `127.0.0.1:3000`).
4. Checks that https://budget-tracker.lasseharm.space answers.

The 5 newest releases are kept on the server.

**One-time server setup** (as root, for the `deploy` user):
1. Install Node 20 or newer and pm2 for `deploy`:
   ```bash
   npm i -g pm2
   ```
2. Create the app folder and hand it to `deploy`:
   ```bash
   mkdir -p /opt/budget-tracker && chown deploy:deploy /opt/budget-tracker
   ```
3. Make pm2 start the app after a reboot. Run `pm2 startup` as `deploy`, then run the command it prints as root.
4. Point nginx for `budget-tracker.lasseharm.space` at `http://127.0.0.1:3000` (`proxy_pass`, plus the usual `proxy_set_header Host $host;` and the `X-Forwarded-*` headers).
5. Put the public half of a key made only for GitHub into `/home/deploy/.ssh/authorized_keys`.

**Repository secrets** (Settings → Secrets and variables → Actions):

| Secret | Value |
|---|---|
| `DEPLOY_SSH_KEY` | the private half of that key |
| `DEPLOY_HOST` | `46.101.138.222` |
| `DEPLOY_USER` | `deploy` |
| `DEPLOY_KNOWN_HOSTS` | the output of `ssh-keyscan -t ed25519 46.101.138.222` (pins the server's identity) |

**Rollback:** start an older release:
```bash
pm2 delete budget-tracker
pm2 start /opt/budget-tracker/releases/<older-commit>/ecosystem.config.cjs
pm2 save
```

Schema changes are not part of the deploy: run `npm run pb:migrate` yourself first, as described above.
