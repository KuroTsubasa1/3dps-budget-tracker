import { useTransactions } from './useTransactions'
import { useGatchaPrizes } from './useGatchaPrizes'
import { saleTransaction } from '~/utils/checkout'

// Books a sale: its transaction (sent now, or queued while offline) and, for a cart, the gatcha prizes it owes.
// Add to Balance, the Home form and an approved card payment all book through bookSale, so they book the same.
export const useCheckout = () => {
  const { addTransaction } = useTransactions()
  const { addOpenPrizes } = useGatchaPrizes()

  // payment: { paymentMethod: 'cash' | 'card', sumupTransaction?, recordId? }. Resolves once the sale is
  // stored on the server or queued; addTransaction never throws.
  const bookSale = (booking, payment) => {
    const done = addTransaction(saleTransaction(booking, payment))
    if (booking.prizes?.count) addOpenPrizes(booking.prizes)
    return done
  }

  return { bookSale }
}
