const path = require('node:path')

module.exports = {
  apps: [
    {
      name: 'whiteboard',
      script: 'server/index.ts',
      interpreter: 'node',
      interpreter_args: '--import tsx',
      cwd: process.env.WHITEBOARD_CWD || path.resolve(__dirname, '..'),
      env: {
        NODE_ENV: 'production',
        PORT: '3000',
        NODE_OPTIONS: '--max-old-space-size=384',
      },
      max_memory_restart: '400M',
      autorestart: true,
      restart_delay: 2000,
      min_uptime: '10s',
      max_restarts: 20,
      kill_timeout: 10000,
      time: true,
    },
  ],
}
