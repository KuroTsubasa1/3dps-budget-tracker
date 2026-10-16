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
          <div class="flex items-center justify-between gap-2 px-4 py-1 md:px-6 md:pt-4">
            <!-- A long title (a convention's name) wraps instead of squeezing the close button -->
            <h2 :id="titleId" class="min-w-0 break-words text-base font-semibold text-ink">{{ title }}</h2>
            <button
              v-if="dismissible"
              type="button"
              class="-mr-2 flex h-11 w-11 shrink-0 items-center justify-center rounded-lg text-ink-muted hover:bg-muted"
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

<script>
// Sheets open right now, app-wide: the page scrolls again once the last one closes
let openSheets = 0
</script>

<script setup>
import { ref, watch, nextTick, onBeforeUnmount, useId } from 'vue'

const props = defineProps({
  open: { type: Boolean, default: false },
  title: { type: String, required: true },
  // false while something must finish first (a card payment on the terminal): no close button, and the
  // backdrop and Escape do nothing
  dismissible: { type: Boolean, default: true }
})
const emit = defineEmits(['update:open'])

const panel = ref(null)
const titleId = useId()
let previouslyFocused = null

const close = () => {
  if (props.dismissible) emit('update:open', false)
}

// With a sheet opened over another (the card payment over Home's form), only the top one takes the keys
const isTopmost = () => {
  const dialogs = document.querySelectorAll('#teleports [role="dialog"]')
  return dialogs[dialogs.length - 1] === panel.value
}

const FOCUSABLE = 'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled])'

const onKeydown = (event) => {
  if (!isTopmost()) return
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

let holding = false
const hold = () => {
  if (holding) return
  holding = true
  openSheets++
  document.body.style.overflow = 'hidden'
}
const release = () => {
  if (holding) {
    holding = false
    openSheets--
  }
  // A sheet still open underneath (Home's form under the card payment) keeps the page from scrolling
  if (!openSheets) document.body.style.overflow = ''
  document.removeEventListener('keydown', onKeydown)
}

watch(() => props.open, async (isOpen) => {
  if (isOpen) {
    previouslyFocused = document.activeElement
    hold()
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
