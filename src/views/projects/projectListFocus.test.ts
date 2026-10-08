import assert from 'node:assert/strict'
import { test } from 'node:test'
import { needsScroll, nextLastOpened, revealTarget } from './projectListFocus.ts'

const projects = [{ id: 'a' }, { id: 'b' }, { id: 'c' }]

test('det senast öppnade projektet markeras om det finns i listan, annars inget', () => {
  assert.equal(revealTarget('b', projects), 'b')
  assert.equal(revealTarget('raderat', projects), null)
  assert.equal(revealTarget(null, projects), null)
  assert.equal(revealTarget('a', []), null)
})

test('ett öppet projekt ersätter det senast öppnade och att gå tillbaka till listan behåller det', () => {
  assert.equal(nextLastOpened(null, 'a'), 'a')
  assert.equal(nextLastOpened('a', 'b'), 'b')
  assert.equal(nextLastOpened('b', null), 'b')
  assert.equal(nextLastOpened(null, null), null)
})

test('en rad som redan syns scrollas inte', () => {
  const view = { top: 100, bottom: 700 }
  assert.equal(needsScroll({ top: 300, bottom: 360 }, view), false)
  assert.equal(needsScroll({ top: 90, bottom: 150 }, view), true)
  assert.equal(needsScroll({ top: 680, bottom: 740 }, view), true)
})
