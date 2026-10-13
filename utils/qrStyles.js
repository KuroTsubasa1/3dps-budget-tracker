// Per-platform look for the business card QR codes: dot colours plus the icon in the middle.
// The website code keeps the shared options (green gradient, our logo). Colours are darkened
// brand tones so phones still read the dots against the white background.

const svg = markup => `data:image/svg+xml,${encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" width="100" height="100" viewBox="0 0 100 100">${markup}</svg>`)}`

// Simplified platform marks drawn as shapes, so they render the same in every browser
const ETSY_ICON = svg(
  '<rect width="100" height="100" rx="22" fill="#F1641E"/>' +
  '<path fill="#fff" d="M32 24h38v12h-6l-1-4H45v14h14l1-4h5v18h-5l-1-4H45v16h20l2-6h6l-2 14H32v-6l5-1V31l-5-1z"/>'
)

const INSTAGRAM_ICON = svg(
  '<defs><linearGradient id="g" x1="0" y1="1" x2="1" y2="0">' +
  '<stop offset="0" stop-color="#FEDA75"/><stop offset=".35" stop-color="#FA7E1E"/>' +
  '<stop offset=".6" stop-color="#D62976"/><stop offset="1" stop-color="#4F5BD5"/></linearGradient></defs>' +
  '<rect width="100" height="100" rx="22" fill="url(#g)"/>' +
  '<rect x="22" y="22" width="56" height="56" rx="16" fill="none" stroke="#fff" stroke-width="7"/>' +
  '<circle cx="50" cy="50" r="13" fill="none" stroke="#fff" stroke-width="7"/>' +
  '<circle cx="66" cy="34" r="4.5" fill="#fff"/>'
)

const PAYPAL_ICON = svg(
  '<rect width="100" height="100" rx="22" fill="#fff"/>' +
  '<path fill="none" stroke="#009CDE" stroke-width="11" stroke-linejoin="round" d="M44 84l6-34h12c12 0 18-7 18-16"/>' +
  '<path fill="none" stroke="#003087" stroke-width="11" stroke-linejoin="round" d="M30 78l10-58h18c13 0 19 7 17 17-2 11-10 17-22 17H44"/>'
)

export const QR_THEMES = {
  etsy: { colors: ['#e8601c', '#c24e14'], image: ETSY_ICON },
  instagram: { colors: ['#d6246e', '#a82a8a'], image: INSTAGRAM_ICON },
  paypal: { colors: ['#0070ba', '#003087'], image: PAYPAL_ICON }
}

export const qrOptionsFor = (platform, base) => {
  const theme = QR_THEMES[platform]
  if (!theme) return base
  const [from, to] = theme.colors
  return {
    ...base,
    image: theme.image,
    dotsOptions: {
      ...base.dotsOptions,
      color: to,
      gradient: { ...base.dotsOptions.gradient, colorStops: [{ offset: 0, color: from }, { offset: 1, color: to }] }
    }
  }
}
