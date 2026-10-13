import { transformAsync } from '@babel/core'

// UNG-221: compiles Lingui macros (`t`, `msg`, `plural` from @lingui/core/macro) and nothing else. TypeScript and
// JSX are kept as they are, so Vite (and Node's type stripping in tests) handle them as before.
export async function transformLinguiMacros(code, filename) {
  if (!/\.[cm]?[jt]sx?$/.test(filename) || !code.includes('@lingui/core/macro')) return null
  const result = await transformAsync(code, {
    filename,
    babelrc: false,
    configFile: false,
    sourceMaps: true,
    parserOpts: { plugins: [/\.[cm]?tsx?$/.test(filename) && 'typescript', /x$/.test(filename) && 'jsx'].filter(Boolean) },
    plugins: ['@lingui/babel-plugin-lingui-macro'],
  })
  return result && { code: result.code, map: result.map }
}

/** Vite plugin: runs before the Preact preset so the macros are gone when it sees the file. */
export function linguiMacros() {
  return {
    name: 'ungap-lingui-macros',
    enforce: 'pre',
    transform(code, id) {
      return transformLinguiMacros(code, id.split('?')[0])
    },
  }
}
