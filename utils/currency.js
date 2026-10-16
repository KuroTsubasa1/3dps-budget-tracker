export const formatCurrency = (amount, format = 'EUR') => {
  // Default mapping of currency to locale
  const localeMap = {
    'EUR': 'de-DE',
    'USD': 'en-US',
    'GBP': 'en-GB'
  }
  
  return new Intl.NumberFormat(localeMap[format] || 'en-US', {
    style: 'currency',
    currency: format
  }).format(amount)
}
// Money is kept in whole cents: 19.9 or 0.1 + 0.2 are (float noise aside), 1.005 is not
export const WHOLE_CENTS_MESSAGE = 'Enter the amount in whole cents'
export const isWholeCents = amount => Math.abs(amount * 100 - Math.round(amount * 100)) <= 1e-6
