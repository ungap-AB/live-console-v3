import assert from 'node:assert/strict'
import { test } from 'node:test'
import { IMPORT_MAX_LINES, IMPORT_MAX_LINE_LENGTH, checkImportText, importSummary } from './importTextLogic.ts'

test('förkontrollen räknar rader och tomma rader som servern gör, med alla radbrytningar', () => {
  assert.deepEqual(checkImportText('Val av justerare\r\n\r\nFrågor\rÖvrigt\n  \n'), { lines: 3, blank: 3, problem: null })
  assert.deepEqual(checkImportText(''), { lines: 0, blank: 1, problem: null })
})

test('en för lång rad pekas ut med sitt radnummer (tomma rader räknas), och för många rader avvisas', () => {
  const long = checkImportText(`Kort\n\n${'a'.repeat(IMPORT_MAX_LINE_LENGTH + 1)}`)
  assert.match(long.problem ?? '', /Rad 3 är för lång/)
  assert.equal(checkImportText('a'.repeat(IMPORT_MAX_LINE_LENGTH)).problem, null)
  const many = checkImportText(Array.from({ length: IMPORT_MAX_LINES + 1 }, (_, i) => `P${i}`).join('\n'))
  assert.match(many.problem ?? '', /För många rader/)
  assert.equal(checkImportText(Array.from({ length: IMPORT_MAX_LINES }, (_, i) => `P${i}`).join('\n')).problem, null)
})

test('sammanfattningen berättar vad som hände, på rätt form', () => {
  assert.equal(importSummary('agenda', { created: 58, replaced: 0, removed: 0, skipped: 2 }), 'Skapade 58 punkter, hoppade över 2 tomma rader.')
  assert.equal(importSummary('agenda', { created: 1, replaced: 0, removed: 0, skipped: 1 }), 'Skapade 1 punkt, hoppade över 1 tom rad.')
  assert.equal(importSummary('namelist', { created: 4, replaced: 3, removed: 1, skipped: 0 }), 'Skapade 4 namn, ersatte 3, tog bort 1.')
  assert.equal(importSummary('agenda', { created: 0, replaced: 5, removed: 0, skipped: 0 }), 'Ersatte 5 punkter.')
  assert.equal(importSummary('namelist', { created: 0, replaced: 0, removed: 0, skipped: 3 }), 'Hoppade över 3 tomma rader.')
  assert.equal(importSummary('agenda', { created: 0, replaced: 0, removed: 0, skipped: 0 }), 'Inget att importera.')
})
