import assert from 'node:assert/strict'
import { test } from 'node:test'
import {
  addCue, deleteCue, isShort, mergeInfo, mergeWithNext, mergeWithPrevious, moveEdge, moveHeadToPrevious, moveTailToNext, nudge, setTime, shiftFrom, shortIndexes,
  newCueTime, sortedForSave, splitCue, validateCues, withoutEmpty, wrapAny, wrapBalanced, diffState, type EditCue,
} from './captionEditOps.ts'

const cue = (id: number, start: number, end: number, text: string): EditCue => ({ id, start, end, text })
const words = (cues: readonly EditCue[]) => cues.flatMap((c) => c.text.split(/\s+/).filter(Boolean))

test('radbrytning: en rad om det ryms, annars jämnast möjliga delning, null om det inte går', () => {
  assert.equal(wrapBalanced('Kort text'), 'Kort text')
  assert.equal(wrapBalanced('Jag yrkar bifall till förslaget från kommunstyrelsen'), 'Jag yrkar bifall till\nförslaget från kommunstyrelsen')
  assert.equal(wrapBalanced('x'.repeat(90)), null)
  assert.equal(wrapBalanced('   '), '')
  const long = 'ett två tre fyra fem sex sju åtta nio tio elva tolv tretton fjorton femton sexton sjutton arton nitton tjugo'
  assert.equal(wrapBalanced(long), null)
})

test('sammanslagning är exakt: första start, sista slut, texten fogad och orden i ordning', () => {
  const cues = [cue(1, 10, 11.5, 'Ja.'), cue(2, 11.9, 15.25, 'Tack ordförande, ledamöter.'), cue(3, 20, 22, 'Nästa.')]
  const result = mergeWithNext(cues, 0)
  assert.ok(result.ok)
  assert.equal(result.cues.length, 2)
  assert.deepEqual([result.cues[0].start, result.cues[0].end], [10, 15.25])
  assert.equal(result.cues[0].text.replace('\n', ' '), 'Ja. Tack ordförande, ledamöter.')
  assert.equal(result.cues[0].id, 1)
  assert.deepEqual(words(result.cues), words(cues))
  assert.deepEqual(result.cues[1], cues[2])
  assert.equal(result.focusIndex, 0)
})

test('sammanslagning rör inte indatan', () => {
  const cues = [cue(1, 0, 1, 'a'), cue(2, 1, 2, 'b')]
  const copy = JSON.parse(JSON.stringify(cues))
  mergeWithNext(cues, 0)
  assert.deepEqual(cues, copy)
})

test('sammanslagning upp åt är samma sak som att slå ihop föregående med den här', () => {
  const cues = [cue(1, 0, 2, 'Första delen'), cue(2, 2.2, 4, 'andra delen')]
  const up = mergeWithPrevious(cues, 1)
  const down = mergeWithNext(cues, 0)
  assert.ok(up.ok && down.ok)
  assert.deepEqual(up.cues, down.cues)
  assert.equal(up.focusIndex, 0)
  assert.equal(mergeWithPrevious(cues, 0).ok, false)
  assert.equal(mergeWithNext(cues, 1).ok, false)
})

test('en sammanslagning som blir över två rader tillåts och radbryts i så många rader som behövs', () => {
  const a = 'Det här är en ganska lång replik som nästan fyller två rader helt och hållet'
  const cues = [cue(1, 0, 5, a), cue(2, 5, 8, 'och ännu fler ord här')]
  const result = mergeWithNext(cues, 0)
  assert.equal(result.ok, true)
  const text = result.ok ? result.cues[0].text : ''
  assert.ok(text.split('\n').length >= 3)
  assert.ok(text.split('\n').every((line) => line.length <= 42))
  assert.equal(text.replace(/\s+/g, ' '), `${a} och ännu fler ord här`)
  assert.equal(mergeInfo(cues, 0)?.fits, false)
})

test('wrapAny: som wrapBalanced när det går, annars så många rader som behövs utan att tappa ord', () => {
  assert.equal(wrapAny('Kort text'), 'Kort text')
  assert.equal(wrapAny('Jag yrkar bifall till förslaget från kommunstyrelsen'), 'Jag yrkar bifall till\nförslaget från kommunstyrelsen')
  const long = Array.from({ length: 40 }, (_, i) => `ord${i}`).join(' ')
  const wrapped = wrapAny(long)
  assert.ok(wrapped.split('\n').length >= 5)
  assert.ok(wrapped.split('\n').every((line) => line.length <= 42))
  assert.equal(wrapped.replace(/\n/g, ' '), long)
  assert.equal(wrapAny('   '), '')
})

test('förhandsvisningen: paus, längd, rader och om det ryms', () => {
  const info = mergeInfo([cue(1, 0, 2, 'Ja.'), cue(2, 3.5, 6, 'Tack så mycket.')], 0)
  assert.ok(info)
  assert.equal(info.gapSeconds, 1.5)
  assert.equal(info.durationSeconds, 6)
  assert.equal(info.lines, 1)
  assert.equal(info.fits, true)
  assert.equal(mergeInfo([cue(1, 0, 2, 'a'), cue(2, 1.5, 3, 'b')], 0)?.gapSeconds, 0) // överlapp räknas som ingen paus
  assert.equal(mergeInfo([cue(1, 0, 2, 'a')], 0), null)
})

test('markören hamnar där texterna fogades', () => {
  const result = mergeWithNext([cue(1, 0, 2, 'Första delen'), cue(2, 2, 4, 'andra delen')], 0)
  assert.ok(result.ok)
  assert.equal(result.caret, 'Första delen'.length)
})

test('delning vid markören: tiden proportionell mot tecken, kant i kant, orden oförändrade', () => {
  const cues = [cue(1, 0, 10, 'Det första yttrandet gäller budgeten för nästa år')]
  const text = cues[0].text
  const caret = text.indexOf(' gäller')
  const result = splitCue(cues, 0, caret, 99)
  assert.ok(result.ok)
  assert.equal(result.cues.length, 2)
  assert.equal(result.cues[0].end, result.cues[1].start)
  assert.equal(result.cues[0].start, 0)
  assert.equal(result.cues[1].end, 10)
  assert.equal(result.cues[1].id, 99)
  assert.equal(result.focusIndex, 1)
  assert.deepEqual(words(result.cues), words(cues))
  const expected = (10 * 'Det första yttrandet'.length) / ('Det första yttrandet'.length + 'gäller budgeten för nästa år'.length)
  assert.ok(Math.abs(result.cues[0].end - expected) < 0.001)
})

test('delning vid videons position använder tiden om den ligger inne i repliken', () => {
  const cues = [cue(1, 10, 20, 'Före delningen och efter delningen')]
  const caret = 'Före delningen'.length
  const atPlayhead = splitCue(cues, 0, caret, 2, 13.37)
  assert.ok(atPlayhead.ok)
  assert.equal(atPlayhead.cues[0].end, 13.37)
  // För nära kanten: tiden används inte, delningen blir proportionell.
  const nearEdge = splitCue(cues, 0, caret, 2, 10.1)
  assert.ok(nearEdge.ok)
  assert.notEqual(nearEdge.cues[0].end, 10.1)
  // Utanför repliken: proportionell.
  const outside = splitCue(cues, 0, caret, 2, 50)
  assert.ok(outside.ok)
  assert.ok(outside.cues[0].end < 20)
})

test('delning kräver att markören ligger mellan ord', () => {
  const cues = [cue(1, 0, 5, 'Två ord')]
  assert.equal(splitCue(cues, 0, 0, 2).ok, false)
  assert.equal(splitCue(cues, 0, cues[0].text.length, 2).ok, false)
  assert.equal(splitCue([], 0, 1, 2).ok, false)
})

test('delning och sammanslagning tar ut varandra i text och yttertider', () => {
  const original = [cue(1, 4, 12, 'Det första yttrandet gäller budgeten för nästa år')]
  const split = splitCue(original, 0, 'Det första yttrandet'.length, 2)
  assert.ok(split.ok)
  const merged = mergeWithNext(split.cues, 0)
  assert.ok(merged.ok)
  assert.equal(merged.cues.length, 1)
  assert.deepEqual([merged.cues[0].start, merged.cues[0].end], [4, 12])
  assert.equal(merged.cues[0].text.replace('\n', ' '), original[0].text)
})

test('flytta ord till nästa: orden byter replik, gränsen fördelas efter tecken, pausen bevaras', () => {
  const cues = [cue(1, 0, 4, 'Vi går igenom ärendet och beslutar'), cue(2, 4.5, 8, 'om förslaget.')]
  const caret = 'Vi går igenom ärendet'.length
  const result = moveTailToNext(cues, 0, caret)
  assert.ok(result.ok)
  assert.equal(result.cues[0].text, 'Vi går igenom ärendet')
  assert.equal(result.cues[1].text.replace('\n', ' '), 'och beslutar om förslaget.')
  assert.deepEqual(words(result.cues), words(cues))
  assert.equal(result.cues[0].start, 0)
  assert.equal(result.cues[1].end, 8)
  // Pausen mellan dem är oförändrad (0,5 s).
  assert.ok(Math.abs(result.cues[1].start - result.cues[0].end - 0.5) < 0.002)
  assert.equal(result.focusIndex, 1)
})

test('flytta ord till föregående: orden i början flyttas till föregående replik', () => {
  const cues = [cue(1, 0, 3, 'Jag yrkar'), cue(2, 3, 7, 'bifall till förslaget från styrelsen')]
  const result = moveHeadToPrevious(cues, 1, 'bifall'.length)
  assert.ok(result.ok)
  assert.equal(result.cues[0].text, 'Jag yrkar bifall')
  assert.equal(result.cues[1].text.replace('\n', ' '), 'till förslaget från styrelsen')
  assert.deepEqual(words(result.cues), words(cues))
  assert.equal(result.cues[0].start, 0)
  assert.equal(result.cues[1].end, 7)
})

test('flytta ord till en full replik tillåts (överfullt är normalläge), men markören måste stå rätt', () => {
  const full = 'Det här är en ganska lång replik som nästan fyller två rader helt och hållet'
  const cues = [cue(1, 0, 4, 'Kort start och ett ord'), cue(2, 4, 8, full)]
  const moved = moveTailToNext(cues, 0, 'Kort start och'.length)
  assert.ok(moved.ok)
  assert.equal(words(moved.cues).join(' '), words(cues).join(' '))
  assert.equal(moveTailToNext(cues, 0, 0).ok, false)
  assert.equal(moveTailToNext(cues, 0, cues[0].text.length).ok, false)
  assert.equal(moveTailToNext([cues[0]], 0, 5).ok, false)
  assert.equal(moveHeadToPrevious([cues[0]], 0, 5).ok, false)
})

test('ta bort en replik och lägg till en ny vid en tid', () => {
  const cues = [cue(1, 0, 2, 'a'), cue(2, 5, 7, 'b'), cue(3, 10, 12, 'c')]
  const deleted = deleteCue(cues, 1)
  assert.ok(deleted.ok)
  assert.deepEqual(deleted.cues.map((c) => c.id), [1, 3])
  assert.equal(deleteCue(cues, 9).ok, false)

  const added = addCue(cues, 8, 50)
  assert.ok(added.ok)
  assert.deepEqual(added.cues.map((c) => c.id), [1, 2, 50, 3])
  assert.deepEqual([added.cues[2].start, added.cues[2].end, added.cues[2].text], [8, 9.96, ''])
  assert.equal(added.focusIndex, 2)
  const atEnd = addCue(cues, 20, 51)
  assert.ok(atEnd.ok)
  assert.deepEqual([atEnd.cues[3].start, atEnd.cues[3].end], [20, 22])
})

test('ställ in och finjustera start och slut', () => {
  const cues = [cue(1, 10, 14, 'a')]
  const start = setTime(cues, 0, 'start', 11.2345)
  assert.ok(start.ok)
  assert.equal(start.cues[0].start, 11.235)
  assert.equal(setTime(cues, 0, 'start', 14).ok, false)
  assert.equal(setTime(cues, 0, 'end', 10).ok, false)
  const moved = nudge(cues, 0, 'end', 0.5)
  assert.ok(moved.ok)
  assert.equal(moved.cues[0].end, 14.5)
  const early = nudge([cue(1, 0.05, 4, 'a')], 0, 'start', -0.5)
  assert.ok(early.ok)
  assert.equal(early.cues[0].start, 0) // aldrig före 0
})

test('förskjutning: vald rad och alla efter flyttas med exakt vald tid, de före rörs inte', () => {
  const cues = [cue(1, 1, 3, 'a'), cue(2, 5, 7, 'b'), cue(3, 9, 11, 'c')]
  const shifted = shiftFrom(cues, 1, -0.75)
  assert.ok(shifted.ok)
  assert.deepEqual(shifted.cues.map((c) => [c.start, c.end]), [[1, 3], [4.25, 6.25], [8.25, 10.25]])
  const all = shiftFrom(cues, 0, 2)
  assert.ok(all.ok)
  assert.deepEqual(all.cues.map((c) => c.start), [3, 7, 11])
  assert.equal(shiftFrom(cues, 0, -2).ok, false)
  assert.equal(shiftFrom(cues, 7, 1).ok, false)
})

test('kort ruta: högst två ord eller under 1,2 s, och navigering mellan dem', () => {
  assert.equal(isShort(cue(1, 0, 3, 'Ja.')), true)
  assert.equal(isShort(cue(1, 0, 3, 'Ja tack')), true)
  assert.equal(isShort(cue(1, 0, 0.8, 'Ett längre yttrande här')), true)
  assert.equal(isShort(cue(1, 0, 3, 'Ett normalt yttrande')), false)
  assert.deepEqual(shortIndexes([cue(1, 0, 3, 'Ja.'), cue(2, 3, 7, 'Ett normalt yttrande'), cue(3, 7, 8, 'Nej')]), [0, 2])
})

test('kontroll: orimlig tid är fel, tom text, överlapp och fel ordning är varningar', () => {
  const issues = validateCues([cue(1, 0, 3, 'a'), cue(2, 2.5, 5, 'b'), cue(3, 1, 4, 'c'), cue(4, 6, 6, 'd'), cue(5, 7, 9, '  ')])
  const byIndex = (index: number) => issues.filter((issue) => issue.index === index).map((issue) => issue.kind)
  assert.deepEqual(byIndex(0), [])
  assert.deepEqual(byIndex(1), ['overlap'])
  assert.deepEqual(byIndex(2), ['order'])
  assert.deepEqual(byIndex(3), ['badTime'])
  assert.deepEqual(byIndex(4), ['empty'])
  assert.deepEqual(issues.filter((issue) => issue.error).map((issue) => issue.index), [3]) // tom text tas bort vid sparning, inget fel
  assert.deepEqual(validateCues([cue(1, 0, 3, 'a'), cue(2, 3, 5, 'b')]), [])
})

test('sortering inför sparning: på starttid och stabilt', () => {
  const sorted = sortedForSave([cue(1, 5, 6, 'b'), cue(2, 1, 2, 'a'), cue(3, 5, 6, 'c'), cue(4, 5, 5.5, 'd')])
  assert.deepEqual(sorted.map((c) => c.id), [2, 4, 1, 3])
})

test('ändringsspårning: ändrad text eller tid, nya, borttagna och omordnade repliker', () => {
  const saved = [cue(1, 0, 2, 'a'), cue(2, 3, 5, 'b'), cue(3, 6, 8, 'c')]
  assert.equal(diffState(saved, saved).dirty, false)

  const text = diffState(saved, [saved[0], { ...saved[1], text: 'bb' }, saved[2]])
  assert.deepEqual([...text.changedIds], [2])
  assert.equal(text.dirty, true)

  const time = diffState(saved, [saved[0], { ...saved[1], end: 5.1 }, saved[2]])
  assert.deepEqual([...time.changedIds], [2])

  const added = diffState(saved, [...saved, cue(-1, 9, 10, 'ny')])
  assert.deepEqual([...added.changedIds], [-1])
  assert.equal(added.removed, 0)

  const removed = diffState(saved, [saved[0], saved[2]])
  assert.equal(removed.removed, 1)
  assert.equal(removed.dirty, true)
  assert.equal(removed.changedIds.size, 0)

  const reordered = diffState(saved, [saved[1], saved[0], saved[2]])
  assert.equal(reordered.reordered, true)
  assert.equal(reordered.dirty, true)
})

test('en ångrad ändring är inte längre en ändring', () => {
  const saved = [cue(1, 0, 2, 'a'), cue(2, 3, 5, 'b')]
  const merged = mergeWithNext(saved, 0)
  assert.ok(merged.ok)
  assert.equal(diffState(saved, merged.cues).dirty, true)
  assert.equal(diffState(saved, saved).dirty, false)
})

test('dra kant: fri kant flyttas, begränsas av grannen (inget överlapp) och av minsta längd', () => {
  const list = [cue(1, 0, 3, 'a'), cue(2, 4, 8, 'b'), cue(3, 10, 12, 'c')]
  assert.deepEqual(moveEdge(list, 1, 'start', 4.5).map((c) => [c.start, c.end]), [[0, 3], [4.5, 8], [10, 12]])
  assert.equal(moveEdge(list, 1, 'start', 2)[1].start, 3) // stoppas vid föregåendes slut
  assert.equal(moveEdge(list, 1, 'end', 11)[1].end, 10) // stoppas vid nästas start
  assert.equal(moveEdge(list, 1, 'start', 99)[1].start, 7.7) // minst 0,3 s kvar
  assert.equal(moveEdge(list, 1, 'end', 0)[1].end, 4.3)
  assert.equal(moveEdge(list, 0, 'start', -5)[0].start, 0) // aldrig före 0
  assert.deepEqual(moveEdge(list, 5, 'start', 1), list) // ingen sådan replik
})

test('dra kant: gemensam gräns flyttar båda repliker och bevarar minsta längd hos båda', () => {
  const list = [cue(1, 0, 4, 'a'), cue(2, 4, 8, 'b'), cue(3, 8.03, 12, 'c')]
  const earlier = moveEdge(list, 1, 'start', 3)
  assert.deepEqual(earlier.map((c) => [c.start, c.end]), [[0, 3], [3, 8], [8.03, 12]])
  assert.equal(moveEdge(list, 1, 'start', 0)[0].end, 0.3) // föregåendes längd bevaras
  const later = moveEdge(list, 1, 'end', 9)
  assert.deepEqual(later.map((c) => [c.start, c.end]), [[0, 4], [4, 9], [9, 12]]) // 8,03 räknas som gemensam gräns
  assert.equal(moveEdge(list, 1, 'end', 99)[2].start, 11.7)
  assert.deepEqual(list.map((c) => [c.start, c.end]), [[0, 4], [4, 8], [8.03, 12]]) // indata orörd
})

test('ny tom ruta efter: videons position om den ryms, annars strax efter repliken, aldrig närmare grannen än 0,3 s', () => {
  const list = [cue(1, 0, 3, 'a'), cue(2, 6, 9, 'b'), cue(3, 6.5, 9, 'c')]
  assert.equal(newCueTime(list, 0, 'after', 4.2), 4.2) // videons position inne i utrymmet
  assert.equal(newCueTime(list, 0, 'after', 1), 1) // videons position inne i rutan själv gäller också (den rutans slut kortas)
  assert.equal(newCueTime(list, 0, 'after', 99), 3.05)
  assert.equal(newCueTime(list, 1, 'after', 0), 6.3) // trångt (nästa rutas start ligger för nära): 0,3 s efter rutans egen start
  assert.equal(newCueTime(list, 2, 'after', 0), 9.05) // sista repliken: strax efter slutet
  assert.equal(newCueTime(list, 1, 'after', 6.45), 6.3)
  assert.equal(newCueTime([cue(1, 0, 3, 'a'), cue(2, 8, 9, 'b')], 0, 'after', 7.9), 3.05) // för nära nästa ruta: strax efter slutet i stället
})

test('ny tom ruta före: videons position om den ryms, annars en sekund före, men inte före föregående + 0,3 s', () => {
  const list = [cue(1, 2, 4, 'a'), cue(2, 10, 12, 'b')]
  assert.equal(newCueTime(list, 1, 'before', 7), 7)
  assert.equal(newCueTime(list, 1, 'before', 0), 9) // en sekund före
  assert.equal(newCueTime(list, 0, 'before', 99), 1) // första repliken: en sekund före, inte före 0
  assert.equal(newCueTime([cue(1, 0.5, 2, 'a')], 0, 'before', 0), 0) // trångt före första repliken: början, aldrig negativt
  assert.equal(newCueTime(list, 5, 'after', 3), 3) // ingen sådan replik
})

test('tomma repliker tas bort vid sparning', () => {
  const list = [cue(1, 0, 2, 'a'), cue(2, 3, 5, '  \n'), cue(3, 6, 8, 'c')]
  assert.deepEqual(withoutEmpty(list).map((c) => c.id), [1, 3])
  assert.equal(withoutEmpty([]).length, 0)
})
