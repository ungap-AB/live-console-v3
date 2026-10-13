import { transformLinguiMacros } from './lingui-macro.mjs'

export async function load(url, context, nextLoad) {
  const result = await nextLoad(url, context)
  if (!url.startsWith('file:') || url.includes('/node_modules/') || !/\.tsx?$/.test(url) || result.source == null) return result
  const transformed = await transformLinguiMacros(String(result.source), new URL(url).pathname)
  return transformed ? { ...result, source: transformed.code } : result
}
