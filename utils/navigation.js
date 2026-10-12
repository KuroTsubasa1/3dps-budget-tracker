export const NAV_ITEMS = [
  { to: '/', label: 'Dashboard', shortLabel: 'Home', icon: 'home' },
  { to: '/catalog', label: 'Catalog', shortLabel: 'Catalog', icon: 'bag' },
  { to: '/business-card', label: 'Business Card', shortLabel: 'Card', icon: 'id-card' },
  { to: '/reports', label: 'Reports', shortLabel: 'Reports', icon: 'chart' },
  { to: '/settings', label: 'Settings', shortLabel: 'Settings', icon: 'cog' }
]

export const isActivePath = (path, to) =>
  to === '/' ? path === '/' : path === to || path.startsWith(`${to}/`)
