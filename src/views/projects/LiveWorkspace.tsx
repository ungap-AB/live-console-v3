import { useEffect, useState } from 'preact/hooks'
import { client } from '../../data'
import type { Channel, ChannelHealth, Project, TimelineEvent } from '../../data/types'
import { useIsRootAdmin } from '../../app/currentUserContext'
import { useResource } from '../../app/useResource'
import { formatHms, formatLocalTime } from '../../app/time'
import type { ProjectActions } from './actions'
import { PlayoutColumns } from './PlayoutColumns'
import { usePlayoutTestbed } from './playoutTestbed'
import { useNameList } from './useNameList'
import { Icon } from '../../components/Icon'
import { Modal } from '../../components/Modal'
import { MAX_PAUSE_TEXT_LENGTH, pauseDurationText } from './pauseLogic'
import './LiveWorkspace.css'

interface LiveWorkspaceProps {
  project: Project
  actions: ProjectActions
  channel: Channel | null
  health: ChannelHealth | null
  streamKey: string | null
}

// Ren sändningskontroll för läget Live.
export function LiveWorkspace({ project: p, actions, health }: LiveWorkspaceProps) {
  const testbed = usePlayoutTestbed(p, actions)
  // Testbädden är ett verktyg för oss (root admin), inte för operatörer.
  const isRootAdmin = useIsRootAdmin()
  const agendaResource = useResource(
    () => (p.agendaId ? client.agendas.get(p.agendaId) : Promise.resolve(undefined)),
    [p.agendaId],
  )
  const nameListResource = useNameList(p)
  const phase = health?.livePhase

  // UNG-129: expanderat läge för skärmar med låg höjd. Samma komponenter och tillstånd, bara en klass på vyn som lägger
  // den över hela fönstret, så ingenting monteras om och inget tillstånd (markering, scroll, redigering) tappas.
  // Läget stängs bara med knappen: Esc hör till sökfältet och dialogerna (UNG-177).
  // UNG-119: medan en paus pågår ligger en spärrande, stängbar ruta över vyn som påminner om att avsluta pausen. Stängs den
  // kommer den inte tillbaka förrän nästa paus; en omladdning av sidan visar den igen.
  const pause = p.playout.currentPause ?? null
  const [reminderDismissed, setReminderDismissed] = useState(false)
  const [pauseDraft, setPauseDraft] = useState('')
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    if (!pause) {
      setReminderDismissed(false)
      return
    }
    setPauseDraft(pause.label)
    setNow(Date.now())
    const timer = window.setInterval(() => setNow(Date.now()), 30_000)
    return () => window.clearInterval(timer)
    // Texten sätts när pausen börjar (och byts av nästa paus), inte vid varje optimistisk byte av händelse-id.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [Boolean(pause)])

  const [expanded, setExpanded] = useState(false)

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
  const testCanStart = !testbed.state.running
    && Boolean(p.agendaId && p.namelistId && agendaResource.data?.items.length && nameListResource.data?.people.length)
  const expectedEndAt = testbed.state.startedAt
    ? new Date(testbed.state.startedAt.getTime() + testbed.state.durationSeconds * 1000).toISOString()
    : null

  const panels: { key: string; label: string; value: string | null; occurredAt: string | null; clearLabel: string; onClear: () => void }[] = [
    { key: 'item', label: 'Aktuell punkt', value: nowItem, occurredAt: currentAgendaEvent?.occurredAt ?? null, clearLabel: 'Rensa ärende i bild', onClear: () => actions.clear('agendaItem') },
    {
      key: 'person',
      label: 'Aktuell talare',
      // Tillfällig talare (exclamation-cue) är momentan och visas i samma ruta
      // istället för en egen — den vinner medan den är aktiv, annars faller
      // vi tillbaka till den ordinarie aktuella talaren.
      value: nowExclamation ?? nowSpeaker,
      occurredAt: nowExclamation ? null : currentPersonEvent?.occurredAt ?? null,
      clearLabel: nowExclamation ? 'Rensa tillfällig talare' : 'Rensa talare i bild',
      onClear: () => actions.clear(nowExclamation ? 'exclamation' : 'person'),
    },
  ]

  return (
    <>
    <div class={`lw${expanded ? ' is-expanded' : ''}`}>
      {phase === 'signalInterrupted' && (
        <div class="lw-interrupt" role="alert">
          <p>Signalavbrott — videosignalen har avbrutits medan spelaren är öppen.</p>
          <button class="btn btn-sm" type="button" onClick={() => void actions.interruptionDecision('wait_for_reconnect')}>
            Invänta återanslutning
          </button>
          <button class="btn btn-danger btn-sm" type="button" onClick={() => void actions.interruptionDecision('end')}>
            Stäng player och avsluta
          </button>
        </div>
      )}

      {isRootAdmin && !expanded && <section class="lw-testbed" aria-label="Testbädd">
        <div>
          <strong>Testbädd</strong>
          {testbed.state.running ? (
            <span>{testbed.state.completedSteps}/{testbed.state.totalSteps} cues · {formatHms(testbed.state.durationSeconds)} · klar cirka {expectedEndAt ? formatLocalTime(expectedEndAt) : '–'}</span>
          ) : (
            <span>20 sekunder per cue · starta i Live-läge</span>
          )}
          {testbed.state.failedSteps > 0 && <small>{testbed.state.failedSteps} cue-fel, testet fortsätter</small>}
        </div>
        {testbed.state.running ? (
          <button class="btn btn-danger btn-sm" type="button" onClick={testbed.stop}>STOP TEST</button>
        ) : (
          <button class="btn btn-sm" type="button" disabled={!testCanStart} onClick={() => void testbed.start()}>START TEST</button>
        )}
        {testbed.state.totalSteps > 0 && !testbed.state.running && (
          <output>{formatHms(testbed.state.durationSeconds)}</output>
        )}
      </section>}

      <div class="lw-now">
        {panels.map((panel) => (
          <NowPanel
            key={panel.key}
            label={panel.label}
            value={panel.value}
            occurredAt={panel.occurredAt}
            clearLabel={panel.clearLabel}
            onClear={panel.onClear}
          />
        ))}
        <button
          class="lw-expand"
          type="button"
          aria-pressed={expanded}
          aria-label={expanded ? 'Stäng expanderad vy' : 'Expandera'}
          title={expanded ? 'Stäng expanderad vy' : 'Expandera listorna till hela fönstret'}
          onClick={() => setExpanded((value) => !value)}
        >
          <Icon name={expanded ? 'close' : 'open_in_full'} size={20} />
        </button>
      </div>

      <PlayoutColumns project={p} actions={actions} live />
    </div>
    {pause && !reminderDismissed && (
      <Modal
        title="Paus pågår"
        subtitle={`Pausad sedan ${formatLocalTime(pause.occurredAt)} (${pauseDurationText(pause.occurredAt, now)}). Tittarna ser texten nedan över videon.`}
        onClose={() => setReminderDismissed(true)}
        footer={
          <>
            <button class="btn btn-sm" type="button" onClick={() => setReminderDismissed(true)}>Stäng</button>
            <button class="btn btn-sm" type="button" disabled={pauseDraft.trim() === pause.label || pauseDraft.trim() === ''} onClick={() => actions.pause(pauseDraft)}>Uppdatera texten</button>
            <button class="btn btn-sm btn-primary" type="button" onClick={() => actions.resume()}>Avsluta paus</button>
          </>
        }
      >
        <p class="pause-reminder-note">
          Pausen avslutas också när du spelar ut en punkt eller ett namn. Stänger du den här rutan fortsätter pausen tills du avslutar den.
        </p>
        <textarea
          class="pause-dialog-text"
          rows={3}
          maxLength={MAX_PAUSE_TEXT_LENGTH}
          aria-label="Text som visas i spelaren"
          value={pauseDraft}
          onInput={(event) => setPauseDraft(event.currentTarget.value)}
        />
      </Modal>
    )}
    </>
  )
}

interface NowPanelProps {
  label: string
  value: string | null
  occurredAt: string | null
  clearLabel: string
  onClear: () => void
}

// Rutan har fast storlek från start — den får aldrig ändras när något spelas ut eller rensas, annars hoppar
// listorna under och operatören riskerar att klicka fel. Därför är layouten alltid densamma: etikett, två
// rader text (längre kläms med "…", hela texten finns som tooltip), en tidsrad och en plats för ✕-knappen.
// Tidsraden och knappen är kvar men osynliga när inget är aktivt, så ingenting i rutan visas/döljs på ett
// sätt som påverkar höjden. Höjderna sätts i LiveWorkspace.css.
function NowPanel({ label, value, occurredAt, clearLabel, onClear }: NowPanelProps) {
  return (
    <div class={`lw-now-panel${value ? ' is-active' : ''}`}>
      <span class="lw-now-label">{label}</span>
      <span class="lw-now-value">
        <span class="lw-now-text">
          <span class="lw-now-title" title={value ?? undefined}>{value ?? '–'}</span>
          <small class="lw-now-time">{occurredAt ? formatLocalTime(occurredAt) : ''}</small>
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
