import { defineConfig } from '@lingui/conf'
import { formatter } from '@lingui/format-po'

// UNG-221: English is the source language in the code; Swedish is a translation in sv.po and must be complete
// (no fallback locale, so a missing Swedish text fails `lingui check missing`). `pseudo` is generated from the
// English source and only loaded in development (?lang=pseudo).
export default defineConfig({
  sourceLocale: 'en',
  locales: ['en', 'sv', 'pseudo'],
  pseudoLocale: 'pseudo',
  catalogs: [{ path: '<rootDir>/src/locales/{locale}', include: ['<rootDir>/src'], exclude: ['**/*.test.ts'] }],
  format: formatter({ lineNumbers: false }),
  compileNamespace: 'es',
})
