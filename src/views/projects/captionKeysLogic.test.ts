import assert from 'node:assert/strict'
import { test } from 'node:test'
import { shouldTogglePlayback, spaceTargetKind } from './captionKeysLogic.ts'

const space = { key: ' ', ctrlKey: false, metaKey: false, altKey: false, repeat: false }
const none = () => false
const only = (selector: string) => (candidate: string) => candidate === selector

test('mellanslag i ett fält skrivs som vanligt och rör inte videon', () => {
  for (const tag of ['TEXTAREA', 'INPUT', 'SELECT']) {
    assert.equal(spaceTargetKind(tag, false, none), 'text')
    assert.equal(shouldTogglePlayback(space, spaceTargetKind(tag, false, none), false), false)
  }
  assert.equal(spaceTargetKind('DIV', true, none), 'text')
})

test('utanför fält växlar mellanslag uppspelningen', () => {
  assert.equal(shouldTogglePlayback(space, spaceTargetKind('BODY', false, none), false), true)
  assert.equal(shouldTogglePlayback(space, spaceTargetKind('DIV', false, none), false), true)
})

test('radens spelkontroller släpper inte igenom mellanslag som ett nytt klick (spelar annars om från radens start)', () => {
  const kind = spaceTargetKind('BUTTON', false, (selector) => selector.includes('.ce-time'))
  assert.equal(kind, 'playcontrol')
  assert.equal(shouldTogglePlayback(space, kind, false), true)
})

test('övriga knappar behåller mellanslag som aktivering, och videons egna kontroller sköter sig själva', () => {
  assert.equal(shouldTogglePlayback(space, spaceTargetKind('BUTTON', false, none), false), false)
  assert.equal(shouldTogglePlayback(space, spaceTargetKind('DIV', false, only('button, a, [role="button"]')), false), false)
  assert.equal(shouldTogglePlayback(space, spaceTargetKind('VIDEO', false, none), false), false)
})

test('modifierartangenter, upprepning och öppna dialoger stoppar växlingen', () => {
  const other = spaceTargetKind('BODY', false, none)
  assert.equal(shouldTogglePlayback({ ...space, ctrlKey: true }, other, false), false)
  assert.equal(shouldTogglePlayback({ ...space, metaKey: true }, other, false), false)
  assert.equal(shouldTogglePlayback({ ...space, altKey: true }, other, false), false)
  assert.equal(shouldTogglePlayback({ ...space, repeat: true }, other, false), false)
  assert.equal(shouldTogglePlayback(space, other, true), false)
  assert.equal(shouldTogglePlayback({ ...space, key: 'a' }, other, false), false)
})
