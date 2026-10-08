import assert from 'node:assert/strict'
import { test } from 'node:test'
import { chaptersExportAvailability, copiedMessage, importAvailability, savedMessage, videoDownloadAvailability } from './exportImportLogic.ts'

const rec = (state: string, source = 'Live-sändning') => ({ id: 'r1', state: state as 'recorded', source })

test('kapitel går att exportera när sändningen är avslutad och videon klar, annars med förklaring', () => {
  assert.equal(chaptersExportAvailability({ publicMode: 'ondemand', recording: rec('published') }).enabled, true)
  assert.equal(chaptersExportAvailability({ publicMode: 'after', recording: rec('trimmed') }).enabled, true)
  assert.match(chaptersExportAvailability({ publicMode: 'after', recording: null }).reason ?? '', /ingen video/)
  assert.match(chaptersExportAvailability({ publicMode: 'live', recording: rec('recording') }).reason ?? '', /avslutad/)
  assert.match(chaptersExportAvailability({ publicMode: 'after', recording: rec('awaitingApproval') }).reason ?? '', /Godkänn/)
  assert.match(chaptersExportAvailability({ publicMode: 'after', recording: rec('processing') }).reason ?? '', /inte klar/)
})

test('MP4-nedladdning: bara för publicerad video, inte extern, inte innan godkännande (reglerna från fliken Ladda ner)', () => {
  assert.equal(videoDownloadAvailability({ publicMode: 'ondemand', recording: rec('published') }).enabled, true)
  assert.match(videoDownloadAvailability({ publicMode: 'after', recording: rec('trimmed') }).reason ?? '', /publicerad som ondemand/)
  assert.match(videoDownloadAvailability({ publicMode: 'ondemand', recording: rec('published', 'external') }).reason ?? '', /extern adress/)
  assert.match(videoDownloadAvailability({ publicMode: 'ondemand', recording: rec('awaitingApproval') }).reason ?? '', /Godkänn/)
  assert.match(videoDownloadAvailability({ publicMode: 'ondemand', recording: null }).reason ?? '', /ingen video/)
  assert.match(videoDownloadAvailability({ publicMode: 'live', recording: rec('recorded') }).reason ?? '', /avslutad/)
})

test('import görs inne i projektet: från listan är raderna inaktiva med en förklaring', () => {
  const fromList = importAvailability({})
  assert.equal(fromList.chapters.enabled, false)
  assert.equal(fromList.chapters.reason, 'Görs inne i projektet.')
  const inProject = importAvailability({ onImportChapters: () => {}, onOpenVideoActions: () => {} })
  assert.deepEqual([inProject.chapters.enabled, inProject.captions.enabled, inProject.upload.enabled], [true, true, true])
})

test('meddelandena nämner vad som hände', () => {
  assert.equal(copiedMessage(12), '12 kapitel kopierades. Klistra in dem i videons beskrivning på YouTube.')
  assert.equal(savedMessage('KF - kapitel.docx'), 'Sparad som "KF - kapitel.docx". Filen ligger bland dina hämtade filer.')
})
