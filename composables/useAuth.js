import { ref, computed } from 'vue'
import { usePocketBase } from './usePocketBase'

const user = ref(null)
let listening = false

export const useAuth = () => {
  const pb = usePocketBase()

  if (import.meta.client && !listening) {
    listening = true
    pb.authStore.onChange(() => {
      user.value = pb.authStore.isValid ? pb.authStore.model : null
    })
  }

  const isOwner = computed(() => user.value?.collectionName === 'users')

  // Called from app.vue's onMounted so the server and the first client render agree (logged-out UI)
  const restoreSession = async () => {
    user.value = pb.authStore.isValid ? pb.authStore.model : null
    if (!user.value || !navigator.onLine) return
    try {
      await pb.collection('users').authRefresh()
    } catch (error) {
      // Only a rejected token ends the session; network trouble keeps it for offline selling
      if (error.status === 401) pb.authStore.clear()
    }
  }

  const login = (email, password) => pb.collection('users').authWithPassword(email, password)
  const logout = () => pb.authStore.clear()

  return { user, isOwner, restoreSession, login, logout }
}
