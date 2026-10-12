<template>
  <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2" aria-hidden="true">
    <path v-for="(d, index) in paths" :key="index" stroke-linecap="round" stroke-linejoin="round" :d="d" />
  </svg>
</template>

<script setup>
import { computed } from 'vue'
import { ICONS } from '~/utils/icons'

const props = defineProps({
  name: { type: String, required: true }
})

const paths = computed(() => {
  const icon = ICONS[props.name]
  // Fail loudly so a typo breaks the page-render tests instead of shipping a blank icon
  if (!icon) throw new Error(`Unknown icon: ${props.name}`)
  return Array.isArray(icon) ? icon : [icon]
})
</script>
