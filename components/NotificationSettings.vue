<template>
  <div class="space-y-4">
    <BaseCard title="Notifications" subtitle="Reminders for application deadlines, stock checks and your conventions" icon="bell">
      <div class="space-y-4">
        <p class="text-sm text-ink-muted" data-testid="push-status">{{ statusLine }}</p>
        <p v-if="offline" class="rounded-lg bg-muted px-3 py-2 text-sm text-ink-muted">Needs a connection</p>
        <p v-if="error" role="alert" class="rounded-lg bg-expense/10 px-3 py-2 text-sm text-expense">{{ error }}</p>

        <p v-if="state === 'install'" class="rounded-lg bg-muted px-3 py-2 text-sm text-ink">
          On iPhone and iPad, Akinai has to be on the Home Screen first: tap Share, then Add to Home Screen, and open Akinai from there. Notifications need iOS 16.4 or newer.
        </p>
        <p v-else-if="state === 'unsupported'" class="text-sm text-ink-muted">This browser can't show notifications.</p>
        <div v-else-if="state === 'denied'" class="rounded-lg bg-muted px-3 py-2 text-sm text-ink">
          Notifications are blocked for Akinai on this device. Allow them again in the browser's site settings
          (on iPhone: Settings → Notifications → Akinai), then reload this page.
        </div>
        <template v-else-if="state === 'on'">
          <p class="text-sm font-medium text-income">Notifications are on for this device</p>
          <div class="grid gap-2 sm:grid-cols-2">
            <BaseButton variant="secondary" icon="bell" :loading="busy === 'test'" :disabled="!ready" @click="run('test', sendTest, 'Test notification sent')">Send test notification</BaseButton>
            <BaseButton variant="danger-ghost" :loading="busy === 'off'" :disabled="!ready" @click="run('off', turnOff, 'Notifications turned off on this device')">Turn off</BaseButton>
          </div>
        </template>
        <BaseButton v-else-if="state === 'off'" block icon="bell" :loading="busy === 'on'" :disabled="!ready" @click="run('on', turnOn)">
          Turn on notifications on this device
        </BaseButton>
      </div>
    </BaseCard>

    <BaseCard title="Calendar link" subtitle="Your conventions in the phone's Calendar app" icon="calendar">
      <div class="space-y-3">
        <template v-if="link">
          <label for="calendar-link" class="label">Private link</label>
          <input id="calendar-link" :value="link" type="text" class="input text-sm" readonly @focus="$event.target.select()">
          <BaseButton variant="secondary" block icon="share" @click="copyLink">Copy calendar link</BaseButton>
          <p class="hint">
            On iPhone: open Settings → Apps → Calendar → Calendar Accounts → Add Account → Other → Add Subscribed Calendar, and paste the link.
            Keep it private: anyone with the link can see your conventions.
          </p>
        </template>
        <p v-else-if="status && !status.feed" class="text-sm text-ink-muted">The calendar link isn't configured on the server</p>
        <p v-else-if="offline" class="text-sm text-ink-muted">Needs a connection</p>
        <p v-else class="text-sm text-ink-muted">Loading the link...</p>
      </div>
    </BaseCard>
  </div>
</template>

<script setup>
import { ref, computed, onMounted, onBeforeUnmount } from 'vue'
import { usePushNotifications } from '~/composables/usePushNotifications'
import { useToast } from '~/composables/useToast'
import { statusText } from '~/utils/push'

const { state, status, refreshState, loadStatus, turnOn, turnOff, sendTest, calendarLink } = usePushNotifications()
const { toast } = useToast()

const offline = ref(false)
const busy = ref('')
const error = ref('')
const link = ref('')

// The buttons need the server: online and configured
const ready = computed(() => !offline.value && !!status.value?.configured && !busy.value)
const statusLine = computed(() => (offline.value && !status.value ? '' : statusText(status.value)))

const load = async () => {
  offline.value = !navigator.onLine
  await refreshState()
  if (offline.value) return
  try {
    const current = await loadStatus()
    if (current.feed) link.value = await calendarLink()
  } catch (err) {
    error.value = err?.statusCode === 401 ? 'Log in again to manage notifications' : 'Could not reach the server. Try again later.'
  }
}

const run = async (name, action, done = '') => {
  if (busy.value) return
  busy.value = name
  error.value = ''
  try {
    await action()
    if (done) toast(done)
  } catch (err) {
    error.value = err?.statusCode === 410
      ? 'This device has to turn notifications on again'
      : err?.data?.message || err?.message || 'Something went wrong. Try again.'
    await refreshState()
  } finally {
    busy.value = ''
  }
}

const copyLink = async () => {
  try {
    await navigator.clipboard.writeText(link.value)
    toast('Calendar link copied')
  } catch {
    toast('Copy the link from the field above', { tone: 'warning' })
  }
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
