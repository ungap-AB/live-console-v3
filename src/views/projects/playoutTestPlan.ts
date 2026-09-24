import type { Agenda, CueKind, NameList } from '../../data/types'

export const TESTBED_INTERVAL_SECONDS = 20

export interface PlayoutTestStep {
  kind: CueKind
  refId: string
  label: string
}

export interface PlayoutTestPlan {
  steps: PlayoutTestStep[]
  durationSeconds: number
}

export function buildPlayoutTestPlan(agenda: Agenda, nameList: NameList, random = Math.random): PlayoutTestPlan {
  const steps: PlayoutTestStep[] = []
  for (const item of agenda.items) {
    steps.push({ kind: 'agendaItem', refId: item.id, label: item.title })
    const people = [...nameList.people]
    for (let index = people.length - 1; index > 0; index -= 1) {
      const otherIndex = Math.floor(random() * (index + 1))
      ;[people[index], people[otherIndex]] = [people[otherIndex], people[index]]
    }
    const speakerCount = 1 + Math.floor(random() * Math.min(15, people.length))
    for (const person of people.slice(0, speakerCount)) {
      steps.push({ kind: 'person', refId: person.id, label: person.name })
    }
  }
  return { steps, durationSeconds: steps.length * TESTBED_INTERVAL_SECONDS }
}
