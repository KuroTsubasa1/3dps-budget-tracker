// Dark mode plugin for Nuxt that sets the 'dark' class on the document
// This ensures Tailwind's dark mode works correctly

export default defineNuxtPlugin({
  name: 'dark-mode-plugin',
  enforce: 'pre', // Run before other plugins
  setup() {
    // Get settings from localStorage
    const loadDarkMode = () => {
      try {
        const settings = localStorage.getItem('budget-tracker-settings')
        if (settings) {
          const parsed = JSON.parse(settings)
          return parsed.display?.darkMode || false
        }
      } catch (error) {
        console.error('Failed to load dark mode setting:', error)
      }
      return false
    }

    // Set dark mode on initial load
    if (process.client) {
      const isDarkMode = loadDarkMode()
      if (isDarkMode) {
        document.documentElement.classList.add('dark')
      } else {
        document.documentElement.classList.remove('dark')
      }
    }
  }
})