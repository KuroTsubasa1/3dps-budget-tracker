// Renders the PWA, Apple and favicon icons from public/logo.svg: node scripts/make-icons.mjs
// The 商 outline in the logo comes from Noto Sans JP (SIL Open Font License).
import { readFileSync, writeFileSync } from 'node:fs'
import { chromium } from '@playwright/test'

const root = new URL('../', import.meta.url)
const logo = readFileSync(new URL('public/logo.svg', root), 'utf8')
// Maskable and Apple icons are cut to shape by the system, so they fill the whole square
const fullBleed = logo.replace(/<rect([^>]*) rx="\d+"/, '<rect$1 rx="0"')

const ICONS = [
  { file: 'icon-32x32.png', size: 32, svg: logo },
  { file: 'icon-192x192.png', size: 192, svg: logo },
  { file: 'icon-512x512.png', size: 512, svg: logo },
  { file: 'maskable-512x512.png', size: 512, svg: fullBleed },
  { file: 'apple-touch-icon.png', size: 180, svg: fullBleed }
]

// An .ico file may hold a PNG as is: a 6-byte header and one 16-byte directory entry
const icoFrom = (png, size) => {
  const header = Buffer.alloc(22)
  header.writeUInt16LE(0, 0)
  header.writeUInt16LE(1, 2)
  header.writeUInt16LE(1, 4)
  header.writeUInt8(size, 6)
  header.writeUInt8(size, 7)
  header.writeUInt16LE(1, 10)
  header.writeUInt16LE(32, 12)
  header.writeUInt32LE(png.length, 14)
  header.writeUInt32LE(22, 18)
  return Buffer.concat([header, png])
}

const browser = await chromium.launch()
const page = await browser.newPage()
for (const { file, size, svg } of ICONS) {
  await page.setViewportSize({ width: size, height: size })
  await page.setContent(`<body style="margin:0"><img src="data:image/svg+xml;base64,${Buffer.from(svg).toString('base64')}" width="${size}" height="${size}" style="display:block"></body>`)
  const png = await page.screenshot({ omitBackground: true })
  writeFileSync(new URL(`public/icons/${file}`, root), png)
  if (size === 32) writeFileSync(new URL('public/favicon.ico', root), icoFrom(png, size))
}
await browser.close()
