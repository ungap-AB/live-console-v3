import assert from 'node:assert/strict'
import { test } from 'node:test'
import { agendaOptions, attachPlan, chooseList, defaultChoice, isMeetingCustomer, latestUnusedAgenda, MEETING, nameListOptions, NONE, previousNameList } from './createProjectLists.ts'

const agenda = (id: string, usedInProjects: number, changedAt: string, isTemplate = false) => ({ id, name: `Dagordning ${id}`, usedInProjects, changedAt, isTemplate })

test('senast skapade oanvända dagordning: använda och mallar räknas inte, nyast vinner', () => {
  const agendas = [agenda('a', 0, '2026-01-01T00:00:00Z'), agenda('b', 2, '2026-05-01T00:00:00Z'), agenda('c', 0, '2026-03-01T00:00:00Z'), agenda('t', 0, '2026-06-01T00:00:00Z', true)]
  assert.equal(latestUnusedAgenda(agendas)?.id, 'c')
  assert.equal(latestUnusedAgenda([agenda('b', 1, '2026-05-01T00:00:00Z')]), null)
  assert.equal(latestUnusedAgenda([]), null)
})

test('dagordning: den föreslagna oanvända och Ingen, ingen "skapa ny", och Ingen när inget finns', () => {
  const options = agendaOptions({ agendas: [agenda('c', 0, '2026-03-01T00:00:00Z')], meeting: false })
  assert.deepEqual(options.map((o) => o.id), ['c', NONE])
  assert.match(options[0].label, /Senast skapade oanvända dagordning: Dagordning c/)
  assert.deepEqual(agendaOptions({ agendas: [], meeting: false }).map((o) => o.id), [NONE])
  assert.equal(defaultChoice(options), 'c')
  assert.equal(defaultChoice(agendaOptions({ agendas: [], meeting: false })), NONE)
})

test('namnlista: samma lista som föregående projekt om den finns kvar, annars bara Ingen', () => {
  const source = { id: 'p1', name: 'Kommunfullmäktige', namelistId: 'n1' }
  const lists = [{ id: 'n1', name: 'Ledamöter' }, { id: 'n2', name: 'Andra' }]
  assert.deepEqual(nameListOptions({ source, nameLists: lists, meeting: false }).map((o) => o.id), ['n1', NONE])
  assert.match(nameListOptions({ source, nameLists: lists, meeting: false })[0].label, /Samma lista som Kommunfullmäktige: Ledamöter/)
  assert.deepEqual(nameListOptions({ source: { ...source, namelistId: 'raderad' }, nameLists: lists, meeting: false }).map((o) => o.id), [NONE])
  assert.deepEqual(nameListOptions({ source: undefined, nameLists: lists, meeting: false }).map((o) => o.id), [NONE])
  assert.equal(previousNameList({ id: 'p', name: 'p' }, lists), null)
})

test('Meeting-kunder: Koppla till Meeting ligger först och är förvald, i båda listorna', () => {
  assert.equal(isMeetingCustomer([{ meetingBindingId: null }, { meetingBindingId: 'b1' }]), true)
  assert.equal(isMeetingCustomer([{ meetingBindingId: null }, {}]), false)
  const agendas = agendaOptions({ agendas: [agenda('c', 0, '2026-03-01T00:00:00Z')], meeting: true })
  assert.deepEqual(agendas.map((o) => o.id), [MEETING, 'c', NONE])
  assert.equal(defaultChoice(agendas), MEETING)
  assert.deepEqual(nameListOptions({ source: undefined, nameLists: [], meeting: true }).map((o) => o.id), [MEETING, NONE])
})

test('Meeting väljs i båda eller ingen: valet följer med, och går tillbaka till förvalet när man väljer något annat', () => {
  const fallbacks = { agenda: 'c', namelist: 'n1' }
  assert.deepEqual(chooseList({ agenda: 'c', namelist: 'n1' }, 'agenda', MEETING, fallbacks), { agenda: MEETING, namelist: MEETING })
  assert.deepEqual(chooseList({ agenda: MEETING, namelist: MEETING }, 'namelist', NONE, fallbacks), { agenda: 'c', namelist: NONE })
  assert.deepEqual(chooseList({ agenda: 'c', namelist: 'n1' }, 'namelist', NONE, fallbacks), { agenda: 'c', namelist: NONE })
})

test('efter skapandet: befintlig lista kopplas, Ingen kopplar inget, och Meeting öppnar Meeting-kopplingen', () => {
  assert.deepEqual(attachPlan({ agenda: 'c', namelist: 'n1' }), { agendaId: 'c', namelistId: 'n1', openMeeting: false })
  assert.deepEqual(attachPlan({ agenda: NONE, namelist: NONE }), { agendaId: null, namelistId: null, openMeeting: false })
  assert.deepEqual(attachPlan({ agenda: NONE, namelist: 'n1' }), { agendaId: null, namelistId: 'n1', openMeeting: false })
  assert.deepEqual(attachPlan({ agenda: MEETING, namelist: MEETING }), { agendaId: null, namelistId: null, openMeeting: true })
})
