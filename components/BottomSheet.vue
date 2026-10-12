<template>
  <!-- Nuxt only server-renders teleports into #teleports -->
  <Teleport to="#teleports">
    <Transition name="sheet">
      <div v-if="open" class="fixed inset-0 z-50 flex items-end justify-center md:items-center md:p-6">
        <div class="absolute inset-0 bg-black/40" aria-hidden="true" data-testid="sheet-backdrop" @click="close" />
        <div
          ref="panel"
          role="dialog"
          aria-modal="true"
          :aria-labelledby="titleId"
          tabindex="-1"
          class="sheet-panel relative flex max-h-[90dvh] w-full flex-col rounded-t-2xl bg-card pb-safe shadow-xl focus:outline-none md:max-w-lg md:rounded-2xl md:pb-0"
        >
          <div class="flex justify-center pt-2 md:hidden" aria-hidden="true">
            <span class="h-1.5 w-10 rounded-full bg-line" />
          </div>
          <div class="flex items-center justify-between px-4 py-1 md:px-6 md:pt-4">
            <h2 :id="titleId" class="text-base font-semibold text-ink">{{ title }}</h2>
            <button
              type="button"
              class="-mr-2 flex h-11 w-11 items-center justify-center rounded-lg text-ink-muted hover:bg-muted"
              aria-label="Close"
              @click="close"
            >
              <AppIcon name="x" class="h-5 w-5" />
            </button>
          </div>
          <div class="overflow-y-auto px-4 pb-4 md:px-6 md:pb-6">
            <slot />
          </div>
        </div>
      </div>
    </Transition>
  </Teleport>
</template>

<script setup>
import { ref, watch, nextTick, onBeforeUnmount, useId } from 'vue'

const props = defineProps({
  open: { type: Boolean, default: false },
  title: { type: String, required: true }
})
const emit = defineEmits(['update:open'])

const panel = ref(null)
const titleId = useId()
let previouslyFocused = null

const close = () => emit('update:open', false)

const FOCUSABLE = 'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled])'

const onKeydown = (event) => {
  if (event.key === 'Escape') {
    close()
    return
  }
  if (event.key !== 'Tab' || !panel.value) return
  const focusable = [...panel.value.querySelectorAll(FOCUSABLE)]
  if (!focusable.length) return
  const first = focusable[0]
  const last = focusable[focusable.length - 1]
  if (event.shiftKey && document.activeElement === first) {
    event.preventDefault()
    last.focus()
  } else if (!event.shiftKey && document.activeElement === last) {
    event.preventDefault()
    first.focus()
  }
}

const release = () => {
  document.body.style.overflow = ''
  document.removeEventListener('keydown', onKeydown)
}

watch(() => props.open, async (isOpen) => {
  if (isOpen) {
    previouslyFocused = document.activeElement
    document.body.style.overflow = 'hidden'
    document.addEventListener('keydown', onKeydown)
    await nextTick()
    panel.value?.focus()
  } else {
    release()
    previouslyFocused?.focus?.()
  }
})

// Route changes and breakpoint swaps unmount an open sheet without closing it first
onBeforeUnmount(release)
</script>
