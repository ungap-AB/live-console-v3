import assert from 'node:assert/strict'
import { test } from 'node:test'
import { isExternalSource, isOperatorSupplied, validateHlsUrl } from './recordingSource.ts'

test('uppladdad och extern video är operatörstillförda, inspelningar och trimmar är det inte', () => {
  assert.equal(isOperatorSupplied('upload'), true)
  assert.equal(isOperatorSupplied('external'), true)
  assert.equal(isOperatorSupplied('ivs'), false)
  assert.equal(isOperatorSupplied(undefined), false)
  assert.equal(isExternalSource('external'), true)
  assert.equal(isExternalSource('upload'), false)
})

test('en https-adress till en .m3u8 godkänns, annat avvisas med en begriplig text', () => {
  assert.equal(validateHlsUrl('https://media.ungap.net/ivs/v1/x/master.m3u8'), null)
  assert.equal(validateHlsUrl('  https://media.ungap.net/a/B.M3U8?x=1  '), null)
  assert.match(validateHlsUrl('') ?? '', /Ange/)
  assert.match(validateHlsUrl('inte en adress') ?? '', /giltig/)
  assert.match(validateHlsUrl('http://media.ungap.net/a.m3u8') ?? '', /https/)
  assert.match(validateHlsUrl('https://anna:hemligt@media.ungap.net/a.m3u8') ?? '', /användarnamn/)
  assert.match(validateHlsUrl('https://media.ungap.net/a.mp4') ?? '', /\.m3u8/)
})
