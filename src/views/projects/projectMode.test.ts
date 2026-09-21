import { test } from 'node:test'
import assert from 'node:assert/strict'
import { MODES, afterReasonFor, audienceSees, confirmationCopy, modeChangePlan, requiresConfirmation } from './projectMode.ts'

test('bekräftelse krävs för exakt de sex övergångarna', () => {
  const confirmed = [
    ['live', 'after'],
    ['ondemand', 'after'],
    ['after', 'live'],
    ['ondemand', 'live'],
    ['live', 'before'],
    ['ondemand', 'before'],
  ]
  for (const from of MODES) {
    for (const to of MODES) {
      const expected = confirmed.some(([f, t]) => f === from && t === to)
      assert.equal(requiresConfirmation(from, to), expected, `${from} → ${to}`)
    }
  }
})

test('bekräftelsetext finns bara när bekräftelse krävs, och After-mål är redigerbara', () => {
  for (const from of MODES) {
    for (const to of MODES) {
      const copy = confirmationCopy(from, to)
      assert.equal(copy !== null, requiresConfirmation(from, to))
      if (copy) assert.equal(copy.editsAfterText, to === 'after')
    }
  }
})

test('After-skäl följer varifrån man kommer', () => {
  assert.equal(afterReasonFor('live', 'after'), 'liveFinished')
  assert.equal(afterReasonFor('ondemand', 'after'), 'ondemandUnpublished')
  assert.equal(afterReasonFor('live', 'ondemand'), undefined)
})

test('publiken ser nu', () => {
  for (const mode of MODES) assert.equal(audienceSees('closed', mode), 'Inget (stängd)')
  assert.equal(audienceSees('open', 'before'), 'Before-meddelandet')
  assert.equal(audienceSees('open', 'live'), 'Livesändningen')
  assert.equal(audienceSees('open', 'after'), 'After-meddelandet')
  assert.equal(audienceSees('open', 'ondemand'), 'Inspelningen')
})

test('lägesbyte planeras mot rätt serveranrop', () => {
  assert.deepEqual(modeChangePlan('after', 'ondemand'), ['publish'])
  assert.deepEqual(modeChangePlan('live', 'ondemand'), ['publish'])
  assert.deepEqual(modeChangePlan('ondemand', 'after'), ['unpublish'])
  assert.deepEqual(modeChangePlan('ondemand', 'live'), ['returnToLive'])
  assert.deepEqual(modeChangePlan('ondemand', 'before'), ['unpublish', 'setMode'])
  assert.deepEqual(modeChangePlan('before', 'live'), ['setMode'])
  assert.deepEqual(modeChangePlan('live', 'after'), ['setMode'])
  assert.deepEqual(modeChangePlan('after', 'live'), ['setMode'])
  for (const mode of MODES) assert.deepEqual(modeChangePlan(mode, mode), [])
})
