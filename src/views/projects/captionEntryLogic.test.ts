import assert from 'node:assert/strict'
import { test } from 'node:test'
import type { CaptionGeneration } from '../../data/types'
import { captionEntry, captionStateView, consumeCaptionStudio, listCaptionButton, requestCaptionStudio, studioView } from './captionEntryLogic.ts'

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
  assert.deepEqual(captionEntry({ canGenerate: true, draft }), { kind: 'edit', label: 'Redigera utkast' })
})

test('knappen: utkast och publicerade benämns olika, och ändringar efter en publicering är fortfarande ett utkast (UNG-187)', () => {
  const published = { createdAtUtc: '2026-10-07T09:00:00Z', unpublishedChanges: false } as unknown as NonNullable<CaptionGeneration['draft']>
  const changed = { createdAtUtc: '2026-10-07T09:00:00Z', unpublishedChanges: true, publishedVersion: 2, version: 3 } as unknown as NonNullable<CaptionGeneration['draft']>
  assert.equal(captionEntry({ canGenerate: true, draft: published })?.label, 'Redigera undertexter')
  assert.equal(captionEntry({ canGenerate: true, draft: changed })?.label, 'Redigera utkast')
})

test('ett misslyckat försök heter Försök igen, i listan och ovanför videon', () => {
  assert.equal(captionEntry({ canGenerate: true, job: job('error') })?.label, 'Försök igen')
  assert.equal(listCaptionButton({ state: 'failed' }).label, 'Försök igen')
})

test('listan och knappen ovanför videon delar tillstånd, art och förklaring', () => {
  for (const state of ['none', 'generating', 'failed', 'draft', 'published'] as const) {
    const view = captionStateView(state)
    const list = listCaptionButton({ state })
    assert.equal(list.kind, view.kind)
    assert.equal(list.title, view.title)
    assert.equal(list.tone, view.tone)
  }
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

test('listknappen: tillståndet som text, och vad klicket gör som tooltip (UNG-187)', () => {
  assert.equal(listCaptionButton(undefined).kind, 'create')
  assert.equal(listCaptionButton({ state: 'none' }).label, 'Skapa')
  assert.equal(listCaptionButton({ state: 'failed' }).label, 'Försök igen')
  assert.match(listCaptionButton({ state: 'failed' }).title, /misslyckades/)
  assert.deepEqual([listCaptionButton({ state: 'generating', progress: 41.6 }).label, listCaptionButton({ state: 'generating' }).label], ['Genererar 42 %', 'Genererar…'])
  assert.equal(listCaptionButton({ state: 'generating', progress: 0 }).label, 'Genererar…')
  assert.deepEqual([listCaptionButton({ state: 'draft' }).label, listCaptionButton({ state: 'draft' }).kind], ['Utkast', 'edit'])
  assert.deepEqual([listCaptionButton({ state: 'published' }).label, listCaptionButton({ state: 'published' }).kind], ['Publicerade', 'edit'])
  assert.match(listCaptionButton({ state: 'draft' }).title, /syns inte för tittarna/)
})

test('önskemål om att öppna studion gäller en gång, för rätt projekt, och en kort stund', () => {
  requestCaptionStudio('p1', 1000)
  assert.equal(consumeCaptionStudio('p2', 2000), false) // fel projekt
  assert.equal(consumeCaptionStudio('p1', 2000), false) // redan förbrukat av det första anropet
  requestCaptionStudio('p1', 1000)
  assert.equal(consumeCaptionStudio('p1', 5000), true)
  assert.equal(consumeCaptionStudio('p1', 5000), false) // bara en gång
  requestCaptionStudio('p1', 1000)
  assert.equal(consumeCaptionStudio('p1', 20_000), false) // för gammalt
})
