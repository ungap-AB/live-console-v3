import { useEffect, useState } from 'preact/hooks'
import { client } from '../../data'
import type { CueKind, PlayoutState, Project, PublicMode, TimelineEvent, Visibility } from '../../data/types'
import { useResource } from '../../app/useResource'
import { OverflowMenu } from '../../components/OverflowMenu'
import { Icon } from '../../components/Icon'
import { RenameModal } from '../../components/RenameModal'
import { ConfirmModal } from '../../components/ConfirmModal'
import { Toast } from '../../components/Toast'
import { formatShortDate } from '../../app/time'
import { Livesandning } from './Livesandning'
import { OndemandView } from './OndemandView'
import { MODE_LABEL } from './projectMode'
import type { ProjectActions } from './actions'
import { ApiError } from '../../data/http/fetchJson'
import { storeSelection } from '../../app/selectionStorage'
import './ProjectsView.css'

// Ett projekt öppnas i Livesändning (Before, Live) eller Ondemand (After, Ondemand).
export type ProjectScreen = 'livesandning' | 'ondemand'

export function parseProjectScreen(value: string | null): ProjectScreen {
  return value === 'ondemand' ? 'ondemand' : 'livesandning'
}

// Läget avgör vilken vy ett projekt öppnas i: Before och Live i Livesändning,
// After och Ondemand i Ondemand.
export function screenForMode(mode: PublicMode): ProjectScreen {
  return mode === 'before' || mode === 'live' ? 'livesandning' : 'ondemand'
}

// Rött är reserverat för Live, grönt för Ondemand/Öppen.
const MODE_TONE: Record<PublicMode, string> = {
  before: 'neutral',
  live: 'live',
  after: 'after',
  ondemand: 'ondemand',
}

// Samma spärrar som ProjectDetail tillämpar på "Radera projekt".
function deleteBlockedReason(p: Project): string | null {
  if (p.visibility === 'open') return 'Stäng projektet innan det raderas'
  if (p.technicalHealth.channelState === 'live') return 'Går inte att radera medan signal tas emot'
  if (p.capabilities.teardownChannel.status !== 'allowed') return 'Projektet går inte att radera just nu'
  return null
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
}

export function ProjectsView({
  selectionScope,
  selectedId,
  onSelectedIdChange,
  screen,
  onScreenChange,
  creating,
  onCreatingChange,
}: ProjectsViewProps) {
  const resource = useResource(() => client.projects.list(), [])
  const [projects, setProjects] = useState<Project[]>([])
  const [toast, setToast] = useState<string | null>(null)
  const [confirmDelete, setConfirmDelete] = useState<Project | null>(null)
  const [renaming, setRenaming] = useState<Project | null>(null)

  useEffect(() => {
    if (resource.data) setProjects(resource.data)
  }, [resource.data])

  const sortedProjects = [...projects].sort(
    (left, right) => new Date(right.createdAt).getTime() - new Date(left.createdAt).getTime(),
  )

  // Ett borttaget/okänt sparat val ska landa på listan, inte på en tom vy.
  useEffect(() => {
    if (selectedId && resource.data && !projects.some((project) => project.id === selectedId)) onSelectedIdChange(null)
  }, [projects, selectedId, resource.data])

  useEffect(() => {
    storeSelection('project', selectedId, selectionScope)
  }, [selectedId, selectionScope])

  const selected = projects.find((p) => p.id === selectedId) ?? null

  // Vyn följer läget: byts läget över gränsen mellan Livesändning och Ondemand
  // (till exempel Live → After) byter vyn med.
  const selectedMode = selected?.publicMode
  useEffect(() => {
    if (!selectedMode || (screen !== 'livesandning' && screen !== 'ondemand')) return
    const target = screenForMode(selectedMode)
    if (target !== screen) onScreenChange(target)
  }, [selectedMode, screen])

  function replace(next: Project) {
    setProjects((prev) => prev.map((p) => (p.id === next.id ? next : p)))
  }

  function updateProjectPlayout(projectId: string, update: (playout: PlayoutState) => PlayoutState) {
    setProjects((prev) => prev.map((p) => (p.id === projectId ? { ...p, playout: update(p.playout) } : p)))
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

  // Som withErrorToast, men berättar om anropet lyckades — lägesbyten med flera
  // steg måste kunna avbryta om ett steg misslyckas.
  async function attempt(fn: () => Promise<void>): Promise<boolean> {
    try {
      await fn()
      return true
    } catch (err) {
      setToast(err instanceof Error ? err.message : 'Något gick fel.')
      return false
    }
  }

  async function withErrorToast(fn: () => Promise<void>): Promise<void> {
    await attempt(fn)
  }

  async function createProject(name: string) {
    const created = await client.projects.create({ name })
    setProjects((prev) => [created, ...prev])
    onSelectedIdChange(created.id)
    onScreenChange(screenForMode(created.publicMode))
    onCreatingChange(false)
  }

  async function deleteProject(project: Project) {
    await client.projects.trash(project.id)
    setProjects((prev) => prev.filter((p) => p.id !== project.id))
    onSelectedIdChange(null)
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
                return
        }
        throw err
      }
    },
    rename: (name: string, texts) =>
      attempt(async () => {
        if (!selected) return
        replace(await client.projects.rename(selected.id, name, texts))
      }),
    setVisibility: (visibility: Visibility) =>
      withErrorToast(async () => {
        if (!selected) return
        replace(await client.projects.setVisibility(selected.id, visibility))
      }),
    setPublicMode: (publicMode, afterReason) =>
      attempt(async () => {
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
      attempt(async () => {
        if (!selected) return
        replace(await client.projects.publish(selected.id))
      }),
    unpublish: () =>
      attempt(async () => {
        if (!selected) return
        replace(await client.projects.unpublish(selected.id))
      }),
    restoreOriginal: () =>
      attempt(async () => {
        if (!selected) return
        replace(await client.projects.restoreOriginal(selected.id))
      }),
    returnToLive: () =>
      attempt(async () => {
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
      updateProjectPlayout(project.id, (playout) => derivePlayoutState([...playout.timeline, optimisticEvent]))

      client.projects.cue(project.id, kind, refId, label).then(
        (realEvent) => {
          if (realEvent.kind !== kind || realEvent.refId !== refId) {
            updateProjectPlayout(project.id, (playout) => derivePlayoutState(playout.timeline.filter((e) => e.id !== tempId)))
            setToast('Backend bekräftade inte den klickade punkten.')
            return
          }
          updateProjectPlayout(project.id, (playout) => derivePlayoutState(playout.timeline.map((e) => (e.id === tempId ? realEvent : e))))
        },
        (err) => {
          updateProjectPlayout(project.id, (playout) => derivePlayoutState(playout.timeline.filter((e) => e.id !== tempId)))
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
      updateProjectPlayout(project.id, (playout) => derivePlayoutState([...playout.timeline, optimisticEvent]))

      client.projects.clear(project.id, kind).then(
        (realEvent) => {
          if (realEvent.kind !== kind || realEvent.label !== 'Rensat') {
            updateProjectPlayout(project.id, (playout) => derivePlayoutState(playout.timeline.filter((e) => e.id !== tempId)))
            setToast('Backend bekräftade inte rensningen.')
            return
          }
          updateProjectPlayout(project.id, (playout) => derivePlayoutState(playout.timeline.map((e) => (e.id === tempId ? realEvent : e))))
        },
        (err) => {
          updateProjectPlayout(project.id, (playout) => derivePlayoutState(playout.timeline.filter((e) => e.id !== tempId)))
          setToast(err instanceof Error ? err.message : 'Kunde inte rensa.')
        },
      )
    },
  }

  return (
    <div class="view">
      <header class={`project-header${selected ? ' collapsed' : ''}`}>
        <div class="header-list-zone">
          <h1>Projekt</h1>
          <span class="spacer" />
          <button class="btn btn-sm btn-primary" type="button" onClick={() => onCreatingChange(true)}>
            + Nytt projekt
          </button>
        </div>
      </header>

      <div class="content">
        {selected && screen === 'livesandning' ? (
          <Livesandning
            project={selected}
            actions={actions}
            onBack={() => onSelectedIdChange(null)}
          />
        ) : selected && screen === 'ondemand' ? (
          <OndemandView
            project={selected}
            actions={actions}
            onBack={() => onSelectedIdChange(null)}
          />
        ) : (
          <div class="project-list">
            {resource.loading && projects.length === 0 && <p class="project-list-empty">Laddar…</p>}
            {!resource.loading && projects.length === 0 && <p class="project-list-empty">Inga projekt ännu.</p>}
            {sortedProjects.length > 0 && (
              <>
                <div class="project-list-head" aria-hidden="true">
                  <span class="col-name">Projekt</span>
                  <span class="col-date">Datum</span>
                  <span class="col-mode">Läge</span>
                  <span class="col-visibility">Synlighet</span>
                  <span class="col-actions" />
                </div>
                <ul class="project-list-rows">
                  {sortedProjects.map((p) => (
                    <li key={p.id} class="project-row">
                      <button
                        class="project-row-name"
                        type="button"
                        onClick={() => {
                          onSelectedIdChange(p.id)
                          onScreenChange(screenForMode(p.publicMode))
                        }}
                      >
                        {p.name}
                      </button>
                      <span class="col-date">{formatShortDate(p.createdAt)}</span>
                      <span class="col-mode">
                        <span class={`mode-chip mode-${MODE_TONE[p.publicMode]}`}>{MODE_LABEL[p.publicMode]}</span>
                      </span>
                      <span class={`col-visibility vis-${p.visibility}`}>
                        <Icon name={p.visibility === 'open' ? 'visibility' : 'visibility_off'} size={16} />
                        {p.visibility === 'open' ? 'Öppen' : 'Stängd'}
                      </span>
                      <span class="col-actions">
                        <button
                          class="btn btn-sm btn-ghost"
                          type="button"
                          disabled={!p.playerUrl}
                          onClick={() =>
                            void navigator.clipboard.writeText(p.playerUrl).then(
                              () => setToast('Spelarlänken kopierades.'),
                              () => setToast('Det gick inte att kopiera länken.'),
                            )
                          }
                        >
                          <Icon name="content_copy" size={16} />
                          <span class="copy-label">Kopiera länk</span>
                        </button>
                        <OverflowMenu
                          label={`Fler åtgärder för ${p.name}`}
                          items={[
                            { label: 'Byt namn', onClick: () => setRenaming(p) },
                            {
                              label: 'Flytta till papperskorgen',
                              danger: true,
                              title: deleteBlockedReason(p) ?? undefined,
                              onClick: () => {
                                const reason = deleteBlockedReason(p)
                                if (reason) setToast(reason)
                                else setConfirmDelete(p)
                              },
                            },
                          ]}
                        />
                      </span>
                    </li>
                  ))}
                </ul>
                <p class="project-list-hint">Before och Live öppnar Livesändning. After och Ondemand öppnar Ondemand.</p>
              </>
            )}
          </div>
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

      {renaming && (
        <RenameModal
          initialValue={renaming.name}
          onCancel={() => setRenaming(null)}
          onSave={(name) =>
            withErrorToast(async () => {
              replace(await client.projects.rename(renaming.id, name))
              setRenaming(null)
            })
          }
        />
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
