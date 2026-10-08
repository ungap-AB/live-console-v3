// UNG-189: dagordning och namnlista i skapa-dialogen. Ingen spärr: "Skapa" kräver bara ett namn. Inget val att skapa en ny lista (det görs i
// projektvyn eller under respektive funktion i vänstermenyn). Alternativen per fråga:
//   * Dagordning: Senast skapade oanvända dagordning (förvald om den finns), Ingen (koppla senare).
//   * Namnlista: Samma lista som föregående projekt (förvald om det har en), Ingen (koppla senare).
//   * Meeting-kunder: "Koppla till Meeting" ligger bland alternativen och är förvald (en Meeting-koppling skapar båda listorna).
// "Ingen" och "koppla senare" är likvärdiga och är därför ETT alternativ.

export const NONE = 'none'
export const MEETING = 'meeting'

export interface ListOption {
  id: string
  label: string
}

interface AgendaLike {
  id: string
  name: string
  usedInProjects: number
  changedAt: string
  isTemplate?: boolean
}

interface NameListLike {
  id: string
  name: string
}

interface ProjectLike {
  id: string
  name: string
  namelistId?: string | null
  meetingBindingId?: string | null
}

/** En Meeting-kund: någon av domänens projekt är redan kopplat till ett Meeting-möte. */
export function isMeetingCustomer(projects: readonly Pick<ProjectLike, 'meetingBindingId'>[]): boolean {
  return projects.some((project) => Boolean(project.meetingBindingId))
}

/** Senast skapade (senast ändrade, tills dagordningen får en skapad-tid) oanvända dagordning. Mallar räknas inte. */
export function latestUnusedAgenda<T extends AgendaLike>(agendas: readonly T[]): T | null {
  const unused = agendas.filter((agenda) => agenda.usedInProjects === 0 && !agenda.isTemplate)
  unused.sort((left, right) => Date.parse(right.changedAt) - Date.parse(left.changedAt))
  return unused[0] ?? null
}

export function agendaOptions(input: { agendas: readonly AgendaLike[]; meeting: boolean }): ListOption[] {
  const options: ListOption[] = []
  if (input.meeting) options.push({ id: MEETING, label: 'Koppla till Meeting' })
  const latest = latestUnusedAgenda(input.agendas)
  if (latest) options.push({ id: latest.id, label: `Senast skapade oanvända dagordning: ${latest.name}` })
  options.push({ id: NONE, label: 'Ingen dagordning, jag kopplar senare' })
  return options
}

/** Namnlistan som föregående projekt (det projekt layouten utgår från) har, om den finns kvar. */
export function previousNameList(source: ProjectLike | undefined, nameLists: readonly NameListLike[]): NameListLike | null {
  return source?.namelistId ? nameLists.find((list) => list.id === source.namelistId) ?? null : null
}

export function nameListOptions(input: { source: ProjectLike | undefined; nameLists: readonly NameListLike[]; meeting: boolean }): ListOption[] {
  const options: ListOption[] = []
  if (input.meeting) options.push({ id: MEETING, label: 'Koppla till Meeting' })
  const previous = previousNameList(input.source, input.nameLists)
  if (previous && input.source) options.push({ id: previous.id, label: `Samma lista som ${input.source.name}: ${previous.name}` })
  options.push({ id: NONE, label: 'Ingen namnlista, jag kopplar senare' })
  return options
}

/** Förvalet: det första alternativet (Meeting för Meeting-kunder, annars den föreslagna listan, annars Ingen). */
export function defaultChoice(options: readonly ListOption[]): string {
  return options[0]?.id ?? NONE
}

export interface ListChoices {
  agenda: string
  namelist: string
}

/**
 * Ett val i en av rullistorna. En Meeting-koppling skapar BÅDA listorna, så Meeting väljs i båda eller ingen: väljer man Meeting i den ena
 * följer den andra med, och väljer man något annat i den ena medan båda stod på Meeting går den andra tillbaka till sitt förval.
 */
export function chooseList(
  current: ListChoices,
  which: keyof ListChoices,
  value: string,
  fallbacks: ListChoices,
): ListChoices {
  const other: keyof ListChoices = which === 'agenda' ? 'namelist' : 'agenda'
  const next = { ...current, [which]: value }
  if (value === MEETING) next[other] = MEETING
  else if (current[other] === MEETING) next[other] = fallbacks[other]
  return next
}

export interface AttachPlan {
  agendaId: string | null
  namelistId: string | null
  /** Öppna Meeting-kopplingen i det nya projektet (den skapar och kopplar båda listorna). */
  openMeeting: boolean
}

/** Vad som ska göras efter att projektet skapats. "Ingen" betyder ingen koppling alls. */
export function attachPlan(choices: ListChoices): AttachPlan {
  if (choices.agenda === MEETING || choices.namelist === MEETING) return { agendaId: null, namelistId: null, openMeeting: true }
  return {
    agendaId: choices.agenda === NONE ? null : choices.agenda,
    namelistId: choices.namelist === NONE ? null : choices.namelist,
    openMeeting: false,
  }
}
