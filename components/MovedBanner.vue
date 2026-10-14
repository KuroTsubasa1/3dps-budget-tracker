<template>
  <div v-if="target" class="border-b border-line bg-accent/10 print:hidden" role="status">
    <div class="mx-auto flex max-w-6xl flex-wrap items-center gap-3 px-4 py-2 md:px-6">
      <p class="min-w-0 flex-1 text-sm text-ink">
        <span class="font-semibold">Akinai has moved.</span>
        Sync any pending sales here first, then install the app from the new address.
      </p>
      <a :href="target" class="btn btn-primary">Open {{ host }}</a>
    </div>
  </div>
</template>

<script setup>
import { computed, onMounted, ref } from 'vue'
import { movedTo } from '~/utils/branding'

const target = ref(null)
const host = computed(() => target.value && new URL(target.value).host)

onMounted(() => {
  target.value = movedTo(window.location.hostname)
})
</script>
