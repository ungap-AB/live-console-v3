import assert from 'node:assert/strict'
import { test } from 'node:test'
import { shouldCaptureTab, shouldTogglePlayback, spaceAction, spaceTargetKind, tabOriginIndex, tabTargetIndex, tabTargetKind } from './captionKeysLogic.ts'

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

test('utan placering växlar mellanslag uppspelningen som vanligt', () => {
  assert.deepEqual(spaceAction(null, true), { kind: 'toggle' })
  assert.deepEqual(spaceAction(null, false), { kind: 'toggle' })
})

test('med placering spelar mellanslag från den, och pausar tillbaka till den', () => {
  assert.deepEqual(spaceAction(12.5, true), { kind: 'playFrom', time: 12.5 })
  assert.deepEqual(spaceAction(12.5, false), { kind: 'pauseBack', time: 12.5 })
  assert.deepEqual(spaceAction(0, true), { kind: 'playFrom', time: 0 }) // en placering vid noll är fortfarande en placering
})

// ---- UNG-219: Tab från den aktiva raden ----

test('Tab utgår från den aktiva raden, inte från den fokuserade textrutan, medan videon spelar', () => {
  // Fokus ligger kvar i rad 3 men videon har gått vidare till rad 10: Tab går till rad 11.
  assert.equal(tabOriginIndex(10, 3, 3), 10)
  assert.equal(tabTargetIndex(tabOriginIndex(10, 3, 3), false, 100), 11)
  assert.equal(tabTargetIndex(tabOriginIndex(10, 3, 3), true, 100), 9)
})

test('utan aktiv rad (en lucka mellan repliker) utgår Tab från den fokuserade textrutan, annars från den valda raden', () => {
  assert.equal(tabOriginIndex(-1, 7, 4), 4)
  assert.equal(tabOriginIndex(-1, 7, null), 7)
})

test('Tab stannar vid första och sista raden och gör inget utan rader', () => {
  assert.equal(tabTargetIndex(0, true, 5), 0)
  assert.equal(tabTargetIndex(4, false, 5), 4)
  assert.equal(tabTargetIndex(2, false, 0), -1)
})

test('Tab fångas på ytor i redigeraren (video, vågform, listans bakgrund, tom fokus) men inte på knappar, fält eller i en annan dialog', () => {
  const tab = { key: 'Tab', ctrlKey: false, metaKey: false, altKey: false }
  assert.equal(tabTargetKind('BODY', none), 'surface')
  assert.equal(tabTargetKind('VIDEO', only('video, .ce-wave, .ce-wave-slot, .ce-list, .ce-chrow')), 'surface')
  assert.equal(tabTargetKind('CANVAS', only('video, .ce-wave, .ce-wave-slot, .ce-list, .ce-chrow')), 'surface')
  assert.equal(tabTargetKind('TEXTAREA', none), 'text')
  assert.equal(tabTargetKind('BUTTON', none), 'other')
  assert.equal(shouldCaptureTab(tab, 'surface', false), true)
  assert.equal(shouldCaptureTab(tab, 'text', false), false)
  assert.equal(shouldCaptureTab(tab, 'other', false), false)
  assert.equal(shouldCaptureTab(tab, 'surface', true), false)
  assert.equal(shouldCaptureTab({ ...tab, key: 'Enter' }, 'surface', false), false)
  assert.equal(shouldCaptureTab({ ...tab, ctrlKey: true }, 'surface', false), false)
})

// ---- UNG-231 ----
test('knappar på en kapitelrad släpper igenom mellanslag som uppspelning och Tab som hopp', () => {
  const inChapterRow = (selector: string) => selector.split(',').map((part) => part.trim()).includes('.ce-chrow')
  assert.equal(spaceTargetKind('BUTTON', false, inChapterRow), 'playcontrol')
  assert.equal(shouldTogglePlayback(space, spaceTargetKind('BUTTON', false, inChapterRow), false), true)
  assert.equal(tabTargetKind('BUTTON', inChapterRow), 'surface')
  // Namnfältet i raden är ett fält: det hanterar sina egna tangenter.
  assert.equal(spaceTargetKind('INPUT', false, inChapterRow), 'text')
  assert.equal(tabTargetKind('INPUT', inChapterRow), 'text')
})
