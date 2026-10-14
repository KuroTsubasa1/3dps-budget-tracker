import { test } from 'node:test'
import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { existsSync } from 'node:fs'

const require = createRequire(import.meta.url)
const [app] = require('../../ecosystem.config.cjs').apps

test('pm2 runs the server in Berlin time and loads the secrets file only when it exists', () => {
  assert.equal(app.env.TZ, 'Europe/Berlin')
  assert.equal(app.env.PORT, '3668')
  const file = '/opt/budget-tracker/shared/akinai.env'
  assert.equal(app.node_args, existsSync(file) ? `--env-file=${file}` : undefined)
})
