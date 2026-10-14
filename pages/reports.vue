<template>
  <div>
    <PageHeader title="Financial Reports" subtitle="Analyze your income and expense trends">
      <template #actions>
        <BaseButton variant="secondary" icon="refresh" aria-label="Refresh Data" @click="refreshData">
          <span class="hidden sm:inline">Refresh Data</span>
        </BaseButton>
      </template>
    </PageHeader>

    <div class="no-scrollbar -mx-4 mb-4 flex gap-2 overflow-x-auto px-4 md:mx-0 md:flex-wrap md:px-0" role="group" aria-label="Time period">
      <button
        v-for="period in timePeriods"
        :key="period.value"
        type="button"
        class="chip"
        :class="selectedPeriod === period.value ? 'chip-active' : 'chip-idle'"
        :aria-pressed="selectedPeriod === period.value"
        @click="selectedPeriod = period.value"
      >
        {{ period.label }}
      </button>
    </div>

    <div v-if="selectedPeriod === 'custom'" class="mb-4 grid gap-3 md:grid-cols-2">
      <div>
        <label for="report-start" class="label">Start Date</label>
        <input id="report-start" v-model="customDateRange.start" type="date" class="input">
      </div>
      <div>
        <label for="report-end" class="label">End Date</label>
        <input id="report-end" v-model="customDateRange.end" type="date" class="input">
      </div>
    </div>

    <div class="mb-4 grid grid-cols-2 gap-3 md:grid-cols-3 md:gap-4">
      <div v-for="kpi in kpis" :key="kpi.label" class="card min-w-0 p-4" :class="{ 'col-span-2 md:col-span-1': kpi.wide }">
        <p class="text-xs font-medium text-ink-muted">{{ kpi.label }}</p>
        <p class="mt-1 truncate text-xl font-semibold tabular-nums md:text-2xl" :class="kpi.valueClass">{{ formatCurrency(kpi.value) }}</p>
        <p class="mt-1 text-xs text-ink-muted">
          <span class="font-medium" :class="(kpi.change >= 0) === kpi.goodWhenUp ? 'text-income' : 'text-expense'">
            {{ kpi.change >= 0 ? '+' : '' }}{{ kpi.change }}%
          </span>
          from previous period
        </p>
      </div>
    </div>

    <div class="mb-4 grid gap-4 lg:grid-cols-2">
      <BaseCard v-for="chart in TREND_CHARTS" :key="chart.title" :title="chart.title" :subtitle="chart.subtitle" :icon="chart.icon">
        <div class="flex h-56 items-center justify-center rounded-lg border border-dashed border-line px-4 text-center text-sm text-ink-muted md:h-72">
          Chart would be displayed here
        </div>
      </BaseCard>
    </div>

    <div class="mb-4 grid gap-4 lg:grid-cols-3">
      <BaseCard title="Expenses by Category" subtitle="Where you spend money" icon="chart">
        <div class="flex h-56 items-center justify-center rounded-lg border border-dashed border-line px-4 text-center text-sm text-ink-muted md:h-72">
          Chart would be displayed here
        </div>
      </BaseCard>

      <BaseCard title="Top Expense Categories" subtitle="Your biggest spending areas" icon="cash" flush class="lg:col-span-2">
        <ul class="divide-y divide-line md:hidden">
          <li v-for="category in topExpenseCategories" :key="category.name" class="px-4 py-3">
            <div class="flex items-center gap-3">
              <span class="h-3 w-3 shrink-0 rounded-full" :class="category.bgColor" />
              <p class="min-w-0 flex-1 truncate text-sm font-medium text-ink">{{ category.name }}</p>
              <p class="text-sm font-semibold tabular-nums text-ink">{{ formatCurrency(Math.abs(category.amount)) }}</p>
            </div>
            <div class="mt-2 flex items-center gap-3 pl-6">
              <div class="h-1.5 flex-1 overflow-hidden rounded-full bg-muted">
                <div class="h-full rounded-full" :class="category.barColor" :style="{ width: `${category.percentage}%` }" />
              </div>
              <span class="w-10 text-right text-xs tabular-nums text-ink-muted">{{ category.percentage }}%</span>
              <span class="w-14 text-right text-xs font-medium tabular-nums" :class="category.change >= 0 ? 'text-expense' : 'text-income'">
                {{ category.change >= 0 ? '+' : '' }}{{ category.change }}%
              </span>
            </div>
          </li>
        </ul>
        <table class="hidden w-full text-sm md:table">
          <thead>
            <tr class="border-b border-line text-left text-xs font-medium uppercase tracking-wide text-ink-muted">
              <th class="px-5 py-2 font-medium">Category</th>
              <th class="px-5 py-2 font-medium">Amount</th>
              <th class="px-5 py-2 font-medium">% of Total</th>
              <th class="px-5 py-2 font-medium">Change</th>
            </tr>
          </thead>
          <tbody class="divide-y divide-line">
            <tr v-for="category in topExpenseCategories" :key="category.name">
              <td class="px-5 py-3">
                <div class="flex items-center gap-3">
                  <span class="h-3 w-3 shrink-0 rounded-full" :class="category.bgColor" />
                  <span class="font-medium text-ink">{{ category.name }}</span>
                </div>
              </td>
              <td class="px-5 py-3 tabular-nums text-ink">{{ formatCurrency(Math.abs(category.amount)) }}</td>
              <td class="px-5 py-3">
                <div class="flex items-center gap-2">
                  <div class="h-1.5 w-24 overflow-hidden rounded-full bg-muted">
                    <div class="h-full rounded-full" :class="category.barColor" :style="{ width: `${category.percentage}%` }" />
                  </div>
                  <span class="tabular-nums text-ink-muted">{{ category.percentage }}%</span>
                </div>
              </td>
              <td class="px-5 py-3 font-medium tabular-nums" :class="category.change >= 0 ? 'text-expense' : 'text-income'">
                {{ category.change >= 0 ? '+' : '' }}{{ category.change }}%
              </td>
            </tr>
          </tbody>
        </table>
      </BaseCard>
    </div>

    <BaseCard title="Recent Transactions" subtitle="For the selected period" icon="clipboard" flush>
      <template #actions>
        <BaseButton variant="link" icon="download">Export</BaseButton>
      </template>
      <div class="divide-y divide-line md:hidden">
        <ListRow
          v-for="(transaction, index) in recentTransactions"
          :key="index"
          :title="transaction.description"
          :subtitle="`${formatDate(transaction.date)} · ${transaction.amount >= 0 ? 'Income' : 'Expense'}`"
          :icon="transaction.amount >= 0 ? 'plus' : 'minus'"
          :icon-class="transaction.amount >= 0 ? 'bg-income/10 text-income' : 'bg-expense/10 text-expense'"
        >
          <template #trailing>
            <span class="shrink-0 text-sm font-semibold tabular-nums" :class="transaction.amount >= 0 ? 'text-income' : 'text-expense'">
              {{ transaction.amount >= 0 ? '+' : '' }}{{ formatCurrency(transaction.amount) }}
            </span>
          </template>
        </ListRow>
      </div>
      <table class="hidden w-full text-sm md:table">
        <thead>
          <tr class="border-b border-line text-left text-xs font-medium uppercase tracking-wide text-ink-muted">
            <th class="px-5 py-2 font-medium">Date</th>
            <th class="px-5 py-2 font-medium">Description</th>
            <th class="px-5 py-2 font-medium">Category</th>
            <th class="px-5 py-2 text-right font-medium">Amount</th>
          </tr>
        </thead>
        <tbody class="divide-y divide-line">
          <tr v-for="(transaction, index) in recentTransactions" :key="index">
            <td class="whitespace-nowrap px-5 py-3 text-ink-muted">{{ formatDate(transaction.date) }}</td>
            <td class="px-5 py-3 text-ink">{{ transaction.description }}</td>
            <td class="whitespace-nowrap px-5 py-3">
              <span
                class="rounded-full px-2 py-1 text-xs font-medium"
                :class="transaction.amount >= 0 ? 'bg-income/10 text-income' : 'bg-expense/10 text-expense'"
              >
                {{ transaction.amount >= 0 ? 'Income' : 'Expense' }}
              </span>
            </td>
            <td class="whitespace-nowrap px-5 py-3 text-right font-semibold tabular-nums" :class="transaction.amount >= 0 ? 'text-income' : 'text-expense'">
              {{ transaction.amount >= 0 ? '+' : '' }}{{ formatCurrency(transaction.amount) }}
            </td>
          </tr>
        </tbody>
      </table>
    </BaseCard>
  </div>
</template>

<script setup>
import { ref, computed } from 'vue'
import { formatCurrency } from '~/utils/currency'
import { useTransactions } from '~/composables/useTransactions'

definePageMeta({ middleware: 'owner' })

const { transactions } = useTransactions()

// Time period options
const timePeriods = [
  { label: 'This Week', value: 'week' },
  { label: 'This Month', value: 'month' },
  { label: 'Last Month', value: 'lastMonth' },
  { label: 'This Quarter', value: 'quarter' },
  { label: 'This Year', value: 'year' },
  { label: 'Custom Range', value: 'custom' }
]

// Selected period and custom date range
const selectedPeriod = ref('month')
const customDateRange = ref({
  start: new Date().toISOString().substring(0, 10),
  end: new Date().toISOString().substring(0, 10)
})

// Summary data for the selected period
const summaryData = ref({
  income: 2650.75,
  incomePercentChange: 12.5,
  expenses: -1842.30,
  expensesPercentChange: 8.2,
  netBalance: 808.45,
  netBalancePercentChange: 24.7
})

// KPI tiles; an expense increase is bad news, so its change colours the other way round
const kpis = computed(() => [
  { label: 'Total Income', value: summaryData.value.income, change: summaryData.value.incomePercentChange, goodWhenUp: true, valueClass: 'text-income' },
  { label: 'Total Expenses', value: Math.abs(summaryData.value.expenses), change: summaryData.value.expensesPercentChange, goodWhenUp: false, valueClass: 'text-expense' },
  {
    label: 'Net Balance',
    value: summaryData.value.netBalance,
    change: summaryData.value.netBalancePercentChange,
    goodWhenUp: true,
    valueClass: summaryData.value.netBalance >= 0 ? 'text-income' : 'text-expense',
    wide: true
  }
])

// Placeholders until real charts are built (out of scope for the UI overhaul)
const TREND_CHARTS = [
  { title: 'Income vs Expenses', subtitle: 'Monthly comparison', icon: 'chart' },
  { title: 'Balance Trend', subtitle: 'Over time analysis', icon: 'chart' }
]

// Top expense categories
const topExpenseCategories = ref([
  {
    name: 'Supplies',
    amount: -750.25,
    percentage: 40,
    change: 5.2,
    bgColor: 'bg-accent',
    barColor: 'bg-accent'
  },
  {
    name: 'Equipment',
    amount: -450.75,
    percentage: 24,
    change: 12.7,
    bgColor: 'bg-income',
    barColor: 'bg-income'
  },
  {
    name: 'Marketing',
    amount: -325.40,
    percentage: 18,
    change: -3.5,
    bgColor: 'bg-expense',
    barColor: 'bg-expense'
  },
  {
    name: 'Software',
    amount: -214.90,
    percentage: 12,
    change: 1.8,
    bgColor: 'bg-warning',
    barColor: 'bg-warning'
  },
  {
    name: 'Other',
    amount: -101.00,
    percentage: 6,
    change: -8.3,
    bgColor: 'bg-ink-muted',
    barColor: 'bg-ink-muted'
  }
])

// Sample recent transactions data
const recentTransactions = ref([
  {
    date: '2023-03-22',
    description: '3D Print Order - Custom Figurine',
    amount: 155.75
  },
  {
    date: '2023-03-21',
    description: 'PLA Filament Purchase',
    amount: -65.99
  },
  {
    date: '2023-03-19',
    description: '3D Model Sale - Architecture',
    amount: 220.00
  },
  {
    date: '2023-03-18',
    description: 'Printer Maintenance Parts',
    amount: -42.25
  },
  {
    date: '2023-03-17',
    description: 'Large Print Job - Engineering Parts',
    amount: 325.50
  },
  {
    date: '2023-03-15',
    description: 'Electricity Bill for Workshop',
    amount: -85.30
  },
  {
    date: '2023-03-12',
    description: 'New Nozzle Set',
    amount: -35.99
  },
  {
    date: '2023-03-10',
    description: 'Rapid Prototyping Service',
    amount: 189.75
  }
])

// Format date
const formatDate = (dateString) => {
  return new Date(dateString).toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric'
  })
}

// Refresh data based on selected period
const refreshData = () => {
  // This would normally fetch data for the selected period
  // For now, we'll just show a console message
  console.log(`Refreshing data for period: ${selectedPeriod.value}`)
  if (selectedPeriod.value === 'custom') {
    console.log(`Custom date range: ${customDateRange.value.start} to ${customDateRange.value.end}`)
  }
  
  // We would update summaryData and other metrics here
}
</script>
