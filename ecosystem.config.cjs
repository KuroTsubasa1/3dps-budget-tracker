// pm2 process for the built Nuxt server. The deploy workflow copies this file into each release
// directory next to .output and starts it from there: pm2 start ecosystem.config.cjs
const { existsSync } = require('node:fs')

// Server-only secrets for reminders and the calendar feed (mode 600, owned by deploy); see the README
const ENV_FILE = '/opt/budget-tracker/shared/akinai.env'

module.exports = {
  apps: [
    {
      name: 'budget-tracker',
      cwd: __dirname,
      script: '.output/server/index.mjs',
      // Node 20.6+ reads the file itself; without it the app runs with reminders and the feed switched off
      ...(existsSync(ENV_FILE) ? { node_args: `--env-file=${ENV_FILE}` } : {}),
      // nginx proxies akinai.lasseharm.space (and the old budget-tracker address) to this port; only reachable from the server itself
      env: {
        NODE_ENV: 'production',
        HOST: '127.0.0.1',
        PORT: '3668',
        // Reminder times and the feed's texts are the owner's local time
        TZ: 'Europe/Berlin'
      },
      max_memory_restart: '300M'
    }
  ]
}
