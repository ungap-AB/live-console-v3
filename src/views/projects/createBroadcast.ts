import { client } from '../../data'
import type { Project } from '../../data/types'
import { attachPlan, type ListChoices } from './createProjectLists'
import type { NewBroadcastMeeting } from './CreateProjectDialog'

export type CreateStepFailure = 'agenda' | 'namelist' | 'meeting'

/**
 * Creates a broadcast (a Presenter project), attaches the chosen lists (UNG-189) and, in ungap Shell, connects it to its
 * meeting (flows-and-views.md: then it is a project). A failed attachment leaves the broadcast; the caller says which.
 */
export async function createBroadcast(
  name: string,
  layoutSourceProjectId: string | null,
  lists: ListChoices,
  meeting: NewBroadcastMeeting | null,
): Promise<{ created: Project; failed: CreateStepFailure[]; openMeetingBinding: boolean; meetingError: string | null }> {
  let created = await client.projects.create({ name, layoutSourceProjectId: layoutSourceProjectId ?? undefined })
  const plan = attachPlan(lists)
  const failed: CreateStepFailure[] = []
  if (plan.agendaId) {
    try {
      created = await client.projects.setAgenda(created.id, plan.agendaId)
    } catch {
      failed.push('agenda')
    }
  }
  if (plan.namelistId) {
    try {
      created = await client.projects.setNameList(created.id, plan.namelistId)
    } catch {
      failed.push('namelist')
    }
  }
  let meetingError: string | null = null
  if (meeting) {
    try {
      await client.projects.setMeetingLink(created.id, meeting.meetingId, meeting.title || undefined)
    } catch (err) {
      failed.push('meeting')
      meetingError = err instanceof Error ? err.message : String(err)
    }
  }
  return { created, failed, openMeetingBinding: plan.openMeeting, meetingError }
}
