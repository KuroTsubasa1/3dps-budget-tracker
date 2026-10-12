# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Build Commands
- `npm run dev` - Start development server
- `npm run build` - Build for production
- `npm run generate` - Generate static site
- `npm run preview` - Preview production build

## Code Style Guidelines
- Vue 3 Composition API with `<script setup>` syntax
- Use Tailwind utility classes and component classes (defined in assets/css/main.css). Colours come from the semantic tokens (`surface`, `card`, `muted`, `line`, `ink`, `ink-muted`, `accent`, `income`, `expense`), which switch automatically in dark mode. Don't use raw gray/blue classes or `darkMode` ternaries.
- Mobile-first: phones get the bottom tab bar and bottom sheets (`BottomSheet`), and `lg+` renders panels inline (`useMediaQuery`). Keep tap targets ≥ 44px. `npx playwright test --project=mobile` runs the suite on a Pixel 7.
- Format currency values using the `formatCurrency()` utility (Euro/€)
- Use composables pattern for reusable logic (located in `/composables` directory)
- Component naming: PascalCase for SFCs
- CSS class naming: Use consistent BEM-like patterns from existing components
- Error handling: Validate form inputs before submission with explicit error messages
- TypeScript: Leverage Vue 3's runtime type checking, extending Nuxt's tsconfig
- Formatting: 2 space indentation, single quotes for strings
- Imports ordering: Vue core libraries first, then composables, then utilities

Always follow existing patterns when adding new code to maintain consistency.