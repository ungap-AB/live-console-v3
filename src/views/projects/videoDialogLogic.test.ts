import assert from 'node:assert/strict'
import { test } from 'node:test'
import { VIDEO_TABS, defaultVideoTab, videoActionsAvailable } from './videoDialogLogic.ts'

const none = { captionsEnabled: false, uploadEnabled: false }

test('flikarna är två, i ordningen undertexter, ladda upp (nedladdningen ligger i Exportera och importera)', () => {
  assert.deepEqual(VIDEO_TABS.map((tab) => tab.id), ['captions', 'upload'])
})

test('förvald flik: den som öppnade dialogen, annars den första som går att använda, annars undertexter', () => {
  assert.equal(defaultVideoTab({ ...none, uploadEnabled: true }), 'upload')
  assert.equal(defaultVideoTab({ captionsEnabled: true, uploadEnabled: true }), 'captions')
  assert.equal(defaultVideoTab(none), 'captions') // förklaringen visas
  assert.equal(defaultVideoTab({ captionsEnabled: true, uploadEnabled: false }, 'upload'), 'upload')
})

test('dialogen går att öppna när något av de två går att göra', () => {
  assert.equal(videoActionsAvailable(none), false)
  assert.equal(videoActionsAvailable({ ...none, uploadEnabled: true }), true)
  assert.equal(videoActionsAvailable({ ...none, captionsEnabled: true }), true)
})
