<template>
  <div
    v-if="!syncStatus.isOnline || pendingTransactions.length"
    class="flex items-center gap-3 rounded-xl border border-line bg-card px-4 py-2"
    role="status"
  >
    <span class="h-2.5 w-2.5 shrink-0 rounded-full" :class="syncStatus.isOnline ? 'bg-income' : 'bg-expense'" />
    <div class="min-w-0 flex-1 py-1">
      <p class="text-sm font-medium text-ink">{{ syncStatus.isOnline ? 'Online' : 'Offline' }}</p>
      <p class="truncate text-xs text-ink-muted">{{ syncStatus.isOnline ? 'Connected to server' : 'Working in offline mode' }}</p>
    </div>
    <span v-if="pendingTransactions.length" class="shrink-0 rounded-full bg-amber-500/15 px-2.5 py-1 text-xs font-medium text-amber-700 dark:text-amber-300">
      {{ pendingTransactions.length }} pending
    </span>
    <BaseButton
      v-if="syncStatus.isOnline && pendingTransactions.length"
      variant="secondary"
      icon="refresh"
      :loading="queueSyncStatus === 'syncing'"
      @click="syncTransactionsQueue"
    >
      {{ queueSyncStatus === 'syncing' ? 'Syncing...' : 'Sync now' }}
    </BaseButton>
  </div>
</template>

<script setup>
import { useTransactions } from '~/composables/useTransactions'

const { syncStatus, pendingTransactions, syncTransactionsQueue, queueSyncStatus } = useTransactions()
</script>
