import PocketBase from 'pocketbase'

let client = null

export const usePocketBase = () => {
  if (!client) {
    client = new PocketBase(useRuntimeConfig().public.pocketbaseUrl)
    // Several components load the same lists; the SDK would otherwise cancel duplicate requests
    client.autoCancellation(false)
  }
  return client
}
