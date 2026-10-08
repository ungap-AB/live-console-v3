import assert from 'node:assert/strict'
import { test } from 'node:test'
import { cueCharCount, isLongCue, LONG_CUE_CHARS } from './captionLengthLogic.ts'

test('145 tecken är inte lång, 146 är det', () => {
  assert.equal(LONG_CUE_CHARS, 145)
  assert.equal(isLongCue('a'.repeat(145)), false)
  assert.equal(isLongCue('a'.repeat(146)), true)
})

test('radbrytningar räknas inte som tecken', () => {
  assert.equal(cueCharCount('abc\ndef'), 6)
  assert.equal(cueCharCount('abc\r\ndef'), 6)
  assert.equal(isLongCue(`${'a'.repeat(100)}\n${'b'.repeat(45)}`), false)
  assert.equal(isLongCue(`${'a'.repeat(100)}\n${'b'.repeat(46)}`), true)
})

test('en tom replik är inte lång', () => {
  assert.equal(isLongCue(''), false)
  assert.equal(cueCharCount(''), 0)
})
