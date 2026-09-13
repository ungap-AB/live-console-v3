import preact from '@preact/preset-vite'
import { defineConfig } from 'vite'

const port = Number(process.env.PORT) || 5173

export default defineConfig({
  plugins: [preact()],
  server: { host: true, port, strictPort: false, allowedHosts: ['local.console.live.ungap.net'] },
  preview: { port },
})
