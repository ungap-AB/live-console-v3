import assert from 'node:assert/strict'
import { test } from 'node:test'
import { highlight, markedHit, matches, moveActive, normalize, queryTokens, shouldActivateSearch } from './playoutSearchLogic.ts'

const find = (query: string, ...texts: string[]) => matches(queryTokens(query), texts)

test('diakritiska tecken och versaler spelar ingen roll', () => {
  assert.equal(find('bjork', 'Björk Eriksson'), true)
  assert.equal(find('ake', 'Åke Persson'), true)
  assert.equal(find('ÅKE', 'ake persson'), true)
  assert.equal(normalize('Öberg'), 'oberg')
})

test('ord i valfri ordning med prefixträff på varje ord', () => {
  assert.equal(find('eri per', 'Per Eriksson'), true)
  assert.equal(find('per eri', 'Per Eriksson'), true)
  assert.equal(find('ksson', 'Per Eriksson'), false) // bara ordets början räknas
  assert.equal(find('per anna', 'Per Eriksson'), false)
})

test('söker även i parti, roll och ärendenummer', () => {
  assert.equal(find('ordf', 'Anna Berg', 'S', 'Ordförande'), true)
  assert.equal(find('12', '§ 12 Val av justerare', '12'), true)
  assert.equal(find('xyz', 'Anna Berg', 'S', undefined), false)
})

test('tom sökning matchar allt', () => {
  assert.equal(find('', 'Anna'), true)
  assert.equal(find('   ', 'Anna'), true)
})

test('markeringen bevarar originalets stavning och tar bara sökordets början', () => {
  assert.deepEqual(highlight('Per Eriksson', queryTokens('eri')), [
    { text: 'Per ', hit: false },
    { text: 'Eri', hit: true },
    { text: 'ksson', hit: false },
  ])
  assert.deepEqual(highlight('Åke Björk', queryTokens('ake bjo')), [
    { text: 'Åke', hit: true },
    { text: ' ', hit: false },
    { text: 'Bjö', hit: true },
    { text: 'rk', hit: false },
  ])
  assert.deepEqual(highlight('Anna', []), [{ text: 'Anna', hit: false }])
})

test('pilarna stannar vid ändarna', () => {
  assert.equal(moveActive(-1, 1, 3), 0)
  assert.equal(moveActive(-1, -1, 3), 2)
  assert.equal(moveActive(2, 1, 3), 2)
  assert.equal(moveActive(0, -1, 3), 0)
  assert.equal(moveActive(-1, 1, 0), -1)
})

test('Enter gäller bara en markerad rad: med flera träffar krävs ett pilval, med en är den markerad', () => {
  const a = { list: 'agenda' as const, id: 'a' }
  const b = { list: 'names' as const, id: 'b' }
  assert.equal(markedHit([a], -1), a)
  assert.equal(markedHit([a, b], -1), null)
  assert.equal(markedHit([a, b], 1), b)
  assert.equal(markedHit([], -1), null)
})

test('/ aktiverar sökningen bara utanför fält och dialoger och utan modifierartangent', () => {
  const slash = { key: '/', ctrlKey: false, metaKey: false, altKey: false }
  assert.equal(shouldActivateSearch(slash, false, false), true)
  assert.equal(shouldActivateSearch(slash, true, false), false)
  assert.equal(shouldActivateSearch(slash, false, true), false)
  assert.equal(shouldActivateSearch({ ...slash, ctrlKey: true }, false, false), false)
  assert.equal(shouldActivateSearch({ ...slash, key: 'a' }, false, false), false)
})
