import preact from '@preact/preset-vite'
import { existsSync, readFileSync, rmSync } from 'node:fs'
import { resolve } from 'node:path'
import { defineConfig, type Plugin } from 'vite'
import { linguiMacros } from './scripts/lingui-macro.mjs'

const port = Number(process.env.PORT) || 5173
const certDir = resolve(import.meta.dirname, '../live-server-v3/certs')
const certFile = resolve(certDir, 'local.api.live.ungap.net.pem')
const keyFile = resolve(certDir, 'local.api.live.ungap.net-key.pem')
const https = existsSync(certFile) && existsSync(keyFile)
  ? { cert: readFileSync(certFile), key: readFileSync(keyFile) }
  : undefined

// ungap Shell step 1 (UNG-315): public/embed/mock.html is a development page for framing tests. Builds leave it out
// unless EMBED_MOCK=1 (e.g. a test deploy that the shell frames), so it never reaches prod by accident.
function embedMockOnlyOnRequest(): Plugin {
  let outDir = ''
  return {
    name: 'ungap-embed-mock',
    apply: 'build',
    configResolved(config) {
      outDir = resolve(config.root, config.build.outDir)
    },
    closeBundle() {
      if (process.env.EMBED_MOCK !== '1') rmSync(resolve(outDir, 'embed'), { recursive: true, force: true })
    },
  }
}

export default defineConfig({
  plugins: [linguiMacros(), preact(), embedMockOnlyOnRequest()],
  resolve: {
    alias: { events: 'events' },
  },
  server: { host: true, port, strictPort: true, https, allowedHosts: ['local.console.live.ungap.net'] },
  preview: { port, https },
})
