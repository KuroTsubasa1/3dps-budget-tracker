import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'

const root = new URL('../../', import.meta.url).pathname
const RAW = /\b(?:bg|text|border|ring|from|to|via)-(?:gray|slate|zinc|neutral|stone|red|orange|amber|yellow|lime|green|emerald|teal|cyan|sky|blue|indigo|violet|purple|fuchsia|pink|rose)-\d{2,3}\b/
const DARK = /(?:^|[\s"'`])dark:[\w[]/

const files = ['pages', 'components'].flatMap(dir =>
  readdirSync(join(root, dir), { recursive: true })
    .filter(f => f.endsWith('.vue'))
    .map(f => join(dir, f))
)

test('pages and components use semantic tokens, not raw palette or dark: classes', () => {
  const offenders = []
  for (const file of files) {
    readFileSync(join(root, file), 'utf8').split('\n').forEach((line, i) => {
      if (RAW.test(line) || DARK.test(line)) offenders.push(`${file}:${i + 1}: ${line.trim()}`)
    })
  }
  assert.deepEqual(offenders, [])
})
