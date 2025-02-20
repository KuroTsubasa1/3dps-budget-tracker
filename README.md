# 3DPS Budget Tracker

A modern, user-friendly budget tracking application built with Vue.js and Nuxt.js. This application helps you manage your finances by tracking income and expenses, with a special feature for automatically calculating Japan savings.

## Features

- 💰 Track income and expenses with a beautiful, intuitive interface
- 📊 Real-time balance updates and transaction history
- 🗾 Automatic calculation of Japan savings (10% of total balance)
- 📱 Touch-friendly numpad for easy amount input
- 🎨 Modern UI with responsive design
- 💶 Euro currency support with proper formatting

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

3. Start the development server:
```bash
npm run dev
```

## Usage

### Adding Transactions
1. Select transaction type (Income/Expense)
2. Enter a description for the transaction
3. Input the amount using either keyboard or the touch-friendly numpad
4. Click "Add Transaction" to save

### Viewing Balances
- The main balance card shows your current available balance
- The Japan savings amount (10% of total) is automatically calculated and displayed
- Recent transactions are listed below with their details

### Using the Catalog
- Browse through available 3D printing items in the catalog
- View detailed information about each item including price and specifications
- Use the catalog to quickly add common expenses to your budget tracker
- Filter and search functionality to easily find specific items

## Project Structure

```
3dps-budget-tracker/
├── pages/              # Application pages
├── components/         # Vue components
├── composables/        # Vue composables (hooks)
├── utils/              # Utility functions
├── assets/            # Static assets
└── public/            # Public files
```

## Technologies Used

- Vue.js 3
- Nuxt.js 3
- Tailwind CSS
- Vite

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
- Inspired by the need for a simple, effective budget tracking solution
