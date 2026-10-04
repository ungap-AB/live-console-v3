import assert from 'node:assert/strict'
import { test } from 'node:test'
import { beginModeSwitch, currentModeSwitch, endModeSwitch, subscribeModeSwitch } from './modeSwitch.ts'

test('ett byte registreras direkt och spärrar ett andra tills det är klart', () => {
  assert.equal(currentModeSwitch('p1'), null)
  assert.equal(beginModeSwitch('p1', 'after'), true)
  assert.equal(currentModeSwitch('p1'), 'after')
  assert.equal(beginModeSwitch('p1', 'live'), false)
  assert.equal(currentModeSwitch('p1'), 'after')
  endModeSwitch('p1')
  assert.equal(currentModeSwitch('p1'), null)
  assert.equal(beginModeSwitch('p1', 'live'), true)
  endModeSwitch('p1')
})

test('olika projekt påverkar inte varandra', () => {
  assert.equal(beginModeSwitch('a', 'after'), true)
  assert.equal(beginModeSwitch('b', 'ondemand'), true)
  assert.equal(currentModeSwitch('a'), 'after')
  assert.equal(currentModeSwitch('b'), 'ondemand')
  endModeSwitch('a')
  assert.equal(currentModeSwitch('b'), 'ondemand')
  endModeSwitch('b')
})

test('lyssnare får veta när ett byte börjar och slutar, och inte efter avprenumeration', () => {
  let calls = 0
  const unsubscribe = subscribeModeSwitch(() => { calls += 1 })
  beginModeSwitch('c', 'live')
  endModeSwitch('c')
  assert.equal(calls, 2)
  endModeSwitch('c')
  assert.equal(calls, 2)
  unsubscribe()
  beginModeSwitch('c', 'live')
  endModeSwitch('c')
  assert.equal(calls, 2)
})
