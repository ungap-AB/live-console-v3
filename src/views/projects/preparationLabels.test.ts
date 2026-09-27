import { test } from 'node:test'
import assert from 'node:assert/strict'
import { linkedResourceLabel } from './preparationLabels.ts'

test('visar eget namn när ingen Meeting-koppling finns', () => {
  assert.equal(linkedResourceLabel({ name: 'Kommunfullmäktige' }), 'Kommunfullmäktige')
})

test('visar "Kopplad till Meeting" när sourceMeetingId är satt', () => {
  assert.equal(linkedResourceLabel({ name: 'Möte — Meeting', sourceMeetingId: '77' }), 'Kopplad till Meeting')
})

test('faller tillbaka på "Kopplad" när resursen inte laddats än', () => {
  assert.equal(linkedResourceLabel(undefined), 'Kopplad')
})
