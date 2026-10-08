import assert from 'node:assert/strict'
import { test } from 'node:test'
import type { Chapter } from '../../data/types.ts'
import {
  buildExportChapters, canExportChapters, exportFileName, toUngapChaptersJson, toWebVttChapters, videoWindowOf,
} from './chapterExport.ts'

const chapter = (id: string, kind: Chapter['kind'], label: string, offsetSeconds: number, extra: Partial<Chapter> = {}): Chapter => ({ chapterId: id, kind, label, offsetSeconds, ...extra })
const whole = { startOffsetSeconds: 0, durationSeconds: 3600 }

const meeting: Chapter[] = [
  chapter('c1', 'agendaItem', 'Mötets öppnande', 0),
  chapter('c2', 'person', 'Mira Lind (M)', 40),
  chapter('c3', 'agendaItem', '§ 12 Budget 2027', 755),
  chapter('c4', 'person', 'Ola Nord (S)', 800),
  chapter('c5', 'agendaItem', '§ 13 Ny detaljplan', 2230),
  chapter('c6', 'agendaItem', '§ 14 Motion', 3000),
]

test('bara dagordningspunkter som standard, med nästa kapitels start som slut och videons slut för det sista', () => {
  const chapters = buildExportChapters(meeting, whole)
  assert.deepEqual(chapters.map((c) => [c.title, c.start, c.end]), [
    ['Mötets öppnande', 0, 755], ['§ 12 Budget 2027', 755, 2230], ['§ 13 Ny detaljplan', 2230, 3000], ['§ 14 Motion', 3000, 3600],
  ])
})

test('talare ingår som egna kapitel när det väljs', () => {
  const chapters = buildExportChapters(meeting, whole, { includeSpeakers: true })
  assert.equal(chapters.length, 6)
  assert.deepEqual(chapters.map((c) => c.kind), ['agendaItem', 'person', 'agendaItem', 'person', 'agendaItem', 'agendaItem'])
})

test('pauser, rensningar, tomma etiketter och kapitel utan position tas inte med', () => {
  const chapters = buildExportChapters([
    chapter('a', 'agendaItem', 'Öppning', 0), chapter('p', 'pauseIn', 'Kaffe', 100), chapter('q', 'pauseOut', 'Paus slut', 200),
    chapter('r', 'agendaItem', 'Rensat', 250), chapter('e', 'agendaItem', '   ', 300),
    chapter('u', 'agendaItem', 'Ej synkad', 400, { synced: false }), chapter('n', 'agendaItem', 'Utan tid', 0, { timing: 'untimed' }),
    chapter('z', 'agendaItem', 'Slut', 500),
  ], { startOffsetSeconds: 0, durationSeconds: 600 })
  assert.deepEqual(chapters.map((c) => c.title), ['Öppning', 'Slut'])
})

test('trimmad video: tiden räknas från trimstarten, och kapitlet som pågick vid starten flyttas till 0', () => {
  const trimmed = { startOffsetSeconds: 1000, durationSeconds: 1500 }
  const chapters = buildExportChapters(meeting, trimmed)
  assert.deepEqual(chapters.map((c) => [c.title, c.start, c.end]), [
    ['§ 12 Budget 2027', 0, 1230], // började vid 755, före trimstarten, men pågick när videon började
    ['§ 13 Ny detaljplan', 1230, 1500], // 2230 - 1000; slutet vid videons slut
  ])
})

test('kapitel efter videons slut hör inte till den publicerade videon', () => {
  const chapters = buildExportChapters(meeting, { startOffsetSeconds: 0, durationSeconds: 1000 })
  assert.deepEqual(chapters.map((c) => c.title), ['Mötets öppnande', '§ 12 Budget 2027'])
})

test('kapitlet vid trimstarten behålls (inget extra flyttas)', () => {
  const chapters = buildExportChapters(meeting, { startOffsetSeconds: 755, durationSeconds: 2500 })
  assert.deepEqual(chapters.map((c) => [c.title, c.start]), [['§ 12 Budget 2027', 0], ['§ 13 Ny detaljplan', 1475], ['§ 14 Motion', 2245]])
})

test('WebVTT-kapitel: intervall och titel, tider med millisekunder, specialtecken skyddade', () => {
  const vtt = toWebVttChapters([
    { id: '1', kind: 'agendaItem', title: 'Mötets öppnande', start: 0, end: 755 },
    { id: '2', kind: 'agendaItem', title: 'Skatter & avgifter <nytt> a --> b', start: 755, end: 3822.5 },
  ])
  assert.equal(vtt, [
    'WEBVTT', '',
    '00:00:00.000 --> 00:12:35.000', 'Mötets öppnande', '',
    '00:12:35.000 --> 01:03:42.500', 'Skatter &amp; avgifter &lt;nytt> a –> b', '',
  ].join('\n'))
  assert.equal(toWebVttChapters([]), 'WEBVTT\n\n')
})

test('ungap Chapters (.json): versionssatt, alla sorter, i videons tid', () => {
  const json = JSON.parse(toUngapChaptersJson(buildExportChapters(meeting, whole, { includeSpeakers: true }), { title: 'KF 7 okt', durationSeconds: 3600 }))
  assert.equal(json.version, 1)
  assert.equal(json.title, 'KF 7 okt')
  assert.equal(json.durationSeconds, 3600)
  assert.equal(json.chapters.length, 6)
  assert.deepEqual(json.chapters[2], { id: 'c3', kind: 'agendaItem', start: 755, end: 800, title: '§ 12 Budget 2027' })
})

test('filnamn utan tecken som operativsystemen inte tål', () => {
  assert.equal(exportFileName('KF 7/10: budget?', 'kapitel', 'vtt'), 'KF 7 10 budget - kapitel.vtt')
  assert.equal(exportFileName('   ', 'kapitel', 'json'), 'projekt - kapitel.json')
})

test('videons fönster: trimmad version börjar vid trimstarten, otrimmad vid 0', () => {
  assert.deepEqual(videoWindowOf({ kind: 'trimmed', durationSeconds: 1500, trimRange: { startOffsetSeconds: 1000, endOffsetSeconds: 2500 } }), { startOffsetSeconds: 1000, durationSeconds: 1500 })
  assert.deepEqual(videoWindowOf({ kind: 'original', durationSeconds: 3600 }), { startOffsetSeconds: 0, durationSeconds: 3600 })
  assert.deepEqual(videoWindowOf({ kind: 'trimmed', durationSeconds: 900 }), { startOffsetSeconds: 0, durationSeconds: 900 }) // trimRange saknas
})

test('kapitel går att exportera först när sändningen är avslutad och videon klar', () => {
  const rec = (state: 'recording' | 'processing' | 'recorded' | 'trimmed' | 'published') => ({ id: 'r1', state })
  assert.equal(canExportChapters({ publicMode: 'ondemand', recording: rec('published') }), true)
  assert.equal(canExportChapters({ publicMode: 'after', recording: rec('trimmed') }), true)
  assert.equal(canExportChapters({ publicMode: 'after', recording: rec('recorded') }), true)
  assert.equal(canExportChapters({ publicMode: 'live', recording: rec('recorded') }), false)
  assert.equal(canExportChapters({ publicMode: 'after', recording: rec('processing') }), false)
  assert.equal(canExportChapters({ publicMode: 'after', recording: null }), false)
})

