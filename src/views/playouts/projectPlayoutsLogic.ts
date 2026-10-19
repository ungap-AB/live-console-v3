import type { Project, ProjectMeetingLink } from '../../data/types'

// UNG-332: the shell's project list. A project is a broadcast (Presenter project) connected to a meeting (a meeting link,
// UNG-338). Presenter owns the connection, so the console renders the list; the shell only frames it.
export interface ProjectPlayout {
  project: Project
  link: ProjectMeetingLink
}

const MODE_ORDER: Record<Project['publicMode'], number> = { live: 0, before: 1, after: 2, ondemand: 3 }

/** Connected projects only; a broadcast in Live first, then Before, After and Ondemand, newest first within a mode. */
export function projectPlayouts(projects: readonly Project[], links: readonly ProjectMeetingLink[]): ProjectPlayout[] {
  const byId = new Map(projects.map((project) => [project.id, project]))
  return links
    .flatMap((link) => {
      const project = byId.get(link.projectId)
      return project ? [{ project, link }] : []
    })
    .sort((a, b) => MODE_ORDER[a.project.publicMode] - MODE_ORDER[b.project.publicMode] || b.project.createdAt.localeCompare(a.project.createdAt))
}

/** The meeting as the list shows it: the title snapshot, or the start of its id when none was typed. */
export function meetingLabel(link: ProjectMeetingLink): string {
  return link.meetingTitle?.trim() || `${link.meetingId.slice(0, 8)}…`
}
