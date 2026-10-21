import assert from 'node:assert/strict'
import { test } from 'node:test'
import { claimSilentLogin, resetSilentLogins } from './silentLogin.ts'

function memory(): Storage {
  const values = new Map<string, string>()
  return {
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => void values.set(key, value),
    removeItem: (key) => void values.delete(key),
  } as Storage
}

test('two silent logins per 30 s, then the frame asks the shell instead', () => {
  const storage = memory()
  assert.equal(claimSilentLogin(storage, 1_000), true)
  assert.equal(claimSilentLogin(storage, 5_000), true)
  assert.equal(claimSilentLogin(storage, 9_000), false)
  assert.equal(claimSilentLogin(storage, 32_000), true)
})

test('a session resets the count', () => {
  const storage = memory()
  claimSilentLogin(storage, 1_000)
  claimSilentLogin(storage, 2_000)
  resetSilentLogins(storage)
  assert.equal(claimSilentLogin(storage, 3_000), true)
})
