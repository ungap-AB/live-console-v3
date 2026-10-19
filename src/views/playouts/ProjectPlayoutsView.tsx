import { t } from '@lingui/core/macro'
import { useState } from 'preact/hooks'
import { navigate } from '../../app/embed'
import { Toast } from '../../components/Toast'
import { CreateProjectDialog } from '../projects/CreateProjectDialog'
import { createBroadcast } from '../projects/createBroadcast'
import { useResource } from '../../app/useResource'
import { formatShortDate } from '../../app/time'
import { client } from '../../data'
import { MODE_LABEL } from '../projects/projectMode'
import { createdNotConnectedText, MODE_TONE } from '../projects/ProjectsView'
import { meetingLabel, projectPlayouts, type ProjectPlayout } from './projectPlayoutsLogic'
import '../projects/ProjectsView.css'
import './ProjectPlayoutsView.css'

interface ProjectPlayoutsViewProps {
  /** Opens the combined playout view for the project: Presenter's controls above, the connected meeting below. */
  onOpen: (row: ProjectPlayout) => void
  /** The domain can link projects to the legacy Meeting binding (passed on to the create dialog). */
  meetingEnabled: boolean
}

// UNG-332: "Projects" in ungap Shell. Each row is a broadcast connected to a meeting; opening it shows the combined
// playout view. Broadcasts and connections are made under Broadcasts (Before, step ungap Meeting).
export function ProjectPlayoutsView({ onOpen, meetingEnabled }: ProjectPlayoutsViewProps) {
  const resource = useResource(async () => {
    const [projects, links] = await Promise.all([client.projects.list(), client.projects.listMeetingLinks()])
    return { projects, rows: projectPlayouts(projects, links) }
  }, [])
  const rows = resource.data?.rows ?? []
  // flows-and-views.md: "+ New" creates a broadcast that belongs to a meeting, i.e. a project, and opens it.
  const [creating, setCreating] = useState(false)
  const [toast, setToast] = useState<string | null>(null)

  async function create(...[name, source, lists, meeting]: Parameters<Parameters<typeof CreateProjectDialog>[0]['onCreate']>) {
    try {
      const { created, failed, meetingError } = await createBroadcast(name, source, lists, meeting)
      setCreating(false)
      if (failed.includes('meeting')) {
        setToast(createdNotConnectedText(meetingError))
        navigate('broadcasts', created.id)
      } else {
        navigate('projects', created.id)
      }
    } catch (err) {
      setToast(err instanceof Error ? err.message : t`Something went wrong.`)
    }
  }

  return (
    <div class="view">
      <header class="project-header">
        <div class="header-list-zone">
          <h1>{t`Projects`}</h1>
          <span class="spacer" />
          <button class="btn btn-sm" type="button" onClick={() => setCreating(true)}>
            {t`+ New project`}
          </button>
        </div>
      </header>
      <div class="content project-list-content">
        <div class="project-list pp-list">
          {resource.loading && rows.length === 0 && <p class="project-list-empty">{t`Loading…`}</p>}
          {resource.error && <p class="project-list-empty" role="alert">{resource.error.message}</p>}
          {!resource.loading && !resource.error && rows.length === 0 && (
            <p class="project-list-empty">{t`No projects yet. Create one with + New, or connect a broadcast to a meeting under Broadcasts.`}</p>
          )}
          {rows.length > 0 && (
            <>
              <div class="project-list-head" aria-hidden="true">
                <span class="col-name">{t`Broadcast`}</span>
                <span>{t`Meeting`}</span>
                <span class="col-mode">{t`Mode`}</span>
                <span class="col-date">{t`Date`}</span>
              </div>
              <ul class="project-list-rows">
                {rows.map((row) => (
                  <li key={row.project.id} class="project-row">
                    <span class="col-name">
                      <button class="project-row-name" type="button" onClick={() => onOpen(row)}>
                        {row.project.name}
                      </button>
                    </span>
                    <span class="pp-meeting" title={row.link.meetingTitle ?? row.link.meetingId}>{meetingLabel(row.link)}</span>
                    <span class="col-mode">
                      <span class={`mode-chip mode-${MODE_TONE[row.project.publicMode]}`}>{MODE_LABEL[row.project.publicMode]}</span>
                    </span>
                    <span class="col-date">{formatShortDate(row.project.createdAt)}</span>
                  </li>
                ))}
              </ul>
            </>
          )}
        </div>
      </div>
      {creating && (
        <CreateProjectDialog
          projects={resource.data?.projects ?? []}
          meetingEnabled={meetingEnabled}
          meetingStep="required"
          onCancel={() => setCreating(false)}
          onCreate={(...args) => void create(...args)}
        />
      )}
      {toast && <Toast message={toast} onDismiss={() => setToast(null)} />}
    </div>
  )
}
