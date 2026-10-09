import assert from 'node:assert/strict'
import { test } from 'node:test'
import { showUnmute, unmuted } from './videoSoundLogic.ts'

test('knappen visas när videon är mutad eller har volym noll, annars inte', () => {
  assert.equal(showUnmute({ muted: true, volume: 1 }), true)
  assert.equal(showUnmute({ muted: false, volume: 0 }), true)
  assert.equal(showUnmute({ muted: true, volume: 0 }), true)
  assert.equal(showUnmute({ muted: false, volume: 0.4 }), false)
  assert.equal(showUnmute({ muted: false, volume: 1 }), false)
})

test('ett klick tar bort mute och höjer en nollvolym, men rör inte en vald volym', () => {
  assert.deepEqual(unmuted({ muted: true, volume: 0.4 }), { muted: false, volume: 0.4 })
  assert.deepEqual(unmuted({ muted: true, volume: 0 }), { muted: false, volume: 1 })
  assert.deepEqual(unmuted({ muted: false, volume: 0 }), { muted: false, volume: 1 })
  assert.equal(showUnmute(unmuted({ muted: true, volume: 0 })), false)
})
