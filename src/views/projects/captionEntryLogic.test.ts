import assert from 'node:assert/strict'
import { test } from 'node:test'
import type { CaptionGeneration } from '../../data/types'
import { captionEntry, studioView } from './captionEntryLogic.ts'

const job = (state: 'processing' | 'error' | 'done', progress = 0) => ({ id: 'j', state, progress, createdAtUtc: '2026-10-07T10:00:00Z' }) as unknown as NonNullable<CaptionGeneration['job']>
const draft = { createdAtUtc: '2026-10-07T09:00:00Z' } as unknown as NonNullable<CaptionGeneration['draft']>

test('knappen: laddar tills serverns läge är hämtat', () => {
  assert.equal(captionEntry(null), null)
})

test('knappen: skapa när inget finns, med förklaring om det inte går', () => {
  assert.deepEqual(captionEntry({ canGenerate: true }), { kind: 'create', label: 'Skapa undertexter', disabledReason: undefined })
  const blocked = captionEntry({ canGenerate: false })
  assert.equal(blocked?.kind, 'create')
  assert.match(blocked?.disabledReason ?? '', /inte/)
})

test('knappen: framsteg i procent medan jobbet pågår, och redigera när ett utkast finns', () => {
  assert.deepEqual(captionEntry({ canGenerate: false, job: job('processing', 40) }), { kind: 'progress', label: 'Genererar undertexter… 40 %' })
  assert.equal(captionEntry({ canGenerate: false, job: job('processing', 0) })?.label, 'Genererar undertexter…')
  assert.deepEqual(captionEntry({ canGenerate: true, draft }), { kind: 'edit', label: 'Redigera undertexter' })
})

test('knappen: ett misslyckat jobb som är nyare än utkastet ger skapa igen, ett äldre ändrar inte att utkastet kan redigeras', () => {
  assert.equal(captionEntry({ canGenerate: true, job: job('error') })?.kind, 'create')
  assert.equal(captionEntry({ canGenerate: true, job: job('error'), draft })?.kind, 'create') // felet är nyare än utkastet
  const newer = { createdAtUtc: '2026-10-07T11:00:00Z' } as unknown as NonNullable<CaptionGeneration['draft']>
  assert.equal(captionEntry({ canGenerate: true, job: job('error'), draft: newer })?.kind, 'edit')
})

test('vyn: start, framsteg eller redigerare efter läget', () => {
  assert.equal(studioView('idle'), 'start')
  assert.equal(studioView('failed'), 'start')
  assert.equal(studioView('running'), 'progress')
  assert.equal(studioView('draft'), 'editor')
})
