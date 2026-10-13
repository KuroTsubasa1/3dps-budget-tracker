<template>
  <div>
    <PageHeader title="Digital Business Card" />

    <div class="mx-auto max-w-sm space-y-4">
      <div class="card p-5 text-center">
        <h2 class="text-xl font-semibold tracking-tight text-ink">3D PRINT SHOP HARM</h2>

        <ul class="mt-4 divide-y divide-line text-left">
          <li>
            <a href="mailto:service@3dps.space" class="flex min-h-[44px] items-center gap-3 text-sm text-ink hover:text-accent">
              <AppIcon name="mail" class="h-5 w-5 shrink-0 text-ink-muted" />
              service@3dps.space
            </a>
          </li>
          <li class="flex min-h-[44px] items-center gap-3 text-sm text-ink">
            <AppIcon name="map-pin" class="h-5 w-5 shrink-0 text-ink-muted" />
            Krete 8, 23701 Eutin
          </li>
          <li class="flex min-h-[44px] items-center gap-3 text-sm text-ink">
            <AppIcon name="user" class="h-5 w-5 shrink-0 text-ink-muted" />
            Geschäftsführer: Lasse Harm
          </li>
        </ul>

        <div class="mt-5 space-y-6 border-t border-line pt-5">
          <figure v-for="code in QR_CODES" :key="code.name" :aria-label="code.name">
            <h3 class="mb-3 text-sm font-semibold text-ink">{{ code.name }}</h3>
            <!-- The QR library renders a fixed 300px canvas; let it shrink on narrow phones -->
            <div class="inline-block max-w-full rounded-lg bg-white p-3 [&_canvas]:!h-auto [&_canvas]:max-w-full [&_img]:h-auto [&_img]:max-w-full">
              <ClientOnly>
                <QRCode :value="code.url" v-bind="qrcodeOptions" class="mx-auto" />
              </ClientOnly>
            </div>
            <figcaption class="mt-2">
              <a :href="code.url" target="_blank" rel="noopener" class="inline-flex min-h-[44px] items-center text-sm text-ink-muted hover:text-accent">{{ code.label }}</a>
            </figcaption>
          </figure>
        </div>
      </div>

      <div class="grid gap-2 print:hidden" :class="canShare ? 'grid-cols-2' : 'grid-cols-1'">
        <BaseButton v-if="canShare" variant="secondary" icon="share" @click="share">Share</BaseButton>
        <BaseButton variant="secondary" icon="printer" @click="print">Print</BaseButton>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, onMounted } from 'vue'
import QRCode from 'qrcode-vue3'
import qrcodeOptions from '@/assets/options.json'

const websiteUrl = 'https://3dps.space/'

const QR_CODES = [
  { name: 'Website', url: websiteUrl, label: '3dps.space' },
  { name: 'Etsy', url: 'https://www.etsy.com/shop/3DPrintShopHarm', label: 'etsy.com/shop/3DPrintShopHarm' },
  { name: 'Instagram', url: 'https://www.instagram.com/stories/3d.print.shop.harm/', label: 'instagram.com/3d.print.shop.harm' }
]

const canShare = ref(false)
onMounted(() => { canShare.value = typeof navigator.share === 'function' })

// Dismissing the share sheet rejects the promise; that is not an error
const share = () => navigator.share({ title: '3D PRINT SHOP HARM', url: websiteUrl }).catch(() => {})
const print = () => window.print()
</script>
