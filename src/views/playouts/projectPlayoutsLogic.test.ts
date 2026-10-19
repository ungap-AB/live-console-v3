import { test } from 'node:test'
import assert from 'node:assert/strict'
import { meetingLabel, projectPlayouts } from './projectPlayoutsLogic.ts'
import type { Project, ProjectMeetingLink } from '../../data/types'

const project = (id: string, publicMode: Project['publicMode'], createdAt: string) => ({ id, name: id, publicMode, createdAt }) as Project
const link = (projectId: string, meetingTitle: string | null = null): ProjectMeetingLink => ({ projectId, meetingId: '0b6f5c3e-1111-4222-8333-944455556666', meetingTitle, createdAt: '2026-10-16T08:00:00Z' })

test('UNG-332: only connected projects, Live first, newest first within a mode', () => {
  const projects = [project('a', 'after', '2026-10-15'), project('b', 'before', '2026-10-14'), project('c', 'live', '2026-10-01'), project('d', 'before', '2026-10-16'), project('x', 'live', '2026-10-16')]
  const rows = projectPlayouts(projects, [link('a'), link('b'), link('c'), link('d'), link('gone')])
  assert.deepEqual(rows.map((row) => row.project.id), ['c', 'd', 'b', 'a'])
})

test('UNG-332: the meeting is shown by its title, or the start of its id', () => {
  assert.equal(meetingLabel(link('a', 'KF 16 okt')), 'KF 16 okt')
  assert.equal(meetingLabel(link('a', '  ')), '0b6f5c3e…')
})
