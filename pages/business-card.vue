<template>
  <div class="px-4 py-6 sm:px-0">
    <div class="card mb-6">
      <div class="card-header">
        <h2 class="text-lg font-semibold text-gray-800">Digital Business Card</h2>
      </div>
      <div class="card-body">
        <div class="max-w-md mx-auto bg-white rounded-xl shadow-lg overflow-hidden md:max-w-2xl mb-6">
          <div class="p-8">
            <div class="text-center mb-6">
              <h3 class="text-2xl font-bold text-gray-900">3D PRINT SHOP HARM</h3>
              <p class="text-gray-600 mt-2"></p>
            </div>
            <div class="space-y-4">
              <div class="flex items-center">
                <svg class="h-6 w-6 text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
                </svg>
                <span class="ml-3 text-gray-700">service@3dps.space</span>
              </div>
              <div class="flex items-center">
                <svg class="h-6 w-6 text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
                </svg>
                <span class="ml-3 text-gray-700">Krete 8, 23701 Eutin</span>
              </div>
              <div class="flex items-center">
                <svg class="h-6 w-6 text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                </svg>
                <span class="ml-3 text-gray-700">Geschäftsführer: Lasse Harm</span>
              </div>
            </div>
          </div>
        </div>

        <!-- QR Code Section -->
        <div class="text-center">
          <h3 class="text-lg font-semibold text-gray-800 mb-4">Scan QR Code</h3>
          <div class="inline-block p-4 bg-white rounded-lg shadow-md">
            <QRCode
              :value="websiteUrl"
              v-bind="qrcodeOptions"
              class="mx-auto"
            />
          </div>
          <p class="mt-4 text-sm text-gray-600">Scan this QR code to visit our website</p>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import QRCode from 'qrcode-vue3'
import qrcodeOptions from '@/assets/options.json'

const websiteUrl = 'https://3dps.space/'
</script>