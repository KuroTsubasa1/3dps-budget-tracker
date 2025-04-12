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