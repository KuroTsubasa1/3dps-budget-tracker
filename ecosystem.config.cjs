// pm2 process for the built Nuxt server. The deploy workflow copies this file into each release
// directory next to .output and starts it from there: pm2 start ecosystem.config.cjs
module.exports = {
  apps: [
    {
      name: 'budget-tracker',
      cwd: __dirname,
      script: '.output/server/index.mjs',
      // nginx proxies budget-tracker.lasseharm.space to this port; only reachable from the server itself
      env: {
        NODE_ENV: 'production',
        HOST: '127.0.0.1',
        PORT: '3000'
      },
      max_memory_restart: '300M'
    }
  ]
}
