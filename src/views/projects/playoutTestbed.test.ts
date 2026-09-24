import assert from 'node:assert/strict'
import { test } from 'node:test'
import type { Agenda, NameList } from '../../data/types.ts'
import { buildPlayoutTestPlan, TESTBED_INTERVAL_SECONDS } from './playoutTestPlan.ts'

const agenda: Agenda = {
  id: 'agenda-1',
  name: 'Testagenda',
  description: '',
  itemCount: 2,
  usedInProjects: 0,
  changedAt: '2026-09-24T08:00:00Z',
  isTemplate: false,
  items: [
    { id: 'item-1', position: 1, title: 'Första punkten' },
    { id: 'item-2', position: 2, title: 'Andra punkten' },
  ],
}

const nameList: NameList = {
  id: 'list-1',
  name: 'Talare',
  description: '',
  personCount: 3,
  usedInProjects: 0,
  changedAt: '2026-09-24T08:00:00Z',
  people: [
    { id: 'person-1', position: 1, name: 'Ada' },
    { id: 'person-2', position: 2, name: 'Bo' },
    { id: 'person-3', position: 3, name: 'Cleo' },
  ],
}

test('testplanen spelar varje punkt följd av unika talare och räknar exakt tid', () => {
  const plan = buildPlayoutTestPlan(agenda, nameList, () => 0)

  assert.equal(plan.steps.length, 4)
  assert.equal(plan.durationSeconds, 4 * TESTBED_INTERVAL_SECONDS)
  assert.deepEqual(plan.steps.map((step) => step.kind), ['agendaItem', 'person', 'agendaItem', 'person'])
  assert.deepEqual(plan.steps.map((step) => step.refId), ['item-1', 'person-2', 'item-2', 'person-2'])
})
