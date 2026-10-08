import assert from 'node:assert/strict'
import { test } from 'node:test'
import type { Chapter } from '../../data/types.ts'
import {
  buildExportChapters, canExportChapters, exportFileName, videoWindowOf, formatYoutubeTime, toUngapChaptersJson, toWebVttChapters, toYoutubeChapters,
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

test('YouTube: m:ss-format under en timme, hh:mm:ss på alla rader när något kapitel passerar en timme', () => {
  assert.equal(formatYoutubeTime(222, false), '03:42')
  assert.equal(formatYoutubeTime(2825, false), '47:05')
  assert.equal(formatYoutubeTime(4368, true), '01:12:48')
  const short = toYoutubeChapters(buildExportChapters(meeting, whole), 3600)
  assert.equal(short.text.split('\n')[0], '00:00 Mötets öppnande')
  assert.ok(short.valid)
  const long = toYoutubeChapters([
    { id: '1', kind: 'agendaItem', title: 'A', start: 0, end: 755 }, { id: '2', kind: 'agendaItem', title: 'B', start: 755, end: 3822 },
    { id: '3', kind: 'agendaItem', title: 'C', start: 3822, end: 8287 },
  ], 8287)
  assert.equal(long.text, '00:00:00 A\n00:12:35 B\n01:03:42 C')
})

test('YouTube: en inledande rad läggs till när första kapitlet börjar efter 00:00, och det förklaras', () => {
  const result = toYoutubeChapters([
    { id: '1', kind: 'agendaItem', title: 'A', start: 30, end: 100 }, { id: '2', kind: 'agendaItem', title: 'B', start: 100, end: 200 },
  ], 300)
  assert.equal(result.text.split('\n')[0], '00:00 Start')
  assert.equal(result.count, 3)
  assert.ok(result.valid)
  assert.ok(result.notes.some((note) => note.includes('inledande rad')))
})

test('YouTube: kapitel kortare än tio sekunder hoppas över, men aldrig det första', () => {
  const result = toYoutubeChapters([
    { id: '1', kind: 'agendaItem', title: 'A', start: 0, end: 5 }, { id: '2', kind: 'agendaItem', title: 'B', start: 5, end: 100 },
    { id: '3', kind: 'agendaItem', title: 'C', start: 100, end: 104 }, { id: '4', kind: 'agendaItem', title: 'D', start: 104, end: 300 },
  ], 300)
  assert.equal(result.text, '00:00 A\n00:05 B\n01:44 D')
  assert.ok(result.notes.some((note) => note.includes('hoppades över')))
})

test('YouTube: det sista kapitlet måste också vara minst tio sekunder mot videons slut', () => {
  const result = toYoutubeChapters([
    { id: '1', kind: 'agendaItem', title: 'A', start: 0, end: 100 }, { id: '2', kind: 'agendaItem', title: 'B', start: 100, end: 200 },
    { id: '3', kind: 'agendaItem', title: 'C', start: 200, end: 205 }, { id: '4', kind: 'agendaItem', title: 'D', start: 295, end: 300 },
  ], 300)
  assert.equal(result.text, '00:00 A\n01:40 B\n03:20 C')
})

test('YouTube: färre än tre kapitel ger en förklaring men text att kopiera, och inga kapitel ger tomt', () => {
  const two = toYoutubeChapters([
    { id: '1', kind: 'agendaItem', title: 'A', start: 0, end: 100 }, { id: '2', kind: 'agendaItem', title: 'B', start: 100, end: 200 },
  ], 200)
  assert.equal(two.valid, false)
  assert.equal(two.count, 2)
  assert.ok(two.notes.some((note) => note.includes('minst 3')))
  const none = toYoutubeChapters([], 200)
  assert.equal(none.text, '')
  assert.equal(none.count, 0)
  assert.equal(none.valid, false)
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
  assert.equal(exportFileName('KF 7/10: budget?', 'kapitel youtube', 'txt'), 'KF 7 10 budget - kapitel youtube.txt')
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

