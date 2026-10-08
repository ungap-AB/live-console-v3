import { useContext, useEffect, useMemo, useRef, useState } from 'preact/hooks'
import { client } from '../../data'
import type { CueKind, PlayoutState, Project, PublicMode, TimelineEvent, Visibility } from '../../data/types'
import { useResource } from '../../app/useResource'
import { OverflowMenu } from '../../components/OverflowMenu'
import { Icon } from '../../components/Icon'
import { JobProgress } from '../../components/JobProgress'
import { JobsContext } from '../../app/jobsContext'
import { RenameModal } from '../../components/RenameModal'
import { CreateProjectDialog } from './CreateProjectDialog'
import { ConfirmModal } from '../../components/ConfirmModal'
import { Toast } from '../../components/Toast'
import { formatShortDate } from '../../app/time'
import { errorMessage, runOptimistic } from '../../app/optimistic'
import { Livesandning } from './Livesandning'
import { OndemandView } from './OndemandView'
import { MODE_LABEL } from './projectMode'
import { listCaptionButton, requestCaptionStudio } from './captionEntryLogic'
import { currentPauseFromTimeline, normalizePauseText } from './pauseLogic'
import { activeJobsByProject, jobKindIcon, jobKindLabel } from './projectJobLogic'
import { needsScroll, revealTarget } from './projectListFocus'
import { openJobsView } from '../../app/jobsBus'
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
    currentPause: currentPauseFromTimeline(timeline),
    timeline,
  }
}

/** Knappen för undertexter visas för projekt i ondemand-läget med en färdig inspelning (där redigeraren finns). */
function captionsListable(project: Project): boolean {
  const state = project.recording?.state
  return screenForMode(project.publicMode) === 'ondemand' && (state === 'recorded' || state === 'trimmed' || state === 'published')
}

interface ProjectsViewProps {
  meetingDomain: string
  selectionScope: string
  selectedId: string | null
  /** Projektet som senast var öppet (UNG-183): markeras och scrollas fram när listan visas. */
  lastOpenedId?: string | null
  onSelectedIdChange: (id: string | null) => void
  screen: ProjectScreen
  onScreenChange: (screen: ProjectScreen) => void
  /** Lyft till App.tsx så navmenyns "+ Ny"-knapp (bild 1) kan öppna dialogen utifrån. */
  creating: boolean
  onCreatingChange: (creating: boolean) => void
}

export function ProjectsView({
  meetingDomain,
  selectionScope,
  selectedId,
  lastOpenedId = null,
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

  const jobs = useContext(JobsContext)
  const activeJobs = useMemo(() => activeJobsByProject(jobs), [jobs])
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

  // UNG-183: när listan visas (tillbaka från ett projekt, eller när man kommer hit från en annan vy) scrollas det senast öppnade
  // projektet fram och får fokus på sin namnknapp, så Enter öppnar det igen. Raden markeras så länge det är det senast öppnade.
  const listRef = useRef<HTMLUListElement | null>(null)
  const revealPending = useRef(lastOpenedId !== null)
  useEffect(() => {
    if (selectedId) {
      revealPending.current = true
      return
    }
    if (!revealPending.current) return
    const target = revealTarget(lastOpenedId, projects)
    const row = target ? listRef.current?.querySelector<HTMLElement>(`[data-project-id="${CSS.escape(target)}"]`) : null
    if (!row) return
    revealPending.current = false
    const container = row.closest<HTMLElement>('.content')
    const view = container?.getBoundingClientRect() ?? { top: 0, bottom: window.innerHeight }
    const rect = row.getBoundingClientRect()
    if (needsScroll(rect, view)) row.scrollIntoView({ block: 'center' })
    row.querySelector<HTMLElement>('.project-row-name')?.focus({ preventScroll: true })
  }, [selectedId, projects, lastOpenedId])

  // Tillbaka till listan: hämta den på nytt, så att undertextläget (genererar n %, utkast, publicerade) är aktuellt.
  const previousSelected = useRef<string | null>(selectedId)
  useEffect(() => {
    if (previousSelected.current && !selectedId) resource.reload()
    previousSelected.current = selectedId
  }, [selectedId])

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

  function patchProject(id: string, patch: Partial<Project>) {
    setProjects((prev) => prev.map((p) => (p.id === id ? { ...p, ...patch } : p)))
  }

  // UNG-105: nytt namn (och texter) syns direkt; vid fel återställs de och en toast visar felet.
  function renameProject(project: Project, name: string, texts?: Parameters<ProjectActions['rename']>[1]): Promise<boolean> {
    const before: Partial<Project> = { name: project.name }
    for (const key of Object.keys(texts ?? {}) as (keyof NonNullable<typeof texts>)[]) {
      Object.assign(before, { [key]: project[key] })
    }
    return runOptimistic({
      key: `project:${project.id}`,
      apply: () => {
        patchProject(project.id, { name, ...texts })
        return () => patchProject(project.id, before)
      },
      request: () => client.projects.rename(project.id, name, texts),
      onSuccess: replace,
      onError: (err) => setToast(errorMessage(err)),
    })
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

  async function createProject(name: string, layoutSourceProjectId: string | null) {
    const created = await client.projects.create({ name, layoutSourceProjectId: layoutSourceProjectId ?? undefined })
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
    rename: (name: string, texts) => (selected ? renameProject(selected, name, texts) : Promise.resolve(true)),
    setPoster: (file: File) =>
      attempt(async () => {
        if (!selected) return
        replace(await client.projects.setPoster(selected.id, file))
      }),
    removePoster: () =>
      attempt(async () => {
        if (!selected) return
        replace(await client.projects.removePoster(selected.id))
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
    inheritLayout: (sourceProjectId: string) =>
      attempt(async () => {
        if (!selected) return
        replace(await client.projects.inheritLayout(selected.id, sourceProjectId))
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

      // Servern döljer namnet som visades för förra punkten i samma anrop (UNG-112); spegla det här så
      // vyn inte visar den gamla talaren som aktiv tills projektet laddas om.
      const hideId = `${tempId}-hide`
      const hideNameEvent: TimelineEvent | null = kind === 'agendaItem' && project.playout.currentPersonId
        ? { id: hideId, kind: 'person', refId: null, label: 'Rensat', occurredAt: optimisticEvent.occurredAt, offsetSeconds }
        : null
      // En punkt eller ett namn som spelas ut under en pågående paus avslutar pausen (UNG-119); servern lägger in pauseOut
      // precis före, och vyn speglar det så pausen inte ser ut att fortsätta.
      const resumeId = `${tempId}-resume`
      const resumeEvent: TimelineEvent | null = project.playout.currentPause
        ? { id: resumeId, kind: 'pauseOut', refId: null, label: 'Paus slut', occurredAt: optimisticEvent.occurredAt, offsetSeconds }
        : null
      const isOptimistic = (e: TimelineEvent) => e.id === tempId || e.id === hideId || e.id === resumeId

      // Optimistisk uppdatering — inget behov av att vänta på eller hämta om
      // hela projektet. Servern är sanningen i bakgrunden; vi rättar till
      // eller rullar tillbaka om anropet faktiskt misslyckas.
      updateProjectPlayout(project.id, (playout) =>
        derivePlayoutState([...playout.timeline, ...(resumeEvent ? [resumeEvent] : []), ...(hideNameEvent ? [hideNameEvent] : []), optimisticEvent]))

      client.projects.cue(project.id, kind, refId, label).then(
        (realEvent) => {
          if (realEvent.kind !== kind || realEvent.refId !== refId) {
            updateProjectPlayout(project.id, (playout) => derivePlayoutState(playout.timeline.filter((e) => !isOptimistic(e))))
            setToast('Backend bekräftade inte den klickade punkten.')
            return
          }
          updateProjectPlayout(project.id, (playout) => derivePlayoutState(playout.timeline.map((e) => (e.id === tempId ? realEvent : e))))
        },
        (err) => {
          updateProjectPlayout(project.id, (playout) => derivePlayoutState(playout.timeline.filter((e) => !isOptimistic(e))))
          setToast(err instanceof Error ? err.message : 'Kunde inte spela ut.')
        },
      )
    },
    // UNG-119: pausen är en optimistisk uppdatering av tidslinjen precis som en utspelning; vid fel rullas den tillbaka.
    pause: (text: string) => {
      if (!selected) return
      const project = selected
      const label = normalizePauseText(text)
      const tempId = `tmp-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`
      const running = project.playout.currentPause
      const previousTimeline = project.playout.timeline
      // En ny text under en pågående paus byter texten; annars startas en ny paus.
      updateProjectPlayout(project.id, (playout) => derivePlayoutState(running
        ? playout.timeline.map((e) => (e.id === running.id ? { ...e, label } : e))
        : [...playout.timeline, { id: tempId, kind: 'pauseIn', refId: null, label, occurredAt: new Date().toISOString(), offsetSeconds: null }]))
      client.projects.pause(project.id, label).then(
        (realEvent) => updateProjectPlayout(project.id, (playout) => derivePlayoutState(playout.timeline.map((e) => (e.id === tempId || e.id === realEvent.id ? realEvent : e)))),
        (err) => {
          updateProjectPlayout(project.id, () => derivePlayoutState(previousTimeline))
          setToast(err instanceof Error ? err.message : 'Kunde inte starta pausen.')
        },
      )
    },
    resume: () => {
      if (!selected) return
      const project = selected
      if (!project.playout.currentPause) return
      const tempId = `tmp-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`
      const previousTimeline = project.playout.timeline
      updateProjectPlayout(project.id, (playout) => derivePlayoutState([...playout.timeline, { id: tempId, kind: 'pauseOut', refId: null, label: 'Paus slut', occurredAt: new Date().toISOString(), offsetSeconds: null }]))
      client.projects.resume(project.id).then(
        (realEvent) => updateProjectPlayout(project.id, (playout) => derivePlayoutState(playout.timeline.map((e) => (e.id === tempId ? realEvent : e)))),
        (err) => {
          // Någon annan hann före (409 not_paused): läget är ändå "ingen paus". Annars rullas vi tillbaka.
          if (err instanceof ApiError && err.code === 'not_paused') {
            updateProjectPlayout(project.id, (playout) => derivePlayoutState(playout.timeline.filter((e) => e.id !== tempId).concat({ id: tempId, kind: 'pauseOut', refId: null, label: 'Paus slut', occurredAt: new Date().toISOString(), offsetSeconds: null })))
            return
          }
          updateProjectPlayout(project.id, () => derivePlayoutState(previousTimeline))
          setToast(err instanceof Error ? err.message : 'Kunde inte avsluta pausen.')
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
          <button class="btn btn-sm" type="button" onClick={() => onCreatingChange(true)}>
            + Nytt
          </button>
        </div>
      </header>

      <div class="content">
        {selected && screen === 'livesandning' ? (
          <Livesandning
            project={selected}
            actions={actions}
            meetingDomain={meetingDomain}
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
                  <span class="col-captions">Undertexter</span>
                  <span class="col-actions" />
                </div>
                <ul class="project-list-rows" ref={listRef}>
                  {sortedProjects.map((p) => (
                    <li key={p.id} class={`project-row${p.id === lastOpenedId ? ' is-last-opened' : ''}`} data-project-id={p.id} aria-current={p.id === lastOpenedId ? 'true' : undefined}>
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
                      {(() => {
                        const active = activeJobs.get(p.id)
                        if (!active) return null
                        return (
                          <button
                            class="project-row-job"
                            type="button"
                            title={`${jobKindLabel(active.job.kind)} pågår. Öppna Jobb.`}
                            onClick={openJobsView}
                          >
                            <Icon name={jobKindIcon(active.job.kind)} size={16} />
                            <JobProgress progress={active.job.progress} phase={active.job.phase} />
                            {active.extra > 0 && <span class="project-row-job-extra">+{active.extra}</span>}
                          </button>
                        )
                      })()}
                      <span class="col-date">{formatShortDate(p.createdAt)}</span>
                      <span class="col-mode">
                        <span class={`mode-chip mode-${MODE_TONE[p.publicMode]}`}>{MODE_LABEL[p.publicMode]}</span>
                      </span>
                      <span class={`col-visibility vis-${p.visibility}`}>
                        <Icon name={p.visibility === 'open' ? 'visibility' : 'visibility_off'} size={16} />
                        {p.visibility === 'open' ? 'Öppen' : 'Stängd'}
                      </span>
                      <span class="col-captions">
                        {captionsListable(p) && (() => {
                          const button = listCaptionButton(p.captionStatus)
                          return (
                            <button
                              class={`btn btn-sm caption-list-button is-${button.tone}`}
                              type="button"
                              title={button.title}
                              onClick={() => {
                                requestCaptionStudio(p.id)
                                onSelectedIdChange(p.id)
                                onScreenChange('ondemand')
                              }}
                            >
                              <Icon name="closed_caption" size={16} /> {button.label}
                            </button>
                          )
                        })()}
                      </span>
                      <span class="col-actions">
                        <OverflowMenu
                          label={`Fler åtgärder för ${p.name}`}
                          items={[
                            // UNG-188: Kopiera länk ligger i menyn, inte som egen knapp på raden. Inaktivt (med förklaring) om länk saknas.
                            {
                              label: 'Kopiera länk',
                              disabled: !p.playerUrl,
                              title: p.playerUrl ? undefined : 'Projektet saknar spelarlänk',
                              onClick: () =>
                                void navigator.clipboard.writeText(p.playerUrl).then(
                                  () => setToast('Spelarlänken kopierades.'),
                                  () => setToast('Det gick inte att kopiera länken.'),
                                ),
                            },
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
          onSave={(name) => {
            const project = renaming
            setRenaming(null)
            void renameProject(project, name)
          }}
        />
      )}

      {creating && (
        <CreateProjectDialog projects={projects} onCancel={() => onCreatingChange(false)} onCreate={(name, source) => void createProject(name, source)} />
      )}

      {toast && <Toast message={toast} onDismiss={() => setToast(null)} />}
    </div>
  )
}
