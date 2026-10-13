import { i18n } from '@lingui/core'
import { t } from '@lingui/core/macro'

// UNG-189: agenda and name list in the create dialog. No gate: "Create" only needs a name. No choice to create a new list (that is done in
// the project view or under the respective feature in the left menu). The options per question:
//   * Agenda: the most recently created unused agenda (preselected if there is one), None (link later).
//   * Name list: the same list as the previous project (preselected if it has one), None (link later).
//   * Meeting customers: "Link to Meeting" is among the options and preselected (a Meeting link creates both lists).
// "None" and "link later" are equivalent and therefore ONE option.

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

/** A Meeting customer: one of the domain's projects is already linked to a Meeting meeting. */
export function isMeetingCustomer(projects: readonly Pick<ProjectLike, 'meetingBindingId'>[]): boolean {
  return projects.some((project) => Boolean(project.meetingBindingId))
}

/** The most recently created (most recently changed, until agendas get a created time) unused agenda. Templates do not count. */
export function latestUnusedAgenda<T extends AgendaLike>(agendas: readonly T[]): T | null {
  const unused = agendas.filter((agenda) => agenda.usedInProjects === 0 && !agenda.isTemplate)
  unused.sort((left, right) => Date.parse(right.changedAt) - Date.parse(left.changedAt))
  return unused[0] ?? null
}

export function agendaOptions(input: { agendas: readonly AgendaLike[]; meeting: boolean; picked?: string }): ListOption[] {
  const options: ListOption[] = []
  if (input.meeting) options.push({ id: MEETING, label: t`Link to Meeting` })
  const latest = latestUnusedAgenda(input.agendas)
  if (latest) options.push({ id: latest.id, label: latest.name })
  pushPicked(options, input.agendas, input.picked)
  options.push({ id: NONE, label: t`No agenda, I will link one later` })
  return options
}

// UNG-287: a list chosen in the picker dialog ("Choose another…") becomes an option of its own, unless it already is one.
function pushPicked(options: ListOption[], lists: readonly { id: string; name: string }[], picked: string | undefined) {
  if (!picked || options.some((option) => option.id === picked)) return
  const list = lists.find((candidate) => candidate.id === picked)
  if (!list) return
  const name = list.name
  options.push({ id: list.id, label: t`Chosen: ${name}` })
}

export type ListUsageFilter = 'all' | 'unused' | 'used'

export interface PickableList {
  id: string
  name: string
  usedInProjects: number
  changedAt: string
  isTemplate?: boolean
}

/** UNG-287: the picker dialog's list: search in the name (case-insensitive), filter on used/unused, most recently changed first. Templates are not shown. */
export function filterLists<T extends PickableList>(lists: readonly T[], query: string, usage: ListUsageFilter): T[] {
  const needle = query.trim().toLocaleLowerCase(i18n.locales)
  return lists
    .filter((list) => !list.isTemplate)
    .filter((list) => !needle || list.name.toLocaleLowerCase(i18n.locales).includes(needle))
    .filter((list) => usage === 'all' || (usage === 'unused' ? list.usedInProjects === 0 : list.usedInProjects > 0))
    .sort((left, right) => Date.parse(right.changedAt) - Date.parse(left.changedAt))
}

/** The name list that the previous project (the project the layout starts from) has, if it still exists. */
export function previousNameList(source: ProjectLike | undefined, nameLists: readonly NameListLike[]): NameListLike | null {
  return source?.namelistId ? nameLists.find((list) => list.id === source.namelistId) ?? null : null
}

export function nameListOptions(input: { source: ProjectLike | undefined; nameLists: readonly NameListLike[]; meeting: boolean; picked?: string }): ListOption[] {
  const options: ListOption[] = []
  if (input.meeting) options.push({ id: MEETING, label: t`Link to Meeting` })
  const previous = previousNameList(input.source, input.nameLists)
  if (previous && input.source) {
    const project = input.source.name
    const list = previous.name
    options.push({ id: previous.id, label: t`Same list as ${project}: ${list}` })
  }
  pushPicked(options, input.nameLists, input.picked)
  options.push({ id: NONE, label: t`No name list, I will link one later` })
  return options
}

/** The preselection: the first option (Meeting for Meeting customers, otherwise the suggested list, otherwise None). */
export function defaultChoice(options: readonly ListOption[]): string {
  return options[0]?.id ?? NONE
}

export interface ListChoices {
  agenda: string
  namelist: string
}

/**
 * A choice in one of the dropdowns. A Meeting link creates BOTH lists, so Meeting is chosen in both or neither: choosing Meeting in one
 * makes the other follow, and choosing something else in one while both were on Meeting sends the other back to its preselection.
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
  /** Open the Meeting link in the new project (it creates and links both lists). */
  openMeeting: boolean
}

/** What to do after the project is created. "None" means no link at all. */
export function attachPlan(choices: ListChoices): AttachPlan {
  if (choices.agenda === MEETING || choices.namelist === MEETING) return { agendaId: null, namelistId: null, openMeeting: true }
  return {
    agendaId: choices.agenda === NONE ? null : choices.agenda,
    namelistId: choices.namelist === NONE ? null : choices.namelist,
    openMeeting: false,
  }
}
