import { usePocketBase } from '~/composables/usePocketBase'

// The session lives in localStorage, so only the client can decide: the server renders,
// then this runs again during hydration and redirects
export default defineNuxtRouteMiddleware((to) => {
  if (import.meta.server) return
  if (!usePocketBase().authStore.isValid) {
    return navigateTo({ path: '/login', query: { redirect: to.fullPath } })
  }
})
