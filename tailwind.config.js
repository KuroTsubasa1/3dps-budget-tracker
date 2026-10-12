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
