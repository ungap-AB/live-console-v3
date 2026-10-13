import { readFileSync } from 'node:fs'
import { extractVariables, parsePo } from 'pofile-ts'

// UNG-221: checks what `lingui check` does not.
// 1. Collisions: two places with the same English text share one Swedish translation. That is only right if
//    their Swedish texts were the same, so every message used in more than one file must be listed (with its
//    Swedish text) in src/locales/shared.json after a human has checked that both places mean the same thing.
//    Otherwise give one of them a `context`.
// 2. Every Swedish translation uses exactly the same variables as the English source.
const root = new URL('../', import.meta.url)
const po = parsePo(readFileSync(new URL('src/locales/sv.po', root), 'utf8'))
const shared = JSON.parse(readFileSync(new URL('src/locales/shared.json', root), 'utf8'))
const key = (item) => (item.msgctxt ? `${item.msgctxt}::${item.msgid}` : item.msgid)
const sorted = (values) => [...new Set(values)].sort().join(', ')

const errors = []
const seen = new Set()
for (const item of po.items) {
  if (item.obsolete) continue
  const k = key(item)
  seen.add(k)
  const sv = item.msgstr[0] ?? ''
  const files = new Set(item.references.map((ref) => ref.replace(/:\d+$/, '')))
  if (files.size > 1 && !(k in shared)) {
    errors.push(`Used in ${files.size} files but not in shared.json: "${k}"\n    ${[...files].join('\n    ')}`)
  }
  if (k in shared && shared[k] !== sv) {
    errors.push(`shared.json says "${shared[k]}" but sv.po says "${sv}" for "${k}"`)
  }
  if (sv && sorted(extractVariables(item.msgid)) !== sorted(extractVariables(sv))) {
    errors.push(`Variables differ: "${item.msgid}" → "${sv}"`)
  }
}
for (const k of Object.keys(shared)) {
  if (!seen.has(k)) errors.push(`shared.json lists a message that is no longer in the code: "${k}"`)
}

if (errors.length > 0) {
  console.error(`i18n check failed (${errors.length}):\n- ${errors.join('\n- ')}`)
  process.exit(1)
}
console.log(`i18n check: ${seen.size} messages, ${Object.keys(shared).length} shared, no collisions or variable mismatches.`)
