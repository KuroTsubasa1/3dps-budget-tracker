import { ref } from 'vue'

const toasts = ref([])
let nextId = 1

export const useToast = () => {
  const dismiss = (id) => {
    toasts.value = toasts.value.filter(item => item.id !== id)
  }

  const toast = (message, { tone = 'success', duration = 4000 } = {}) => {
    const id = nextId++
    toasts.value = [...toasts.value, { id, message, tone }]
    if (duration > 0) setTimeout(() => dismiss(id), duration)
    return id
  }

  return { toasts, toast, dismiss }
}
