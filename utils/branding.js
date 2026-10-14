export const APP_NAME = 'Akinai'
export const APP_URL = 'https://akinai.lasseharm.space'

// The address the app had before it became Akinai; installed copies there are pointed to the new one
const OLD_HOST = 'budget-tracker.lasseharm.space'

export const movedTo = (hostname) => hostname === OLD_HOST ? APP_URL : null
