import assert from 'node:assert/strict'
import { test } from 'node:test'
import { MAX_CAPTION_FILE_BYTES, captionsLengthWarning, validateCaptionFile } from './captionsCheck.ts'

test('en .vtt-fil av rimlig storlek godkänns, annat avvisas med en begriplig text', () => {
  assert.equal(validateCaptionFile({ name: 'möte.vtt', size: 100_000 }), null)
  assert.equal(validateCaptionFile({ name: 'MÖTE.VTT', size: 1 }), null)
  assert.match(validateCaptionFile({ name: 'möte.srt', size: 100 }) ?? '', /\.vtt/)
  assert.match(validateCaptionFile({ name: 'möte.vtt', size: 0 }) ?? '', /tom/)
  assert.match(validateCaptionFile({ name: 'möte.vtt', size: MAX_CAPTION_FILE_BYTES + 1 }) ?? '', /2 MB/)
})

test('ingen varning när undertexten slutar ungefär när videon gör det', () => {
  assert.equal(captionsLengthWarning({ lastCueEndSeconds: 7179.6 }, 7240), null)
  assert.equal(captionsLengthWarning({ lastCueEndSeconds: 3000 }, 3005), null)
  assert.equal(captionsLengthWarning({ lastCueEndSeconds: 3008 }, 3000), null)
})

test('varnar när undertexten slutar efter videons slut (gjord från originalet)', () => {
  assert.match(captionsLengthWarning({ lastCueEndSeconds: 7200 }, 5400) ?? '', /efter videons slut/)
})

test('varnar när undertexten slutar långt före slutet, men inte för korta klipp', () => {
  assert.match(captionsLengthWarning({ lastCueEndSeconds: 1000 }, 7000) ?? '', /långt före/)
  assert.equal(captionsLengthWarning({ lastCueEndSeconds: 20 }, 100), null)
})

test('utan känd videolängd finns inget att jämföra med', () => {
  assert.equal(captionsLengthWarning({ lastCueEndSeconds: 500 }, undefined), null)
  assert.equal(captionsLengthWarning({ lastCueEndSeconds: 500 }, 0), null)
})
