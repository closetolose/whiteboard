module.exports = {
  apps: [
    {
      name: 'whiteboard',
      script: 'npm',
      args: 'start',
      cwd: process.env.WHITEBOARD_CWD || '/home/ubuntu/whiteboard',
      env: {
        NODE_ENV: 'production',
        PORT: '3000',
        NODE_OPTIONS: '--max-old-space-size=384',
      },
      max_memory_restart: '400M',
      autorestart: true,
    },
  ],
}
