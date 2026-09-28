import { test } from 'node:test'
import assert from 'node:assert/strict'
import { POSTER_MAX_BYTES, PLAYER_TEXT_FIELDS, changedTexts, textsOf, validatePosterFile } from './playerSettings.ts'

const project = { beforeText: 'a', liveText: '', afterText: 'c', ondemandText: '' }

test('alla fyra lägen har ett textfält, i visningsordning', () => {
  assert.deepEqual(PLAYER_TEXT_FIELDS.map((f) => f.key), ['beforeText', 'liveText', 'afterText', 'ondemandText'])
})

test('spelarens standardtexter för Before och After matchar playback-status', () => {
  const byKey = Object.fromEntries(PLAYER_TEXT_FIELDS.map((f) => [f.key, f.fallback]))
  assert.equal(byKey.beforeText, 'Sändningen har inte startat ännu.')
  assert.equal(byKey.afterText, 'Sändningen är avslutad.')
  assert.equal(byKey.liveText, null)
  assert.equal(byKey.ondemandText, null)
})

test('changedTexts ger null när inget ändrats och annars bara de ändrade fälten', () => {
  assert.equal(changedTexts(project, textsOf(project)), null)
  assert.deepEqual(changedTexts(project, { ...textsOf(project), liveText: 'Snart live' }), { liveText: 'Snart live' })
  assert.deepEqual(changedTexts(project, { ...textsOf(project), beforeText: '' }), { beforeText: '' })
})

test('validatePosterFile godkänner JPG/PNG/WebP upp till 5 MB', () => {
  for (const type of ['image/jpeg', 'image/png', 'image/webp']) {
    assert.equal(validatePosterFile({ type, size: 1024 }), null, type)
  }
  assert.equal(validatePosterFile({ type: 'image/png', size: POSTER_MAX_BYTES }), null)
})

test('validatePosterFile avvisar fel typ, tom fil och för stor fil', () => {
  assert.match(validatePosterFile({ type: 'image/svg+xml', size: 10 })!, /JPG/)
  assert.match(validatePosterFile({ type: 'image/gif', size: 10 })!, /JPG/)
  assert.match(validatePosterFile({ type: 'image/png', size: 0 })!, /tom/)
  assert.match(validatePosterFile({ type: 'image/png', size: POSTER_MAX_BYTES + 1 })!, /5 MB/)
})
