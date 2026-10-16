<template>
  <BaseCard title="Card terminal" subtitle="The SumUp Solo that takes card payments" icon="credit-card">
    <div class="space-y-4">
      <p v-if="error" role="alert" class="rounded-lg bg-expense/10 px-3 py-2 text-sm text-expense">{{ error }}</p>

      <p v-if="offline" class="rounded-lg bg-muted px-3 py-2 text-sm text-ink-muted">Needs a connection</p>
      <p v-else-if="!state" class="text-sm text-ink-muted">Loading the terminal...</p>
      <p v-else-if="!state.configured" class="text-sm text-ink-muted">Card payments aren't configured on the server</p>

      <template v-else-if="state.paired && state.reader">
        <div class="flex min-w-0 items-center justify-between gap-3">
          <div class="min-w-0">
            <p class="truncate text-sm font-medium text-ink" data-testid="card-reader-name">{{ state.reader.name }}</p>
            <p class="text-sm" :class="STATUS_CLASS[state.reader.status] ?? 'text-ink-muted'" data-testid="card-reader-status">{{ STATUS_LABEL[state.reader.status] ?? 'Status unknown' }}</p>
          </div>
          <BaseButton variant="danger-ghost" class="shrink-0" :loading="busy" @click="run(unpair, 'Terminal unpaired')">Unpair</BaseButton>
        </div>
      </template>

      <form v-else class="space-y-2" novalidate @submit.prevent="pairNow">
        <label for="card-pairing-code" class="label">Pairing code</label>
        <input
          id="card-pairing-code"
          v-model="code"
          type="text"
          class="input uppercase tracking-widest"
          autocomplete="off"
          autocapitalize="characters"
          spellcheck="false"
          maxlength="12"
        >
        <p class="hint">On the Solo, open Connections → API → Connect: it shows the code. The code expires after 5 minutes.</p>
        <BaseButton type="submit" block icon="credit-card" :loading="busy">Pair terminal</BaseButton>
      </form>
    </div>
  </BaseCard>
</template>

<script setup>
import { ref, onMounted, onBeforeUnmount } from 'vue'
import { useCardPayments } from '~/composables/useCardPayments'
import { useToast } from '~/composables/useToast'

const STATUS_LABEL = { online: 'Online', offline: 'Offline', unknown: 'Status unknown' }
const STATUS_CLASS = { online: 'text-income', offline: 'text-expense' }
const UNREACHABLE = 'Could not reach the server. Try again later.'

const { terminal, pair, unpair } = useCardPayments()
const { toast } = useToast()

const state = ref(null)
const offline = ref(false)
const busy = ref(false)
const error = ref('')
const code = ref('')

const messageOf = err => (err?.statusCode === 401 ? 'Log in again to manage the terminal' : err?.data?.message || UNREACHABLE)

const load = async () => {
  offline.value = !navigator.onLine
  error.value = ''
  if (offline.value) return
  try {
    state.value = await terminal()
  } catch (err) {
    error.value = messageOf(err)
  }
}

const run = async (action, done) => {
  if (busy.value) return
  busy.value = true
  error.value = ''
  try {
    state.value = await action()
    toast(done)
  } catch (err) {
    error.value = messageOf(err)
  } finally {
    busy.value = false
  }
}

// The server checks the code too; this only catches an empty field without a round trip
const pairNow = () => {
  if (!code.value.trim()) {
    error.value = 'Enter the code the Solo shows'
    return
  }
  run(async () => {
    const result = await pair(code.value)
    code.value = ''
    return result
  }, 'Terminal paired')
}

const wentOffline = () => { offline.value = true }

onMounted(() => {
  window.addEventListener('online', load)
  window.addEventListener('offline', wentOffline)
  load()
})

onBeforeUnmount(() => {
  window.removeEventListener('online', load)
  window.removeEventListener('offline', wentOffline)
})
</script>
