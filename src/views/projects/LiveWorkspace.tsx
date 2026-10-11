import type { ComponentChildren } from 'preact'
import { useEffect, useState } from 'preact/hooks'
import { client } from '../../data'
import type { Channel, ChannelHealth, Project, TimelineEvent } from '../../data/types'
import { useIsRootAdmin } from '../../app/currentUserContext'
import { useResource } from '../../app/useResource'
import { formatHms, formatLocalTime } from '../../app/time'
import type { ProjectActions } from './actions'
import { OverviewShell } from './OverviewShell'
import { PlayoutColumns } from './PlayoutColumns'
import { PlayoutOverlay, type PlayoutAddress } from './PlayoutOverlay'
import { useModeChange } from './useModeChange'
import { usePlayoutTestbed } from './playoutTestbed'
import { useNameList } from './useNameList'
import { Icon } from '../../components/Icon'
import { Modal } from '../../components/Modal'
import { Clock } from '../../components/Clock'
import { ModeSelector } from './ModeSelector'
import { EncoderStatusChip, ViewersChip } from './LiveStatusBadges'
import { encoderStatusOf, viewerCountOf } from './liveStatus'
import { MAX_PAUSE_TEXT_LENGTH, pauseDurationText } from './pauseLogic'
import './LiveWorkspace.css'

interface LiveWorkspaceProps {
  /** Projektets rubrik (ProjectHeader), överst i översiktsskalet. */
  header: ComponentChildren
  project: Project
  actions: ProjectActions
  channel: Channel | null
  health: ChannelHealth | null
  /** Utspelningsvyns adress, delad med Before (se Livesandning). */
  playout: PlayoutAddress
}

// Läget Live. UNG-269: översikt till vänster (status, signal, tittare, det som är utspelat nu, Spela ut kapitel och Avsluta sändning),
// spelaren till höger med samma länk som tittarna; utspelningen sker i den överlagrade arbetsvyn, som ersätter det expanderade läget
// (UNG-129/179) och öppnas bara med knappen.
export function LiveWorkspace({ header, project: p, actions, channel, health, playout }: LiveWorkspaceProps) {
  const testbed = usePlayoutTestbed(p, actions)
  // Testbädden är ett verktyg för oss (root admin), inte för operatörer.
  const isRootAdmin = useIsRootAdmin()
  const agendaResource = useResource(
    () => (p.agendaId ? client.agendas.get(p.agendaId) : Promise.resolve(undefined)),
    [p.agendaId],
  )
  const nameListResource = useNameList(p)
  const { selectMode, dialog: modeDialog } = useModeChange(p, actions)
  const phase = health?.livePhase
  const encoderStatus = encoderStatusOf({ hasChannel: Boolean(channel), publicMode: p.publicMode, livePhase: health?.livePhase, healthState: health?.state })
  const viewerCount = viewerCountOf(health)

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

  // Signalavbrottet visas både i översikten och i utspelningsvyn, som täcker översikten.
  const interrupt = phase === 'signalInterrupted' && (
    <div class="lw-interrupt" role="alert">
      <p>Signalavbrott — videosignalen har avbrutits medan spelaren är öppen.</p>
      <button class="btn btn-sm" type="button" onClick={() => void actions.interruptionDecision('wait_for_reconnect')}>
        Invänta återanslutning
      </button>
      <button class="btn btn-danger btn-sm" type="button" onClick={() => void actions.interruptionDecision('end')}>
        Stäng player och avsluta
      </button>
    </div>
  )

  const nowPanels = (showTime: boolean) => (
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

  const signalDetails = health?.state === 'live'
    ? [health.resolution, health.framerate ? `${Math.round(health.framerate)} fps` : null, health.bitrateKbps ? `${Math.round(health.bitrateKbps)} kbit/s` : null].filter(Boolean).join(' · ')
    : ''

  return (
    <OverviewShell
      header={header}
      player={p.playerUrl ? { url: p.playerUrl, published: true, version: 0 } : null}
      workOpen={playout.open}
      overlays={<>
        {playout.open && (
          <PlayoutOverlay
            projectName={p.name}
            onClose={playout.closePlayout}
            // UNG-179: lägesknapparna (med paus), signalstatus, tittarantal och klockan, så att man kan byta läge och se signalen
            // utan att stänga vyn.
            bar={<>
              <ModeSelector project={p} actions={actions} compact />
              <EncoderStatusChip status={encoderStatus} />
              {viewerCount !== null && <ViewersChip count={viewerCount} />}
              <span class="pv-clock"><Clock /></span>
            </>}
          >
            <div class="lw">
              {interrupt}
              {nowPanels(false)}
              <PlayoutColumns project={p} actions={actions} live />
            </div>
          </PlayoutOverlay>
        )}
        {modeDialog}
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
      </>}
    >
      {interrupt}

      <div class="lw-summary">
        <span class="lw-summary-label">Status</span>
        <strong>{pause ? 'Sänder – paus pågår' : 'Sänder'}</strong>
        {health?.streamStartedAt && <span class="lw-summary-sub">Signal sedan {formatLocalTime(health.streamStartedAt)} · <Elapsed since={health.streamStartedAt} /></span>}
      </div>

      <div class="lw-summary">
        <span class="lw-summary-label">Signal</span>
        <span class="lw-summary-row">
          <EncoderStatusChip status={encoderStatus} />
          {signalDetails && <span class="lw-summary-sub">{signalDetails}</span>}
        </span>
      </div>

      <div class="lw-summary">
        <span class="lw-summary-label">Tittare</span>
        <strong>{viewerCount ?? '–'}</strong>
      </div>

      <div class="lw-actions">
        <button class="btn btn-primary" type="button" onClick={playout.openPlayout}>
          <Icon name="playlist_play" size={18} /> Spela ut kapitel
        </button>
        <button class="btn btn-danger" type="button" onClick={() => selectMode('after')}>
          <Icon name="stop_circle" size={18} /> Avsluta sändning…
        </button>
      </div>

      <div class="lw-summary">
        <span class="lw-summary-label">Utspelat nu</span>
        {nowPanels(true)}
      </div>

      {isRootAdmin && <section class="lw-testbed" aria-label="Testbädd">
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
    </OverviewShell>
  )
}

// Sändningstiden, uppdaterad varje sekund.
function Elapsed({ since }: { since: string }) {
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 1000)
    return () => window.clearInterval(timer)
  }, [])
  return <span class="lw-elapsed">{formatHms(Math.max(0, Math.floor((now - Date.parse(since)) / 1000)))}</span>
}

interface NowPanelProps {
  label: string
  value: string | null
  occurredAt: string | null
  /** Tidsstämpeln visas inte i utspelningsvyn (UNG-179), för att spara höjd. */
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
