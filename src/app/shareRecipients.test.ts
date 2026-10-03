import assert from 'node:assert/strict'
import { test } from 'node:test'
import { mailErrorText, parseRecipients } from './shareRecipients.ts'

test('delar på komma, semikolon, radbrytning och mellanslag och tar bort dubbletter', () => {
  const result = parseRecipients('a@example.com, B@Example.com;c@example.com\nd@example.com e@example.com\na@example.com')
  assert.deepEqual(result.valid, ['a@example.com', 'b@example.com', 'c@example.com', 'd@example.com', 'e@example.com'])
  assert.deepEqual(result.invalid, [])
})

test('förstår "Namn <adress>" från en e-postklient', () => {
  const result = parseRecipients('Anna Svensson <anna@example.com>, Per Ek <per@example.com>')
  assert.deepEqual(result.valid, ['anna@example.com', 'per@example.com'])
})

test('samlar ogiltiga adresser och ignorerar tomma delar', () => {
  const result = parseRecipients('ok@example.com, , inte-en-adress, @example.com,  ;')
  assert.deepEqual(result.valid, ['ok@example.com'])
  assert.deepEqual(result.invalid, ['inte-en-adress', '@example.com'])
})

test('tomt fält ger inga mottagare', () => {
  assert.deepEqual(parseRecipients('  '), { valid: [], invalid: [] })
})

test('felkoder får en läsbar text', () => {
  assert.equal(mailErrorText('email_rate_limited'), 'för många mejl till adressen den senaste timmen')
  assert.equal(mailErrorText(undefined), 'mejlet kunde inte köas')
})
