<template>
  <div>
    <PageHeader title="Settings" subtitle="Configure your application preferences" />

    <div class="md:grid md:grid-cols-[16rem_minmax(0,1fr)] md:items-start md:gap-6">
      <nav v-if="isWide || !activeCategory" class="card overflow-hidden" aria-label="Settings sections">
        <div class="divide-y divide-line">
          <ListRow
            v-for="category in SETTINGS_CATEGORIES"
            :key="category.id"
            clickable
            :title="category.name"
            :subtitle="category.description"
            :icon="category.icon"
            :icon-class="activeCategory === category.id ? 'bg-accent/10 text-accent' : 'bg-muted text-ink-muted'"
            :aria-current="activeCategory === category.id ? 'true' : undefined"
            @click="openCategory(category.id)"
          />
        </div>
      </nav>

      <section v-if="activeCategory" :id="activeCategory" class="scroll-mt-20">
        <button
          v-if="!isWide"
          type="button"
          class="-ml-2 mb-2 flex min-h-[44px] items-center gap-1 rounded-lg px-2 text-sm font-medium text-accent"
          @click="backToList"
        >
          <AppIcon name="chevron-left" class="h-4 w-4" />
          All settings
        </button>

        <BaseCard v-if="activeCategory === 'account'" title="Account Settings" subtitle="Manage your personal information" icon="user">
          <form class="space-y-4" @submit.prevent="handleSaveAccountSettings">
            <div>
              <label for="account-name" class="label">Display Name</label>
              <input id="account-name" v-model="accountSettings.displayName" type="text" class="input" placeholder="Enter your display name">
            </div>
            <div>
              <label for="account-email" class="label">Email Address</label>
              <input id="account-email" v-model="accountSettings.email" type="email" class="input" placeholder="Enter your email address">
            </div>
            <div>
              <p class="label">Profile Picture</p>
              <div class="flex items-center gap-3">
                <div class="flex h-14 w-14 items-center justify-center rounded-full bg-muted text-ink-muted">
                  <AppIcon name="user" class="h-7 w-7" />
                </div>
                <BaseButton variant="ghost">Change</BaseButton>
              </div>
            </div>
            <BaseButton type="submit" block icon="check">Save Account Settings</BaseButton>
          </form>
        </BaseCard>

        <BaseCard v-if="activeCategory === 'api'" title="API Configuration" subtitle="Server and owner login" icon="code">
          <dl class="space-y-3 text-sm">
            <div>
              <dt class="text-ink-muted">PocketBase server</dt>
              <dd class="break-all font-medium text-ink">{{ pocketbaseUrl }}</dd>
            </div>
            <div>
              <dt class="text-ink-muted">Logged in as</dt>
              <dd class="font-medium text-ink">{{ user?.email || 'Not logged in' }}</dd>
            </div>
          </dl>
          <BaseButton class="mt-4" variant="secondary" block icon="x" @click="handleLogout">Log out</BaseButton>
        </BaseCard>

        <BaseCard v-if="activeCategory === 'display'" title="Display Settings" subtitle="Customize the application appearance" icon="desktop">
          <form class="space-y-5" @submit.prevent="handleSaveDisplaySettings">
            <div>
              <p class="label">Currency Format</p>
              <SegmentedControl v-model="displaySettings.currencyFormat" label="Currency Format" dense :options="CURRENCY_OPTIONS" />
            </div>
            <div>
              <p class="label">Date Format</p>
              <SegmentedControl v-model="displaySettings.dateFormat" label="Date Format" dense :options="DATE_FORMAT_OPTIONS" />
            </div>
            <div class="divide-y divide-line border-y border-line">
              <ToggleSwitch v-model="displaySettings.darkMode" label="Dark Mode" />
              <ToggleSwitch v-model="displaySettings.showHeaderBalance" label="Show Balance in Header" />
            </div>
            <BaseButton type="submit" block icon="check">Save Display Settings</BaseButton>
          </form>
        </BaseCard>

        <BaseCard v-if="activeCategory === 'notifications'" title="Notification Settings" subtitle="Configure when and how you receive alerts" icon="bell">
          <form class="space-y-5" @submit.prevent="handleSaveNotificationSettings">
            <ToggleSwitch
              v-model="notificationSettings.pushEnabled"
              label="Push Notifications"
              description="Receive notifications even when the app is closed"
            />
            <div>
              <p class="label">Notify me about</p>
              <div class="divide-y divide-line border-y border-line">
                <ToggleSwitch v-model="notificationSettings.newTransactions" label="New transactions" :disabled="!notificationSettings.pushEnabled" />
                <ToggleSwitch v-model="notificationSettings.syncCompleted" label="Sync completion" :disabled="!notificationSettings.pushEnabled" />
                <ToggleSwitch v-model="notificationSettings.balanceUpdates" label="Balance updates" :disabled="!notificationSettings.pushEnabled" />
              </div>
            </div>
            <BaseButton type="submit" block icon="check" :disabled="!notificationSettings.pushEnabled">Save Notification Settings</BaseButton>
          </form>
        </BaseCard>

        <BaseCard v-if="activeCategory === 'data'" title="Data Management" subtitle="Export and backup your financial data" icon="database">
          <div class="space-y-6">
            <div>
              <h3 class="text-sm font-semibold text-ink">Export Data</h3>
              <p class="mb-3 text-xs text-ink-muted">Download a copy of all your transactions and settings</p>
              <div class="grid grid-cols-2 gap-2">
                <BaseButton variant="secondary" icon="download" @click="handleExportData('json')">Export as JSON</BaseButton>
                <BaseButton variant="secondary" icon="download" @click="handleExportData('csv')">Export as CSV</BaseButton>
              </div>
            </div>

            <div class="border-t border-line pt-5">
              <h3 class="text-sm font-semibold text-ink">Data Synchronization</h3>
              <p class="mb-3 text-xs text-ink-muted">Manage how your data syncs across devices</p>
              <div class="rounded-lg bg-muted p-4">
                <div class="mb-3 flex items-center justify-between gap-3">
                  <div class="min-w-0">
                    <p class="text-sm font-medium text-ink">Last sync</p>
                    <p class="truncate text-xs text-ink-muted">{{ lastSyncTime || 'Never' }}</p>
                  </div>
                  <BaseButton icon="refresh" :loading="queueIsSyncing" @click="syncData">
                    {{ queueIsSyncing ? 'Syncing...' : 'Sync Now' }}
                  </BaseButton>
                </div>
                <div class="h-2 overflow-hidden rounded-full bg-line">
                  <div class="h-full rounded-full bg-accent" :style="{ width: `${syncProgress}%` }" />
                </div>
                <p class="mt-1 text-right text-xs text-ink-muted">{{ syncProgress }}% complete</p>
              </div>
            </div>

            <div class="border-t border-line pt-5">
              <h3 class="text-sm font-semibold text-expense">Danger Zone</h3>
              <p class="mb-3 text-xs text-ink-muted">Permanent actions that can't be undone</p>
              <BaseButton variant="danger" block icon="trash" @click="showClearDataConfirm = true">Clear All Local Data</BaseButton>
            </div>
          </div>
        </BaseCard>
      </section>
    </div>

    <BottomSheet v-model:open="showClearDataConfirm" title="Clear All Data">
      <p class="mb-4 text-sm text-ink-muted">
        Are you sure you want to clear all local data? This action cannot be undone. All of your transactions, settings and offline data will be permanently removed.
      </p>
      <div class="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
        <BaseButton variant="secondary" @click="showClearDataConfirm = false">Cancel</BaseButton>
        <BaseButton variant="danger" @click="handleClearAllData">Delete All Data</BaseButton>
      </div>
    </BottomSheet>
  </div>
</template>

<script setup>
import { ref, computed, onMounted } from 'vue'
import { useTransactions } from '~/composables/useTransactions'
import { useAppSettings } from '~/composables/useAppSettings'
import { useAuth } from '~/composables/useAuth'
import { useOfflineQueue } from '~/composables/useOfflineQueue'
import { useMediaQuery } from '~/composables/useMediaQuery'
import { useToast } from '~/composables/useToast'

definePageMeta({ middleware: 'owner' })

const { syncStatus, syncTransactionsQueue } = useTransactions()
const { offlineQueue, isSyncing: queueIsSyncing } = useOfflineQueue()
const {
  accountSettings,
  displaySettings,
  notificationSettings,
  saveAccountSettings,
  saveDisplaySettings,
  saveNotificationSettings,
  exportData,
  clearAllData
} = useAppSettings()
const { toast } = useToast()
const { user, logout } = useAuth()
const pocketbaseUrl = useRuntimeConfig().public.pocketbaseUrl

const handleLogout = () => {
  logout()
  navigateTo('/login')
}

const SETTINGS_CATEGORIES = [
  { id: 'account', name: 'Account Settings', description: 'Manage your personal details', icon: 'user' },
  { id: 'api', name: 'API Configuration', description: 'Server and owner login', icon: 'code' },
  { id: 'display', name: 'Display Settings', description: 'Customize appearance', icon: 'desktop' },
  { id: 'notifications', name: 'Notifications', description: 'Configure alerts and reminders', icon: 'bell' },
  { id: 'data', name: 'Data Management', description: 'Export, backup or clear data', icon: 'database' }
]
const CURRENCY_OPTIONS = [
  { value: 'EUR', label: 'EUR (€)' },
  { value: 'USD', label: 'USD ($)' },
  { value: 'GBP', label: 'GBP (£)' }
]
const DATE_FORMAT_OPTIONS = [
  { value: 'DD/MM/YYYY', label: 'DD/MM/YYYY' },
  { value: 'MM/DD/YYYY', label: 'MM/DD/YYYY' },
  { value: 'YYYY-MM-DD', label: 'YYYY-MM-DD' }
]

// The active section lives in the URL hash so phones can deep link and use Back.
// The hash never reaches the server, so read it only after mount to keep hydration consistent.
const route = useRoute()
const router = useRouter()
const isWide = useMediaQuery('(min-width: 768px)')
const isMounted = ref(false)
onMounted(() => { isMounted.value = true })

const requestedCategory = computed(() => {
  if (!isMounted.value) return null
  const id = route.hash.slice(1)
  return SETTINGS_CATEGORIES.some(category => category.id === id) ? id : null
})
const activeCategory = computed(() => requestedCategory.value || (isWide.value ? 'account' : null))

const openCategory = id => router.push({ hash: `#${id}` })
const backToList = () => router.replace({ hash: '' })

// Data management state
const showClearDataConfirm = ref(false)
const lastSyncTime = ref(syncStatus.value?.lastSync ? new Date(syncStatus.value.lastSync).toLocaleString() : null)
const syncProgress = ref(0)

const syncData = async () => {
  if (queueIsSyncing.value || !syncStatus.value.isOnline || !offlineQueue.value.length) {
    return
  }

  syncProgress.value = 0
  const result = await syncTransactionsQueue()

  if (result) {
    syncProgress.value = 100
    lastSyncTime.value = new Date().toLocaleString()
    toast(`Successfully synced ${result.processed} transactions.`)
  }
}

const handleSaveAccountSettings = async () => {
  if (await saveAccountSettings()) toast('Account settings saved successfully')
}

// app.vue watches displaySettings.darkMode and applies html.dark, so saving only persists
const handleSaveDisplaySettings = async () => {
  if (await saveDisplaySettings()) toast('Display settings saved successfully')
}

const handleSaveNotificationSettings = async () => {
  if (await saveNotificationSettings()) toast('Notification settings saved successfully')
}

const handleExportData = async (format) => {
  const result = await exportData(format)
  if (result.success) {
    toast(`Data exported as ${format.toUpperCase()} successfully`)
  } else {
    toast(`Failed to export data: ${result.error}`, { tone: 'error' })
  }
}

const handleClearAllData = async () => {
  const result = await clearAllData()
  showClearDataConfirm.value = false
  if (result) {
    toast('All data cleared successfully')
  } else {
    toast('Failed to clear data', { tone: 'error' })
  }
}
</script>
