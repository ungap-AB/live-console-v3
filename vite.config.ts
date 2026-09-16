import preact from '@preact/preset-vite'
import { existsSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { defineConfig } from 'vite'

const port = Number(process.env.PORT) || 5173
const certDir = resolve(import.meta.dirname, '../live-server/certs')
const certFile = resolve(certDir, 'local.api.live.ungap.net.pem')
const keyFile = resolve(certDir, 'local.api.live.ungap.net-key.pem')
const https = existsSync(certFile) && existsSync(keyFile)
  ? { cert: readFileSync(certFile), key: readFileSync(keyFile) }
  : undefined

export default defineConfig({
  plugins: [preact()],
  resolve: {
    alias: { events: 'events' },
  },
  server: { host: true, port, strictPort: false, https, allowedHosts: ['local.console.live.ungap.net'] },
  preview: { port, https },
})
