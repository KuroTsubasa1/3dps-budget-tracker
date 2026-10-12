import { ref, onMounted, onBeforeUnmount } from 'vue'

// false during SSR and hydration, so server and first client render agree (compact layout)
export const useMediaQuery = (query) => {
  const matches = ref(false)
  let mediaQueryList = null
  const update = () => { matches.value = mediaQueryList.matches }

  onMounted(() => {
    mediaQueryList = window.matchMedia(query)
    update()
    mediaQueryList.addEventListener('change', update)
  })

  onBeforeUnmount(() => {
    mediaQueryList?.removeEventListener('change', update)
  })

  return matches
}
