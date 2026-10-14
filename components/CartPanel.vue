<template>
  <div class="flex flex-col gap-4">
    <div class="flex items-baseline justify-between gap-3">
      <p class="text-sm text-ink-muted">{{ items.length }} items</p>
      <p class="text-2xl font-semibold tabular-nums text-ink" data-testid="cart-total">{{ formatCurrency(total) }}</p>
    </div>

    <ul v-if="items.length" class="divide-y divide-line rounded-lg border border-line">
      <li v-for="item in items" :key="item.id" class="flex items-center gap-2 py-2 pl-3 pr-1">
        <div class="min-w-0 flex-1">
          <p class="truncate text-sm font-medium text-ink">{{ item.name }}</p>
          <p class="truncate text-xs tabular-nums text-ink-muted">
            {{ formatCurrency(priceOf(item)) }} each · {{ formatCurrency(priceOf(item) * item.quantity) }}
          </p>
          <p v-if="item.quantity > item.stock" class="text-xs font-medium text-warning">
            only {{ Math.max(0, item.stock) }} in stock
          </p>
        </div>
        <QuantityStepper
          :quantity="item.quantity"
          :name="item.name"
          @increment="$emit('increment', item)"
          @decrement="$emit('decrement', item)"
        />
        <button
          type="button"
          class="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg text-ink-muted hover:bg-muted hover:text-expense"
          :aria-label="`Remove ${item.name}`"
          @click="$emit('remove', item)"
        >
          <AppIcon name="trash" class="h-4 w-4" />
        </button>
      </li>
    </ul>
    <div v-else class="rounded-lg border border-dashed border-line px-4 py-6 text-center">
      <p class="text-sm font-medium text-ink">Your cart is empty</p>
      <p class="mt-1 text-sm text-ink-muted">Select products from the catalog</p>
    </div>
    <ul v-if="applied.length" class="space-y-1 rounded-lg bg-accent/10 px-3 py-2 text-sm" aria-label="Deals applied">
      <li v-for="deal in applied" :key="deal.dealId" class="flex items-center justify-between gap-3">
        <span class="min-w-0 truncate text-ink">{{ deal.name }}</span>
        <span class="shrink-0 font-medium tabular-nums text-accent">−{{ formatCurrency(deal.saving) }}</span>
      </li>
    </ul>

    <div class="space-y-2">
      <BaseButton size="lg" block icon="cash" :disabled="!items.length" @click="$emit('submit')">
        Add to Balance
      </BaseButton>
      <BaseButton variant="secondary" block icon="clipboard" :disabled="!items.length" @click="$emit('commission')">
        Commission
      </BaseButton>
    </div>
  </div>
</template>

<script setup>
import { formatCurrency } from '~/utils/currency'

defineProps({
  items: { type: Array, required: true },
  total: { type: Number, required: true },
  priceOf: { type: Function, default: item => item.price },
  applied: { type: Array, default: () => [] }
})
defineEmits(['increment', 'decrement', 'remove', 'submit', 'commission'])
</script>
