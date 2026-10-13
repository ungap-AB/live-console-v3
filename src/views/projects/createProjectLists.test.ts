import assert from 'node:assert/strict'
import { test } from 'node:test'
import { agendaOptions, attachPlan, chooseList, defaultChoice, filterLists, isMeetingCustomer, latestUnusedAgenda, MEETING, nameListOptions, NONE, previousNameList } from './createProjectLists.ts'

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

test('UNG-287: en lista vald i väljardialogen blir ett eget alternativ före Ingen, om den inte redan är förslaget', () => {
  const agendas = [
    { id: 'a1', name: 'Dagordning a', usedInProjects: 2, changedAt: '2026-01-01T00:00:00Z' },
    { id: 'a2', name: 'Dagordning b', usedInProjects: 0, changedAt: '2026-02-01T00:00:00Z' },
  ]
  assert.deepEqual(agendaOptions({ agendas, meeting: false, picked: 'a1' }).map((o) => [o.id, o.label]), [
    ['a2', 'Senast skapade oanvända dagordning: Dagordning b'], ['a1', 'Vald: Dagordning a'], ['none', 'Ingen dagordning, jag kopplar senare'],
  ])
  assert.equal(agendaOptions({ agendas, meeting: false, picked: 'a2' }).length, 2)
  assert.deepEqual(nameListOptions({ source: undefined, nameLists: [{ id: 'n1', name: 'Ledamöter' }], meeting: false, picked: 'n1' }).map((o) => o.id), ['n1', 'none'])
})

test('UNG-287: väljardialogen söker i namnet, filtrerar på använd/oanvänd, visar senast ändrade först och inga mallar', () => {
  const lists = [
    { id: '1', name: 'KF januari', usedInProjects: 1, changedAt: '2026-01-10T00:00:00Z' },
    { id: '2', name: 'KS februari', usedInProjects: 0, changedAt: '2026-02-10T00:00:00Z' },
    { id: '3', name: 'KF mars', usedInProjects: 0, changedAt: '2026-03-10T00:00:00Z' },
    { id: 't', name: 'KF mall', usedInProjects: 0, changedAt: '2026-04-10T00:00:00Z', isTemplate: true },
  ]
  assert.deepEqual(filterLists(lists, '', 'all').map((l) => l.id), ['3', '2', '1'])
  assert.deepEqual(filterLists(lists, ' kf ', 'all').map((l) => l.id), ['3', '1'])
  assert.deepEqual(filterLists(lists, 'kf', 'unused').map((l) => l.id), ['3'])
  assert.deepEqual(filterLists(lists, '', 'used').map((l) => l.id), ['1'])
})
