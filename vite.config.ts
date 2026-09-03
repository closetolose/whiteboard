import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

const API_TARGET = 'http://localhost:3001'

export default defineConfig({
  plugins: [react()],
  server: {
    host: '0.0.0.0',
    port: 3000,
    strictPort: true,
    // Allow ngrok / cloudflare tunnel hostnames
    allowedHosts: true,
    proxy: {
      '/api': API_TARGET,
      '/uploads': API_TARGET,
      '/connect': {
        target: 'ws://localhost:3001',
        ws: true,
      },
    },
  },
})
