import assert from 'node:assert/strict'
import { test } from 'node:test'
import { errorMessage, runOptimistic } from './optimistic.ts'

function deferred<T>() {
  let resolve!: (value: T) => void
  let reject!: (error: unknown) => void
  const promise = new Promise<T>((res, rej) => { resolve = res; reject = rej })
  return { promise, resolve, reject }
}

test('ändringen visas direkt, före svaret, och serverns svar tas emot sedan', async () => {
  const state = { name: 'Gammalt' }
  const request = deferred<string>()
  const done = runOptimistic({
    key: 'a',
    apply: () => { const before = state.name; state.name = 'Nytt'; return () => { state.name = before } },
    request: () => request.promise,
    onSuccess: (server) => { state.name = server },
    onError: () => assert.fail('inget fel väntat'),
  })
  assert.equal(state.name, 'Nytt')
  request.resolve('Nytt (trimmat)')
  assert.equal(await done, true)
  assert.equal(state.name, 'Nytt (trimmat)')
})

test('vid fel återställs det gamla värdet och felet rapporteras', async () => {
  const state = { name: 'Gammalt' }
  let reported: unknown = null
  const ok = await runOptimistic({
    key: 'b',
    apply: () => { const before = state.name; state.name = 'Nytt'; return () => { state.name = before } },
    request: () => Promise.reject(new Error('Namnet finns redan.')),
    onError: (error) => { reported = error },
  })
  assert.equal(ok, false)
  assert.equal(state.name, 'Gammalt')
  assert.equal(errorMessage(reported), 'Namnet finns redan.')
})

test('ett sent fel från ett äldre anrop skriver inte över ett nyare namn', async () => {
  const state = { name: 'A' }
  const first = deferred<string>()
  const second = deferred<string>()
  const apply = (next: string) => () => { const before = state.name; state.name = next; return () => { state.name = before } }
  const one = runOptimistic({ key: 'c', apply: apply('B'), request: () => first.promise, onSuccess: (s) => { state.name = s }, onError: () => undefined })
  const two = runOptimistic({ key: 'c', apply: apply('C'), request: () => second.promise, onSuccess: (s) => { state.name = s }, onError: () => undefined })
  assert.equal(state.name, 'C')
  first.reject(new Error('sent fel'))
  await one
  assert.equal(state.name, 'C')
  second.resolve('C')
  await two
  assert.equal(state.name, 'C')
})

test('ett äldre svar ersätter inte ett nyare optimistiskt värde', async () => {
  const state = { name: 'A' }
  const first = deferred<string>()
  const second = deferred<string>()
  const apply = (next: string) => () => { const before = state.name; state.name = next; return () => { state.name = before } }
  const one = runOptimistic({ key: 'd', apply: apply('B'), request: () => first.promise, onSuccess: (s) => { state.name = s }, onError: () => undefined })
  const two = runOptimistic({ key: 'd', apply: apply('C'), request: () => second.promise, onSuccess: (s) => { state.name = s }, onError: () => undefined })
  first.resolve('B')
  await one
  assert.equal(state.name, 'C')
  second.resolve('C')
  await two
})

test('olika poster stör inte varandra', async () => {
  const state = { x: 'x0', y: 'y0' }
  const failing = runOptimistic({
    key: 'x', apply: () => { state.x = 'x1'; return () => { state.x = 'x0' } },
    request: () => Promise.reject(new Error('fel')), onError: () => undefined,
  })
  const fine = runOptimistic({ key: 'y', apply: () => { state.y = 'y1'; return () => { state.y = 'y0' } }, request: async () => 'ok', onError: () => undefined })
  await Promise.all([failing, fine])
  assert.deepEqual(state, { x: 'x0', y: 'y1' })
})

test('errorMessage faller tillbaka på en standardtext', () => {
  assert.equal(errorMessage(new Error('Slut')), 'Slut')
  assert.equal(errorMessage('x'), 'Något gick fel.')
  assert.equal(errorMessage(new Error(''), 'Kunde inte byta namn.'), 'Kunde inte byta namn.')
})
