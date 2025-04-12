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