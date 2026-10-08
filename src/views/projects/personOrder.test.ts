import assert from 'node:assert/strict'
import { test } from 'node:test'
import { orderPeople, parsePersonSort, resolveShown } from './personOrder.ts'

const people = [
  { id: 'a', name: 'Åsa Berg' },
  { id: 'b', name: 'Anna Ek' },
  { id: 'c', name: 'Örjan Lind' },
  { id: 'd', name: 'Bo Sand' },
]
const counts: Record<string, number> = { a: 0, b: 2, c: 2, d: 5 }
const count = (id: string) => counts[id] ?? 0
const ids = (list: { id: string }[]) => list.map((p) => p.id)

test('Listans ordning lämnar listan som den är', () => {
  assert.deepEqual(ids(orderPeople(people, 'manual', count)), ['a', 'b', 'c', 'd'])
})

test('Namn A–Ö följer svenskt alfabet (Å och Ö sist)', () => {
  assert.deepEqual(ids(orderPeople(people, 'name', count)), ['b', 'd', 'a', 'c'])
})

test('Mest utspelade sorterar på antal, sedan på namn', () => {
  assert.deepEqual(ids(orderPeople(people, 'playCount', count)), ['d', 'b', 'c', 'a'])
  counts.a = 3
  assert.deepEqual(ids(orderPeople(people, 'playCount', count)), ['d', 'a', 'b', 'c'])
  counts.a = 0
})

test('sorteringen ändrar aldrig originallistan', () => {
  const copy = [...people]
  orderPeople(people, 'name', count)
  assert.deepEqual(people, copy)
})

test('med hold behålls den visade ordningen, annars gäller målordningen', () => {
  const shown = ['d', 'b', 'c', 'a']
  const target = ['a', 'd', 'b', 'c']
  assert.deepEqual(resolveShown(shown, target, true), shown)
  assert.deepEqual(resolveShown(shown, target, false), target)
})

test('med hold försvinner borttagna rader och nya läggs sist', () => {
  assert.deepEqual(resolveShown(['d', 'b', 'c'], ['b', 'e', 'd'], true), ['d', 'b', 'e'])
})

test('ett okänt eller saknat sparat val blir Listans ordning', () => {
  assert.equal(parsePersonSort('name'), 'name')
  assert.equal(parsePersonSort('playCount'), 'playCount')
  assert.equal(parsePersonSort('annat'), 'manual')
  assert.equal(parsePersonSort(null), 'manual')
})
