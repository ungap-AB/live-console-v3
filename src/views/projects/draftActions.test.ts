import assert from 'node:assert/strict'
import { test } from 'node:test'
import { conflictDescription, headerActions, isConflictCode, overviewTrim, overwriteLabel, publishChangesNotice, trimChanged, trimDraftPayload } from './draftActions.ts'

test('trimmen räknas som ändrad först när något skiljer sig från det sparade', () => {
  assert.equal(trimChanged(undefined), false)
  assert.equal(trimChanged({ start: 10, end: 100, savedStart: 10, savedEnd: 100 }), false)
  assert.equal(trimChanged({ start: 11, end: 100, savedStart: 10, savedEnd: 100 }), true)
  assert.equal(trimChanged({ start: 10, end: 99, savedStart: 10, savedEnd: 100 }), true)
})

test('trimutkastet bär intervallet och kapitellistan i serverns ordning', () => {
  const payload = trimDraftPayload(12.4, 99.6, [
    { label: '§ 1', offsetSeconds: 20 },
    { label: 'Anna', offsetSeconds: 55 },
  ])
  assert.deepEqual(payload, {
    startOffsetSeconds: 12,
    endOffsetSeconds: 100,
    chapters: [{ index: 0, label: '§ 1', offsetSeconds: 20 }, { index: 1, label: 'Anna', offsetSeconds: 55 }],
  })
})

test('UNG-290: sparat trimutkast vinner över inspelningen, även när inspelningen kommer efter utkastet', () => {
  const draft = { startOffsetSeconds: 120, endOffsetSeconds: 3000 }
  const recording = { durationSeconds: 3600, trimRange: null }
  // Ommontering: projektet (med utkast) finns direkt, inspelningen hämtas efteråt.
  assert.deepEqual(overviewTrim(draft, null), { start: 120, end: 3000 })
  assert.deepEqual(overviewTrim(draft, recording), { start: 120, end: 3000 })
  assert.deepEqual(overviewTrim(draft, { durationSeconds: 3600, trimRange: { startOffsetSeconds: 10, endOffsetSeconds: 20 } }), { start: 120, end: 3000 })
})

test('utan utkast gäller inspelningens trimning, annars hela inspelningen; utan båda ändras inget', () => {
  assert.deepEqual(overviewTrim(null, { durationSeconds: 3600, trimRange: { startOffsetSeconds: 10, endOffsetSeconds: 20 } }), { start: 10, end: 20 })
  assert.deepEqual(overviewTrim(null, { durationSeconds: 3600 }), { start: 0, end: 3600 })
  assert.equal(overviewTrim(null, null), null)
})

const base = { published: false, serverChanges: false, localDirty: false, busy: false, readOnly: false }

test('före publicering: inga publicerings- eller förkastaknappar', () => {
  const a = headerActions(base)
  assert.deepEqual(
    [a.showPublishChanges, a.showDiscard, a.unpublishedBadge],
    [false, false, false],
  )
  assert.equal(headerActions({ ...base, localDirty: true }).unpublishedBadge, true)
})

test('publicerat projekt utan ändringar: Publicera ändringar finns men är avstängd, och inget att förkasta', () => {
  const a = headerActions({ ...base, published: true })
  assert.deepEqual([a.showPublishChanges, a.publishChangesEnabled, a.showDiscard, a.unpublishedBadge], [true, false, false, false])
})

test('publicerat projekt med ändringar på servern: publicera och förkasta går att trycka', () => {
  const a = headerActions({ ...base, published: true, serverChanges: true })
  assert.deepEqual([a.publishChangesEnabled, a.showDiscard, a.discardEnabled, a.unpublishedBadge], [true, true, true, true])
})

test('osparade ändringar går att publicera (de sparas först) men förkastas inte på servern', () => {
  const a = headerActions({ ...base, published: true, localDirty: true })
  assert.deepEqual([a.publishChangesEnabled, a.showDiscard, a.unpublishedBadge], [true, false, true])
})

test('knapparna är avstängda medan något pågår och i skrivskyddat läge', () => {
  const busy = headerActions({ ...base, published: true, serverChanges: true, busy: true })
  assert.deepEqual([busy.publishChangesEnabled, busy.discardEnabled], [false, false])
  const readOnly = headerActions({ ...base, published: true, serverChanges: true, readOnly: true })
  assert.deepEqual([readOnly.publishChangesEnabled, readOnly.discardEnabled], [false, false])
})

test('meddelandet efter Publicera ändringar säger om undertexterna väntar', () => {
  assert.match(publishChangesNotice({ captionsPublished: true }), /Kapitel och undertexter/)
  assert.equal(publishChangesNotice({ captionsPublished: false }), 'Ändringarna är publicerade.')
})

test('konfliktkoderna är utkastets och undertexternas', () => {
  assert.equal(isConflictCode('draft_conflict'), true)
  assert.equal(isConflictCode('version_conflict'), true)
  assert.equal(isConflictCode('validation_failed'), false)
  assert.equal(isConflictCode(undefined), false)
})

test('konfliktdialogen säger vad som ändrats och vem som sparade undertexterna', () => {
  assert.equal(conflictDescription({ action: 'save', captionsChanged: true, captionsChangedBy: 'Eva' }), 'Eva har sparat undertexterna sedan du öppnade redigeraren.')
  assert.equal(conflictDescription({ action: 'save', captionsChanged: true, captionsChangedBy: ' ' }), 'Någon annan har sparat undertexterna sedan du öppnade redigeraren.')
  assert.equal(conflictDescription({ action: 'publish', captionsChanged: false }), 'Någon annan har ändrat kapitel eller trimning sedan du öppnade redigeraren.')
})

test('Skriv över gör om det som stoppades', () => {
  assert.equal(overwriteLabel('save'), 'Skriv över')
  assert.equal(overwriteLabel('publish'), 'Skriv över och publicera')
  assert.equal(overwriteLabel('discard'), 'Förkasta ändå')
})
