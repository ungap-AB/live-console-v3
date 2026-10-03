import assert from 'node:assert/strict'
import { test } from 'node:test'
import { parseShareToken } from './shareLink.ts'

test('läser token ur en delningslänk', () => {
  assert.equal(parseShareToken('#/downloads/abc_DEF-123'), 'abc_DEF-123')
})

test('tomt, annan vy och trasig kodning ger null', () => {
  assert.equal(parseShareToken('#/downloads'), null)
  assert.equal(parseShareToken('#/downloads/'), null)
  assert.equal(parseShareToken('#/projects/p1'), null)
  assert.equal(parseShareToken('#/accept?token=abc'), null)
  assert.equal(parseShareToken('#/downloads/%E0%A4%A'), null)
  assert.equal(parseShareToken(''), null)
})
