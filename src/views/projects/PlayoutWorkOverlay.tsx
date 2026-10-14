import { t } from '@lingui/core/macro'
import { client } from '../../data'
import type { Channel, ChannelHealth, Project, TimelineEvent } from '../../data/types'
import { useResource } from '../../app/useResource'
import { formatLocalTime } from '../../app/time'
import { Clock } from '../../components/Clock'
import type { ProjectActions } from './actions'
import { EncoderStatusChip, ViewersChip } from './LiveStatusBadges'
import { signalSince } from './ProjectHeader'
import { encoderStatusOf, viewerCountOf } from './liveStatus'
import { ModeSelector } from './ModeSelector'
import { PlayoutColumns } from './PlayoutColumns'
import { PlayoutOverlay } from './PlayoutOverlay'
import { useNameList } from './useNameList'
import './LiveWorkspace.css'

interface NowPanelsProps {
  project: Project
  actions: ProjectActions
  /** Tidsstämpeln visas inte i utspelningsvyn (UNG-179), för att spara höjd. */
  showTime: boolean
}

// Det som är utspelat nu: aktuell punkt och aktuell talare, med ✕ för att rensa. Visas i Live-översikten och i utspelningsvyn.
export function NowPanels({ project: p, actions, showTime }: NowPanelsProps) {
  const agendaResource = useResource(
    () => (p.agendaId ? client.agendas.get(p.agendaId) : Promise.resolve(undefined)),
    [p.agendaId],
  )
  const nameListResource = useNameList(p)

  const nowItem =
    p.playout.currentAgendaItem?.label ??
    agendaResource.data?.items.find((it) => it.id === p.playout.currentAgendaItemId)?.title ??
    null
  const nowSpeaker =
    p.playout.currentPerson?.label ??
    nameListResource.data?.people.find((pe) => pe.id === p.playout.currentPersonId)?.name ??
    null
  const nowExclamation = p.playout.currentExclamation?.label ?? null

  const latestEvent = (kind: TimelineEvent['kind'], refId: string | null): TimelineEvent | null =>
    refId ? p.playout.timeline.filter((event) => event.kind === kind && event.refId === refId).at(-1) ?? null : null
  const currentAgendaEvent = latestEvent('agendaItem', p.playout.currentAgendaItemId)
  const currentPersonEvent = latestEvent('person', p.playout.currentPersonId)

  const panels: { key: string; label: string; value: string | null; occurredAt: string | null; clearLabel: string; onClear: () => void }[] = [
    { key: 'item', label: t`Current item`, value: nowItem, occurredAt: currentAgendaEvent?.occurredAt ?? null, clearLabel: t`Clear agenda item on screen`, onClear: () => actions.clear('agendaItem') },
    {
      key: 'person',
      label: t`Current speaker`,
      // Tillfällig talare (exclamation-cue) är momentan och visas i samma ruta
      // istället för en egen — den vinner medan den är aktiv, annars faller
      // vi tillbaka till den ordinarie aktuella talaren.
      value: nowExclamation ?? nowSpeaker,
      occurredAt: nowExclamation ? null : currentPersonEvent?.occurredAt ?? null,
      clearLabel: nowExclamation ? t`Clear temporary speaker` : t`Clear speaker on screen`,
      onClear: () => actions.clear(nowExclamation ? 'exclamation' : 'person'),
    },
  ]

  return (
    <div class="lw-now">
      {panels.map((panel) => (
        <NowPanel
          key={panel.key}
          label={panel.label}
          value={panel.value}
          occurredAt={panel.occurredAt}
          showTime={showTime}
          clearLabel={panel.clearLabel}
          onClear={panel.onClear}
        />
      ))}
    </div>
  )
}

interface NowPanelProps {
  label: string
  value: string | null
  occurredAt: string | null
  showTime?: boolean
  clearLabel: string
  onClear: () => void
}

// Rutan har fast storlek från start — den får aldrig ändras när något spelas ut eller rensas, annars hoppar
// listorna under och operatören riskerar att klicka fel. Därför är layouten alltid densamma: etikett, två
// rader text (längre kläms med "…", hela texten finns som tooltip), en tidsrad och en plats för ✕-knappen.
// Tidsraden och knappen är kvar men osynliga när inget är aktivt, så ingenting i rutan visas/döljs på ett
// sätt som påverkar höjden. Höjderna sätts i LiveWorkspace.css.
function NowPanel({ label, value, occurredAt, showTime = true, clearLabel, onClear }: NowPanelProps) {
  return (
    <div class={`lw-now-panel${value ? ' is-active' : ''}${showTime ? '' : ' no-time'}`}>
      <span class="lw-now-label">{label}</span>
      <span class="lw-now-value">
        <span class="lw-now-text">
          <span class="lw-now-title" title={value ?? undefined}>{value ?? '–'}</span>
          {showTime && <small class="lw-now-time">{occurredAt ? formatLocalTime(occurredAt) : ''}</small>}
        </span>
        <button
          class="pv-icon-btn"
          type="button"
          style={value ? undefined : { visibility: 'hidden' }}
          aria-label={clearLabel}
          title={clearLabel}
          onClick={onClear}
        >
          ✕
        </button>
      </span>
    </div>
  )
}

interface SignalInterruptProps {
  actions: ProjectActions
}

// Signalavbrottet visas både i Live-översikten och i utspelningsvyn, som täcker översikten.
export function SignalInterrupt({ actions }: SignalInterruptProps) {
  return (
    <div class="lw-interrupt" role="alert">
      <p>{t`Signal interruption — the video signal has been interrupted while the player is open.`}</p>
      <button class="btn btn-sm" type="button" onClick={() => void actions.interruptionDecision('wait_for_reconnect')}>
        {t`Wait for reconnection`}
      </button>
      <button class="btn btn-danger btn-sm" type="button" onClick={() => void actions.interruptionDecision('end')}>
        {t`Close player and end`}
      </button>
    </div>
  )
}

interface PlayoutWorkOverlayProps {
  project: Project
  actions: ProjectActions
  channel: Channel | null
  health: ChannelHealth | null
  onClose: () => void
}

// UNG-268/269: utspelningsvyn, densamma i Before och Live (UI-finslipning omgång 1): huvudet med lägesknapparna (med paus), signal,
// tittare och klocka, så att man kan byta läge och se signalen utan att stänga vyn; det utspelade nu och dagordning + namnlista.
export function PlayoutWorkOverlay({ project: p, actions, channel, health, onClose }: PlayoutWorkOverlayProps) {
  const encoderStatus = encoderStatusOf({ hasChannel: Boolean(channel), publicMode: p.publicMode, livePhase: health?.livePhase, healthState: health?.state })
  const viewerCount = viewerCountOf(health)
  return (
    <PlayoutOverlay
      projectName={p.name}
      onClose={onClose}
      center={<>
        <ModeSelector project={p} actions={actions} />
        <EncoderStatusChip status={encoderStatus} />
      </>}
      bar={<>
        {viewerCount !== null && <ViewersChip count={viewerCount} />}
        <span class="pv-clock"><Clock since={signalSince(p, health)} /></span>
      </>}
    >
      <div class="lw">
        {health?.livePhase === 'signalInterrupted' && <SignalInterrupt actions={actions} />}
        <NowPanels project={p} actions={actions} showTime={false} />
        <PlayoutColumns project={p} actions={actions} live />
      </div>
    </PlayoutOverlay>
  )
}
