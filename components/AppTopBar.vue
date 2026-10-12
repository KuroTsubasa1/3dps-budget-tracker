<template>
  <header class="sticky top-0 z-30 border-b border-line bg-card pt-safe print:hidden">
    <div class="mx-auto flex h-14 max-w-6xl items-center justify-between gap-3 px-4 md:px-6">
      <div class="flex min-w-0 items-baseline gap-2">
        <span class="text-base font-semibold text-ink md:hidden">Budget Tracker</span>
        <span v-if="accountSettings.displayName" class="hidden truncate text-sm text-ink-muted sm:inline">
          {{ accountSettings.displayName }}
        </span>
      </div>
      <p
        v-if="displaySettings.showHeaderBalance"
        class="shrink-0 text-sm font-semibold tabular-nums"
        :class="earnings >= 0 ? 'text-income' : 'text-expense'"
        data-testid="header-balance"
      >
        <span class="sr-only">Current balance: </span>{{ formatCurrency(earnings, displaySettings.currencyFormat) }}
      </p>
    </div>
  </header>
</template>

<script setup>
import { useTransactions } from '~/composables/useTransactions'
import { useAppSettings } from '~/composables/useAppSettings'
import { formatCurrency } from '~/utils/currency'

const { earnings } = useTransactions()
const { accountSettings, displaySettings } = useAppSettings()
</script>
