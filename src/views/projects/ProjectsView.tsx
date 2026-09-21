import { useEffect, useState } from 'preact/hooks'
import { client } from '../../data'
import type { CueKind, PlayoutState, Project, TimelineEvent, Visibility } from '../../data/types'
import { useResource } from '../../app/useResource'
import { SplitPane } from '../../components/SplitPane'
import { StatusChip, type ChipTone } from '../../components/StatusChip'
import { RenameModal } from '../../components/RenameModal'
import { ConfirmModal } from '../../components/ConfirmModal'
import { Toast } from '../../components/Toast'
import { Clock } from '../../components/Clock'
import { formatShortDate } from '../../app/time'
import { ProjectDetail } from './ProjectDetail'
import { Playout } from './Playout'
import type { ProjectActions } from './actions'
import { ApiError } from '../../data/http/fetchJson'
import { storeSelection } from '../../app/selectionStorage'
import './ProjectsView.css'

export type ProjectScreen = 'detail' | 'playout'

// En enda status per listrad istället för upp till tre samtidiga chips —
// återanvänder samma backend-härledda fält (technicalHealth/publication)
// som redan finns, bara i en fast prioritetsordning på ETT ställe. Se
// granskningen 2026-09-17 (Live Console Dark Mode - take 2).
function deriveProjectStatus(p: Project): { tone: ChipTone; label: string } {
  if (p.technicalHealth.channelState === 'live') return { tone: 'live', label: 'Sänder' }
  if (p.publication.state === 'published') return { tone: 'accent', label: 'Publicerad' }
  return p.visibility === 'open' ? { tone: 'neutral', label: 'Öppen' } : { tone: 'warn', label: 'Stängd' }
}

function derivePublicModeLabel(mode: Project['publicMode']): string {
  return mode === 'before' ? 'Before' : mode === 'live' ? 'Live' : mode === 'after' ? 'After' : 'Ondemand'
}

function deriveVisibilityLabel(visibility: Project['visibility']): string {
  return visibility === 'open' ? 'Öppen' : 'Stängd'
}

// currentAgendaItemId/currentPersonId härleds alltid ur tidslinjen (senaste
// händelsen av respektive typ) — en enda källa till sanning, så optimistiska
// uppdateringar och borttagning av en felklickad utspelning aldrig kan hamna
// i otakt med varandra.
function derivePlayoutState(timeline: TimelineEvent[]): PlayoutState {
  const lastItem = [...timeline].reverse().find((e) => e.kind === 'agendaItem')
  const lastPerson = [...timeline].reverse().find((e) => e.kind === 'person')
  const lastExclamation = [...timeline].reverse().find((e) => e.kind === 'exclamation')
  return {
    currentAgendaItemId: lastItem?.refId ?? null,
    currentPersonId: lastPerson?.refId ?? null,
    currentAgendaItem: lastItem?.label === 'Rensat' ? null : lastItem ?? null,
    currentPerson: lastPerson?.label === 'Rensat' ? null : lastPerson ?? null,
    currentExclamation: lastExclamation?.label === 'Rensat' ? null : lastExclamation ?? null,
    timeline,
  }
}

interface ProjectsViewProps {
  meetingDomain: string
  selectionScope: string
  selectedId: string | null
  onSelectedIdChange: (id: string | null) => void
  screen: ProjectScreen
  onScreenChange: (screen: ProjectScreen) => void
  /** Lyft till App.tsx så navmenyns "+ Ny"-knapp (bild 1) kan öppna dialogen utifrån. */
  creating: boolean
  onCreatingChange: (creating: boolean) => void
  onOpenAgenda: (id: string) => void
  onOpenNameList: (id: string) => void
}

export function ProjectsView({
  meetingDomain,
  selectionScope,
  selectedId,
  onSelectedIdChange,
  screen,
  onScreenChange,
  creating,
  onCreatingChange,
  onOpenAgenda,
  onOpenNameList,
}: ProjectsViewProps) {
  const resource = useResource(() => client.projects.list(), [])
  const [projects, setProjects] = useState<Project[]>([])
  const [toast, setToast] = useState<string | null>(null)
  const [confirmDelete, setConfirmDelete] = useState<Project | null>(null)

  useEffect(() => {
    if (resource.data) setProjects(resource.data)
  }, [resource.data])

  const sortedProjects = [...projects].sort(
    (left, right) => new Date(right.createdAt).getTime() - new Date(left.createdAt).getTime(),
  )

  useEffect(() => {
    if (sortedProjects.length > 0 && (!selectedId || !projects.some((project) => project.id === selectedId))) onSelectedIdChange(sortedProjects[0].id)
  }, [projects, selectedId])

  useEffect(() => {
    storeSelection('project', selectedId, selectionScope)
  }, [selectedId, selectionScope])

  const selected = projects.find((p) => p.id === selectedId) ?? null

  function replace(next: Project) {
    setProjects((prev) => prev.map((p) => (p.id === next.id ? next : p)))
  }

  // client.projects.list() ger bara en lätt sammanfattning (tom playout) —
  // hämta hela projektet (med riktig tidslinje) när ett projekt väljs, annars
  // ser Playout ut som om inget någonsin spelats ut på tidigare besökta projekt.
  useEffect(() => {
    if (!selectedId) return
    let cancelled = false
    client.projects.get(selectedId).then((full) => {
      if (!cancelled && full) replace(full)
    })
    return () => {
      cancelled = true
    }
  }, [selectedId])

  async function withErrorToast(fn: () => Promise<void>) {
    try {
      await fn()
    } catch (err) {
      setToast(err instanceof Error ? err.message : 'Något gick fel.')
    }
  }

  async function createProject(name: string) {
    const created = await client.projects.create({ name })
    setProjects((prev) => [created, ...prev])
    onSelectedIdChange(created.id)
    onScreenChange('detail')
    onCreatingChange(false)
  }

  async function deleteProject(project: Project) {
    await client.projects.trash(project.id)
    setProjects((prev) => prev.filter((p) => p.id !== project.id))
    onSelectedIdChange(null)
    onScreenChange('detail')
    setConfirmDelete(null)
  }

  const actions: ProjectActions = {
    refreshProject: async () => {
      if (!selected) return
      const refreshed = await client.projects.get(selected.id)
      if (refreshed) replace(refreshed)
    },
    refreshPlayout: async () => {
      if (!selected) return
      try {
        const playout = await client.projects.playout(selected.id)
        setProjects((prev) => prev.map((p) => (p.id === selected.id ? { ...p, playout } : p)))
      } catch (err) {
        if (err instanceof ApiError && err.code === 'project_not_found') {
          setProjects((prev) => prev.filter((p) => p.id !== selected.id))
          onSelectedIdChange(null)
          onScreenChange('detail')
          return
        }
        throw err
      }
    },
    rename: (name: string, texts) =>
      withErrorToast(async () => {
        if (!selected) return
        replace(await client.projects.rename(selected.id, name, texts))
      }),
    setVisibility: (visibility: Visibility) =>
      withErrorToast(async () => {
        if (!selected) return
        replace(await client.projects.setVisibility(selected.id, visibility))
      }),
    setPublicMode: (publicMode, afterReason) =>
      withErrorToast(async () => {
        if (!selected) return
        replace(await client.projects.setPublicMode(selected.id, publicMode, afterReason))
      }),
    setAgenda: (agendaId: string | null) =>
      withErrorToast(async () => {
        if (!selected) return
        replace(await client.projects.setAgenda(selected.id, agendaId))
      }),
    setNameList: (namelistId: string | null) =>
      withErrorToast(async () => {
        if (!selected) return
        replace(await client.projects.setNameList(selected.id, namelistId))
      }),
    setMeetingBinding: (meetingDomain, meetingId, eventsEnabled) =>
      withErrorToast(async () => {
        if (!selected) return
        replace(await client.projects.setMeetingBinding(selected.id, meetingDomain, meetingId, eventsEnabled))
      }),
    clearMeetingBinding: () =>
      withErrorToast(async () => {
        if (!selected) return
        replace(await client.projects.clearMeetingBinding(selected.id))
      }),
    createChannel: () =>
      withErrorToast(async () => {
        if (!selected) return
        replace(await client.projects.createChannel(selected.id))
      }),
    teardownChannel: () =>
      withErrorToast(async () => {
        if (!selected) return
        replace(await client.projects.teardownChannel(selected.id))
      }),
    setEncoderSending: (sending: boolean) =>
      withErrorToast(async () => {
        if (!selected) return
        replace(await client.projects.setEncoderSending(selected.id, sending))
      }),
    interruptionDecision: (decision) =>
      withErrorToast(async () => {
        if (!selected) return
        replace(await client.projects.interruptionDecision(selected.id, decision))
      }),
    trim: async (range) => {
      try {
        if (!selected) return false
        replace(await client.projects.trim(selected.id, range))
        return true
      } catch (err) {
        setToast(err instanceof Error ? err.message : 'Något gick fel.')
        return false
      }
    },
    publish: () =>
      withErrorToast(async () => {
        if (!selected) return
        replace(await client.projects.publish(selected.id))
      }),
    returnToLive: () =>
      withErrorToast(async () => {
        if (!selected) return
        replace(await client.projects.returnToLive(selected.id))
      }),
    cue: (kind: CueKind, refId: string, label: string) => {
      if (!selected) return
      const project = selected
      const tempId = `tmp-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`
      const live = project.channel?.state === 'live'
      const offsetSeconds =
        live && project.sim.recordingStartedAt
          ? Math.round(
              project.sim.accumulatedSeconds +
                (Date.now() - new Date(project.sim.recordingStartedAt).getTime()) / 1000,
            )
          : null
      const optimisticEvent: TimelineEvent = {
        id: tempId,
        kind,
        refId,
        label,
        occurredAt: new Date().toISOString(),
        offsetSeconds,
      }

      // Optimistisk uppdatering — inget behov av att vänta på eller hämta om
      // hela projektet. Servern är sanningen i bakgrunden; vi rättar till
      // eller rullar tillbaka om anropet faktiskt misslyckas.
      replace({ ...project, playout: derivePlayoutState([...project.playout.timeline, optimisticEvent]) })

      client.projects.cue(project.id, kind, refId, label).then(
        (realEvent) => {
          setProjects((prev) =>
            prev.map((p) =>
              p.id === project.id
                ? { ...p, playout: derivePlayoutState(p.playout.timeline.map((e) => (e.id === tempId ? realEvent : e))) }
                : p,
            ),
          )
        },
        (err) => {
          setProjects((prev) =>
            prev.map((p) =>
              p.id === project.id
                ? { ...p, playout: derivePlayoutState(p.playout.timeline.filter((e) => e.id !== tempId)) }
                : p,
            ),
          )
          setToast(err instanceof Error ? err.message : 'Kunde inte spela ut.')
        },
      )
    },
    clear: (kind: CueKind) => {
      if (!selected) return
      const project = selected
      const tempId = `tmp-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`
      const live = project.channel?.state === 'live'
      const offsetSeconds =
        live && project.sim.recordingStartedAt
          ? Math.round(
              project.sim.accumulatedSeconds +
                (Date.now() - new Date(project.sim.recordingStartedAt).getTime()) / 1000,
            )
          : null
      const optimisticEvent: TimelineEvent = {
        id: tempId,
        kind,
        refId: null,
        label: 'Rensat',
        occurredAt: new Date().toISOString(),
        offsetSeconds,
      }

      // Rensning loggas som en egen (tom) tidslinjehändelse, precis som cueing
      // — en utspelad cue är oåterkallelig, så det här är inte en ångra-knapp
      // som tar bort tidigare händelser.
      replace({ ...project, playout: derivePlayoutState([...project.playout.timeline, optimisticEvent]) })

      client.projects.clear(project.id, kind).then(
        (realEvent) => {
          setProjects((prev) =>
            prev.map((p) =>
              p.id === project.id
                ? { ...p, playout: derivePlayoutState(p.playout.timeline.map((e) => (e.id === tempId ? realEvent : e))) }
                : p,
            ),
          )
        },
        (err) => {
          setProjects((prev) =>
            prev.map((p) =>
              p.id === project.id
                ? { ...p, playout: derivePlayoutState(p.playout.timeline.filter((e) => e.id !== tempId)) }
                : p,
            ),
          )
          setToast(err instanceof Error ? err.message : 'Kunde inte rensa.')
        },
      )
    },
    reset: () =>
      withErrorToast(async () => {
        if (!selected) return
        replace(await client.projects.resetSimulation(selected.id))
      }),
  }

    const selectedProjectDetail = selected ? (
      <ProjectDetail
        project={selected}
        meetingDomain={meetingDomain}
        onDelete={() => setConfirmDelete(selected)}
        onDeleteBlocked={setToast}
        actions={actions}
        onOpenAgenda={onOpenAgenda}
        onOpenNameList={onOpenNameList}
        onOpenPlayout={() => onScreenChange('playout')}
      />
    ) : null

  return (
    <div class={`view${screen === 'playout' ? ' playout-active' : ''}`}>
      <header class={`project-header${screen === 'playout' || selected ? ' collapsed' : ''}`}>
        <div class="header-list-zone">
          <h1>Projekt</h1>
          <span class="spacer" />
          <button class="btn btn-sm" type="button" onClick={() => onCreatingChange(true)}>
            + Nytt
          </button>
        </div>
        <Clock />
      </header>

      <div class="content">
        {selected && screen === 'playout' ? (
          <div class="playout-frame doc">
            <Playout project={selected} onClose={() => onScreenChange('detail')} actions={actions} />
          </div>
        ) : selected ? (
          <div class="project-workspace doc">
            <div class="project-workspace-nav">
              <button class="btn btn-sm" type="button" onClick={() => onSelectedIdChange(null)}>
                ← Projekt
              </button>
            </div>
            {selectedProjectDetail}
          </div>
        ) : (
        <SplitPane
          listLabel="Projekt"
          detailLabel="Valt projekt"
          list={
            <>
              <ul>
                {resource.loading && projects.length === 0 && <li class="none">Laddar…</li>}
                {!resource.loading && projects.length === 0 && <li class="none">Inga projekt ännu.</li>}
                {sortedProjects.map((p) => {
                  const status = deriveProjectStatus(p)
                  return (
                    <li key={p.id} class={p.id === selectedId ? 'sel' : ''}>
                      <button
                        class="row"
                        type="button"
                        onClick={() => {
                          onSelectedIdChange(p.id)
                          onScreenChange('detail')
                        }}
                      >
                        <span class="rowtop">
                          <span class="nm">{p.name}</span>
                        </span>
                        <span class="meta-row">
                          <StatusChip tone={status.tone} dot={status.tone === 'live'}>
                            {status.label}
                          </StatusChip>
                          <span class="row-mode">{derivePublicModeLabel(p.publicMode)}</span>
                          <span class="row-visibility">{deriveVisibilityLabel(p.visibility)}</span>
                          <span class="row-date">{formatShortDate(p.createdAt)}</span>
                        </span>
                      </button>
                    </li>
                  )
                })}
              </ul>
            </>
          }
          detail={
            <div class="docnone">Välj ett projekt i listan.</div>
          }
        />
        )}
      </div>

      {confirmDelete && (
        <ConfirmModal
          title="Radera projekt?"
          confirmLabel="Radera projekt"
          danger
          onCancel={() => setConfirmDelete(null)}
          onConfirm={() => deleteProject(confirmDelete)}
        >
          <p>
            {confirmDelete.name} flyttas till papperskorgen. Det går att återställa därifrån innan
            gallringstiden löper ut.
          </p>
        </ConfirmModal>
      )}

      {creating && (
        <RenameModal
          title="Nytt projekt"
          initialValue=""
          onCancel={() => onCreatingChange(false)}
          onSave={createProject}
        />
      )}

      {toast && <Toast message={toast} onDismiss={() => setToast(null)} />}
    </div>
  )
}
