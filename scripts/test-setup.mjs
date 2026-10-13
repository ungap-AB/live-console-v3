import { register } from 'node:module'

// UNG-221: `node --test` loads TypeScript directly, so the Lingui macros are compiled by a load hook, and the UI
// language is Swedish in every test (the tests assert the Swedish texts, which must stay unchanged).
register('./lingui-test-hooks.mjs', import.meta.url)
const { activateForTests } = await import('../src/i18n/index.ts')
activateForTests('sv')
