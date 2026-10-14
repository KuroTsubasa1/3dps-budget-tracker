// Every page in menu order. On phones the 'tab' items are the bottom bar and the 'more' items sit in the More sheet;
// larger screens list all of them in the side nav.
export const NAV_ITEMS = [
  { to: '/', label: 'Dashboard', shortLabel: 'Home', icon: 'home', phone: 'tab' },
  { to: '/catalog', label: 'Catalog', shortLabel: 'Catalog', icon: 'bag', phone: 'tab' },
  { to: '/commissions', label: 'Commissions', shortLabel: 'Commissions', icon: 'clipboard', phone: 'tab' },
  { to: '/print-board', label: 'Print board', shortLabel: 'Print', icon: 'printer', phone: 'tab' },
  { to: '/calendar', label: 'Calendar', shortLabel: 'Calendar', icon: 'calendar', phone: 'more' },
  { to: '/reports', label: 'Reports', shortLabel: 'Reports', icon: 'chart', phone: 'more' },
  { to: '/business-card', label: 'Business Card', shortLabel: 'Card', icon: 'id-card', phone: 'more' },
  { to: '/settings', label: 'Settings', shortLabel: 'Settings', icon: 'cog', phone: 'more' }
]

export const PHONE_TABS = NAV_ITEMS.filter(item => item.phone === 'tab')
export const MORE_ITEMS = NAV_ITEMS.filter(item => item.phone === 'more')

export const isActivePath = (path, to) =>
  to === '/' ? path === '/' : path === to || path.startsWith(`${to}/`)

export const isMoreActive = path => MORE_ITEMS.some(item => isActivePath(path, item.to))
