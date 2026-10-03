import assert from 'node:assert/strict'
import { test } from 'node:test'
import { parseProjectLink } from './projectLink.ts'

test('en projektlänk öppnar projektet', () => {
  assert.deepEqual(parseProjectLink('#/projects/p-123'), { projectId: 'p-123', openJobs: false })
})

test('jobs=1 öppnar jobbfältet, med eller utan projekt', () => {
  assert.deepEqual(parseProjectLink('#/projects/p-123?jobs=1'), { projectId: 'p-123', openJobs: true })
  assert.deepEqual(parseProjectLink('#/projects?jobs=1'), { projectId: null, openJobs: true })
})

test('projekt-id avkodas', () => {
  assert.deepEqual(parseProjectLink('#/projects/p%20x'), { projectId: 'p x', openJobs: false })
})

test('vanlig navigering och andra vyer är ingen djuplänk', () => {
  assert.equal(parseProjectLink('#/projects'), null)
  assert.equal(parseProjectLink('#/agendas/a1'), null)
  assert.equal(parseProjectLink(''), null)
  assert.equal(parseProjectLink('#/accept?token=abc'), null)
})
