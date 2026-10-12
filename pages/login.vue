<template>
  <div class="mx-auto flex min-h-[70vh] max-w-sm flex-col justify-center">
    <h1 class="text-xl font-semibold text-ink">Log in</h1>
    <p class="mb-6 mt-1 text-sm text-ink-muted">Owner account for Budget Tracker</p>
    <form class="space-y-4" novalidate @submit.prevent="submit">
      <p v-if="error" role="alert" class="rounded-lg bg-expense/10 px-3 py-2 text-sm text-expense">{{ error }}</p>
      <div>
        <label for="login-email" class="label">Email</label>
        <input id="login-email" v-model="email" type="email" class="input" autocomplete="username">
      </div>
      <div>
        <label for="login-password" class="label">Password</label>
        <input id="login-password" v-model="password" type="password" class="input" autocomplete="current-password">
      </div>
      <BaseButton type="submit" size="lg" block :loading="busy">Log in</BaseButton>
    </form>
  </div>
</template>

<script setup>
import { ref } from 'vue'
import { useAuth } from '~/composables/useAuth'

definePageMeta({ chromeless: true })

const route = useRoute()
const { login } = useAuth()

const email = ref('')
const password = ref('')
const error = ref('')
const busy = ref(false)

// Only same-site paths: "//host" and absolute URLs would send the owner elsewhere
const redirectTarget = () => {
  const target = route.query.redirect
  return typeof target === 'string' && target.startsWith('/') && !target.startsWith('//') ? target : '/'
}

const submit = async () => {
  error.value = ''
  if (!email.value.trim() || !password.value) {
    error.value = 'Enter your email and password'
    return
  }
  busy.value = true
  try {
    await login(email.value.trim(), password.value)
    await navigateTo(redirectTarget(), { replace: true })
  } catch (err) {
    error.value = err.status === 400 ? 'Wrong email or password' : 'Could not reach the server. Check your connection.'
  } finally {
    busy.value = false
  }
}
</script>
