import { test } from 'node:test'
import assert from 'node:assert/strict'
import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'

const root = new URL('../../', import.meta.url).pathname
const UTILITIES = '(?:bg|text|border|ring|from|to|via|fill|stroke|outline|divide|placeholder|decoration|shadow|accent|caret)'
const RAW = new RegExp(`\\b${UTILITIES}-(?:gray|slate|zinc|neutral|stone|red|orange|amber|yellow|lime|green|emerald|teal|cyan|sky|blue|indigo|violet|purple|fuchsia|pink|rose)-\\d{2,3}\\b`)
// Arbitrary colour values bypass the tokens just the same: text-[#fff], bg-[#2563eb]/50, border-[rgb(…)]
const ARBITRARY = new RegExp(`\\b${UTILITIES}-\\[(?:#|rgba?\\(|hsla?\\()`)
const DARK = /(?:^|[\s"'`])dark:[\w[]/
// White and black stay the same in both themes; only these deliberate uses are allowed
const WHITE_BLACK = /\b(?:bg|text|border)-(?:white|black)\b(?:\/\d+)?/g
const ALLOWED_WHITE_BLACK = {
  // Text on the accent colour: the floating add button and the cart badge/bar
  'pages/index.vue': ['text-white'],
  'pages/catalog.vue': ['text-white'],
  // A QR code needs a light quiet zone to scan, also in dark mode
  'pages/business-card.vue': ['bg-white'],
  // Sheet backdrop dims whatever is behind it
  'components/BottomSheet.vue': ['bg-black/40'],
  // The switch knob sits on the accent or line colour in both themes
  'components/ToggleSwitch.vue': ['bg-white']
}

const listFiles = (dir, extensions) => existsSync(join(root, dir))
  ? readdirSync(join(root, dir), { recursive: true })
    .filter(f => extensions.some(extension => f.endsWith(extension)))
    .map(f => join(dir, f))
  : []

const files = [
  ...['pages', 'components', 'layouts'].flatMap(dir => listFiles(dir, ['.vue'])),
  ...listFiles('plugins', ['.js', '.ts', '.vue']),
  'app.vue'
]

const offendersIn = (file, source) => {
  const offenders = []
  source.split('\n').forEach((line, i) => {
    const whiteBlack = (line.match(WHITE_BLACK) || []).filter(token => !(ALLOWED_WHITE_BLACK[file] || []).includes(token))
    if (RAW.test(line) || ARBITRARY.test(line) || DARK.test(line) || whiteBlack.length) offenders.push(`${file}:${i + 1}: ${line.trim()}`)
  })
  return offenders
}

test('app.vue, layouts, plugins, pages and components are all checked', () => {
  assert.ok(files.includes('app.vue'))
  assert.ok(files.some(file => file.startsWith('plugins/')))
  assert.ok(files.some(file => file.startsWith('pages/')))
  assert.ok(files.some(file => file.startsWith('components/')))
})

test('the check catches raw palette, arbitrary colour, dark: and stray white/black classes', () => {
  for (const line of ['class="bg-gray-100"', 'class="text-[#ff0000]"', 'class="bg-[#2563eb]/50"', 'class="border-[rgb(0,0,0)]"', 'class="p-2 dark:bg-card"', 'class="bg-white"']) {
    assert.equal(offendersIn('components/Example.vue', line).length, 1, line)
  }
  for (const line of ['class="bg-card text-ink"', 'class="max-h-[90dvh] min-w-[1.5rem]"', 'class="bg-accent/10"']) {
    assert.deepEqual(offendersIn('components/Example.vue', line), [], line)
  }
  assert.deepEqual(offendersIn('components/BottomSheet.vue', 'class="bg-black/40"'), [])
})

test('the UI uses semantic tokens, not raw palette, arbitrary colours or dark: classes', () => {
  const offenders = files.flatMap(file => offendersIn(file, readFileSync(join(root, file), 'utf8')))
  assert.deepEqual(offenders, [])
})
