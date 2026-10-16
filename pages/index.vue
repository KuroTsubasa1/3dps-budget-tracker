<template>
  <div class="pb-20 lg:pb-0">
    <PageHeader title="Dashboard" />
    <NetworkBanner class="mb-4" />

    <div class="grid gap-4 lg:grid-cols-[minmax(0,1fr)_24rem] lg:items-start">
      <div class="min-w-0 space-y-4">
        <BaseCard title="Balance Summary" icon="cash">
          <p class="text-xs font-medium uppercase tracking-wide text-ink-muted">Total Balance</p>
          <p class="mt-1 text-3xl font-semibold tabular-nums" :class="moneyClass(earnings)">{{ formatMoney(earnings) }}</p>
          <p class="mt-1 text-sm text-ink-muted">
            Japan Balance (10%)
            <span class="font-semibold tabular-nums" :class="moneyClass(earnings)">{{ formatMoney(earnings * 0.1) }}</span>
          </p>
          <div class="mt-4 grid grid-cols-2 gap-3 border-t border-line pt-4">
            <div class="min-w-0">
              <p class="text-xs text-ink-muted">Today's Total</p>
              <p class="truncate text-lg font-semibold tabular-nums" :class="moneyClass(todayEarnings)">{{ formatMoney(todayEarnings) }}</p>
            </div>
            <div class="min-w-0">
              <p class="text-xs text-ink-muted">Today's Japan (10%)</p>
              <p class="truncate text-lg font-semibold tabular-nums" :class="moneyClass(todayEarnings)">{{ formatMoney(todayEarnings * 0.1) }}</p>
            </div>
          </div>
        </BaseCard>

        <NuxtLink
          v-if="orphans.length > 0"
          to="/settings#data"
          class="card flex min-h-[56px] items-center justify-between gap-3 px-4 text-sm font-medium text-ink hover:bg-muted md:px-5"
        >
          <span class="flex items-center gap-3">
            <AppIcon name="clipboard" class="h-5 w-5 text-expense" />
            {{ orphans.length }} local {{ orphans.length === 1 ? 'entry is' : 'entries are' }} not on the server — review in Settings
          </span>
          <AppIcon name="chevron-right" class="h-4 w-4 text-ink-muted" />
        </NuxtLink>

        <NuxtLink
          v-if="openCommissions > 0"
          to="/commissions"
          class="card flex min-h-[56px] items-center justify-between gap-3 px-4 text-sm font-medium text-ink hover:bg-muted md:px-5"
        >
          <span class="flex items-center gap-3">
            <AppIcon name="clipboard" class="h-5 w-5 text-ink-muted" />
            {{ openCommissions }} open {{ openCommissions === 1 ? 'commission' : 'commissions' }}
          </span>
          <AppIcon name="chevron-right" class="h-4 w-4 text-ink-muted" />
        </NuxtLink>

        <NuxtLink
          v-if="toPrintCount > 0"
          to="/print-board"
          class="card flex min-h-[56px] items-center justify-between gap-3 px-4 text-sm font-medium text-ink hover:bg-muted md:px-5"
        >
          <span class="flex items-center gap-3">
            <AppIcon name="printer" class="h-5 w-5 text-ink-muted" />
            {{ toPrintCount }} to print
          </span>
          <AppIcon name="chevron-right" class="h-4 w-4 text-ink-muted" />
        </NuxtLink>

        <NextUpCard />

        <BaseCard title="Recent Transactions" icon="clipboard" flush>
          <template #actions>
            <NuxtLink to="/reports" class="btn-link">View All</NuxtLink>
          </template>
          <div v-if="sortedTransactions.length === 0" class="px-4 py-10 text-center">
            <p class="text-sm font-medium text-ink">No transactions yet</p>
            <p class="mt-1 text-sm text-ink-muted">
              {{ isDesktop ? 'Use the form to add your first transaction' : 'Tap + to add your first transaction' }}
            </p>
          </div>
          <div v-else class="divide-y divide-line">
            <ListRow
              v-for="transaction in sortedTransactions"
              :key="transaction.recordId || transaction.id"
              :title="transaction.description"
              :subtitle="transactionSubtitle(transaction)"
              :icon="transaction.amount < 0 ? 'minus' : 'plus'"
              :icon-class="transaction.amount < 0 ? 'bg-expense/10 text-expense' : 'bg-income/10 text-income'"
            >
              <template #trailing>
                <span class="shrink-0 text-sm font-semibold tabular-nums" :class="moneyClass(transaction.amount)">
                  {{ transaction.amount < 0 ? '-' : '+' }}{{ formatMoney(Math.abs(transaction.amount)) }}
                </span>
              </template>
            </ListRow>
          </div>
        </BaseCard>
      </div>

      <BaseCard v-if="isDesktop" title="Add Transaction" icon="plus" class="lg:sticky lg:top-20">
        <TransactionForm />
      </BaseCard>
    </div>

    <template v-if="!isDesktop">
      <button
        type="button"
        aria-label="Add transaction"
        class="fixed right-4 z-30 flex h-14 w-14 items-center justify-center rounded-full bg-accent text-white shadow-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/50 bottom-above-nav md:bottom-6 md:right-6"
        @click="isFormOpen = true"
      >
        <AppIcon name="plus" class="h-6 w-6" />
      </button>
      <BottomSheet v-model:open="isFormOpen" title="Add Transaction">
        <TransactionForm @saved="isFormOpen = false" />
      </BottomSheet>
    </template>
  </div>
</template>

<script setup>
import { ref, computed, watch, onMounted } from 'vue'
import { useTransactions } from '~/composables/useTransactions'
import { useAppSettings } from '~/composables/useAppSettings'
import { useMediaQuery } from '~/composables/useMediaQuery'
import { useCardPayments } from '~/composables/useCardPayments'
import { useCommissions } from '~/composables/useCommissions'
import { usePrintJobs } from '~/composables/usePrintJobs'
import { formatCurrency } from '~/utils/currency'
import { formatDate } from '~/utils/date'
import { buildBoard } from '~/utils/printBoard'

definePageMeta({ middleware: 'owner' })

const { transactions, orphans, earnings, todayEarnings } = useTransactions()
const { displaySettings } = useAppSettings()
const { listCommissions, anonymiseDue } = useCommissions()
const { loadBoardData } = usePrintJobs()
const openCommissions = ref(0)
const toPrintCount = ref(0)

const { startCardBooking } = useCardPayments()

// One commissions fetch feeds the open count, the DSGVO wipe and the print-board count
onMounted(async () => {
  // Card payments approved while the app was closed or offline are booked now, and when the connection returns
  startCardBooking()
  let list
  try {
    list = await listCommissions()
  } catch {
    // No commissions collection yet (before the migration) or offline: both cards simply stay hidden
    return
  }
  openCommissions.value = list.filter(item => ['open', 'printing', 'ready'].includes(item.status)).length
  // DSGVO wipe also runs here, so it happens even if the Commissions page is never opened
  anonymiseDue(list).catch(() => {})
  try {
    toPrintCount.value = buildBoard({ ...(await loadBoardData(list)), now: new Date() }).toPrint.length
  } catch {
    // Offline or a failed load: the link quietly stays hidden
  }
})

const isDesktop = useMediaQuery('(min-width: 1024px)')
const isFormOpen = ref(false)
// The sheet is dropped at lg+; don't let it reappear (unlocked) when the screen shrinks again
watch(isDesktop, (desktop) => { if (desktop) isFormOpen.value = false })

const formatMoney = amount => formatCurrency(amount, displaySettings.value.currencyFormat || 'EUR')
const moneyClass = amount => (amount < 0 ? 'text-expense' : 'text-income')

// Newest first: the list is kept oldest first (by date, then creation order)
const sortedTransactions = computed(() => [...transactions.value].reverse())

const transactionSubtitle = transaction =>
  [formatDate(transaction.date, displaySettings.value.dateFormat || 'DD/MM/YYYY'), transaction.notes]
    .filter(Boolean)
    .join(' · ')
</script>
