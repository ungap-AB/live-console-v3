import assert from 'node:assert/strict'
import { test } from 'node:test'
import { ownCorrections, wordChanges } from './captionCorrectionsLogic.ts'

const cue = (id: number, text: string) => ({ id, start: id, end: id + 1, text })

test('ordändringar: ersatt, infogat, borttaget och flera ändringar i samma text', () => {
  assert.deepEqual(wordChanges('Rittinger Sandström hälsar', 'Britt-Inger Sandström hälsar'), [{ from: 'Rittinger', to: 'Britt-Inger' }])
  assert.deepEqual(wordChanges('Jag yrkar bifall', 'Jag yrkar bifall till förslaget'), [{ from: '', to: 'till förslaget' }])
  assert.deepEqual(wordChanges('Jag yrkar nog bifall', 'Jag yrkar bifall'), [{ from: 'nog', to: '' }])
  assert.deepEqual(wordChanges('ett två tre fyra', 'ett 2 tre 4'), [{ from: 'två', to: '2' }, { from: 'fyra', to: '4' }])
  assert.deepEqual(wordChanges('lika text', 'lika   text'), []) // bara blanksteg
  assert.deepEqual(wordChanges('', 'ny text'), [{ from: '', to: 'ny text' }])
})

test('egna rättningar: bara ändrade repliker, jämförda på id, med ord för ord', () => {
  const saved = [cue(1, 'Per Eriksen talar'), cue(2, 'oförändrad'), cue(3, 'Tack ordförande')]
  const cues = [cue(1, 'Per Eriksson talar'), cue(2, 'oförändrad'), cue(3, 'Tack ordförande'), cue(-1, 'helt ny ruta')]
  assert.deepEqual(ownCorrections(saved, cues), [{ cueId: 1, from: 'Eriksen', to: 'Eriksson' }])
})

test('egna rättningar: bara ersatta ord, inte infogade eller borttagna', () => {
  const saved = [cue(1, 'Jag yrkar nog bifall'), cue(2, 'Tack ordförande'), cue(3, 'Per Eriksen talar')]
  const cues = [cue(1, 'Jag yrkar bifall'), cue(2, 'Tack ordförande och ledamöter'), cue(3, 'Per Eriksson talar')]
  assert.deepEqual(ownCorrections(saved, cues), [{ cueId: 3, from: 'Eriksen', to: 'Eriksson' }])
})

test('egna rättningar: stora omläggningar (sammanslagning, delning) räknas inte som rättningar', () => {
  const saved = [cue(1, 'ett två tre'), cue(2, 'fyra fem sex sju åtta nio tio elva')]
  const merged = [cue(1, 'ett två tre fyra fem sex sju åtta nio tio elva')]
  assert.deepEqual(ownCorrections(saved, merged), []) // åtta ord tillkom i samma replik
  assert.deepEqual(ownCorrections(saved, merged, 20), []) // en ren infogning är inte heller en rättning
  assert.deepEqual(ownCorrections(saved, saved), [])
})
