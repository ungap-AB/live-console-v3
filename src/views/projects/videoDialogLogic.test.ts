import assert from 'node:assert/strict'
import { test } from 'node:test'
import { VIDEO_TABS, defaultVideoTab, videoActionsAvailable } from './videoDialogLogic.ts'

const none = { captionsEnabled: false, uploadEnabled: false, downloadEnabled: false }

test('flikarna är alltid tre, i ordningen undertexter, ladda upp, ladda ner', () => {
  assert.deepEqual(VIDEO_TABS.map((tab) => tab.id), ['captions', 'upload', 'download'])
})

test('förvald flik: den som öppnade dialogen, annars den första som går att använda, annars undertexter', () => {
  assert.equal(defaultVideoTab({ ...none, uploadEnabled: true, downloadEnabled: true }), 'upload')
  assert.equal(defaultVideoTab({ ...none, downloadEnabled: true }), 'download')
  assert.equal(defaultVideoTab({ captionsEnabled: true, uploadEnabled: true, downloadEnabled: true }), 'captions')
  assert.equal(defaultVideoTab(none), 'captions') // förklaringen visas
  assert.equal(defaultVideoTab({ captionsEnabled: true, uploadEnabled: false, downloadEnabled: false }, 'download'), 'download')
})

test('dialogen går att öppna när något av de tre går att göra, även bara nedladdning', () => {
  assert.equal(videoActionsAvailable(none), false)
  assert.equal(videoActionsAvailable({ ...none, downloadEnabled: true }), true)
  assert.equal(videoActionsAvailable({ ...none, captionsEnabled: true }), true)
})
