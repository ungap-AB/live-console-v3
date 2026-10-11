import type { ComponentChildren } from 'preact'
import { useEffect, useState } from 'preact/hooks'
import { client } from '../../data'
import type { Channel, ChannelHealth, ForkResult, Project } from '../../data/types'
import { useIsRootAdmin } from '../../app/currentUserContext'
import { useResource } from '../../app/useResource'
import { formatHms, formatLocalTime } from '../../app/time'
import type { ProjectActions } from './actions'
import { ForkButton } from './ForkButton'
import { OverviewShell } from './OverviewShell'
import { type PlayoutAddress } from './PlayoutOverlay'
import { NowPanels, SignalInterrupt } from './PlayoutWorkOverlay'
import { usePlayoutTestbed } from './playoutTestbed'
import { useNameList } from './useNameList'
import { Icon } from '../../components/Icon'
import { Modal } from '../../components/Modal'
import { ModeSelector } from './ModeSelector'
import { MAX_PAUSE_TEXT_LENGTH, pauseDurationText } from './pauseLogic'
import { PlayerSettingsDialog, type PlayerSettingsCategory } from './PlayerSettingsDialog'
import './LiveWorkspace.css'

interface LiveWorkspaceProps {
  /** Projektets rubrik (ProjectHeader), överst i översiktsskalet. */
  header: ComponentChildren
  project: Project
  actions: ProjectActions
  channel: Channel | null
  health: ChannelHealth | null
  /** Utspelningsvyns adress, delad med Before (se Livesandning); vyn själv ligger i Livesandning. */
  playout: PlayoutAddress
  streamKey: string | null
  /** UNG-198: anropas när ett projekt skapats ur det här. Saknas den visas inte knappen Fork. */
  onForked?: (result: ForkResult) => void
}

// Läget Live. UNG-269: översikt till vänster (lägesknapparna, signalens detaljer, det som är utspelat nu med Spela ut kapitel under och
// övriga knappar längst ner), spelaren till höger med samma länk som tittarna; utspelningen sker i den överlagrade arbetsvyn, som
// ersätter det expanderade läget (UNG-129/179) och öppnas bara med knappen. Sändningen avslutas med lägesknappen After.
export function LiveWorkspace({ header, project: p, actions, channel, health, playout, streamKey, onForked }: LiveWorkspaceProps) {
  const testbed = usePlayoutTestbed(p, actions)
  // Testbädden är ett verktyg för oss (root admin), inte för operatörer.
  const isRootAdmin = useIsRootAdmin()
  const agendaResource = useResource(
    () => (p.agendaId ? client.agendas.get(p.agendaId) : Promise.resolve(undefined)),
    [p.agendaId],
  )
  const nameListResource = useNameList(p)
  // Spelarinställningarna och fliken de öppnas på (Ingest info öppnar fliken Ingest).
  const [playerSettings, setPlayerSettings] = useState<PlayerSettingsCategory | null>(null)
  const phase = health?.livePhase

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

  const testCanStart = !testbed.state.running
    && Boolean(p.agendaId && p.namelistId && agendaResource.data?.items.length && nameListResource.data?.people.length)
  const expectedEndAt = testbed.state.startedAt
    ? new Date(testbed.state.startedAt.getTime() + testbed.state.durationSeconds * 1000).toISOString()
    : null

  const signalDetails = health?.state === 'live'
    ? [health.resolution, health.framerate ? `${Math.round(health.framerate)} fps` : null, health.bitrateKbps ? `${Math.round(health.bitrateKbps)} kbit/s` : null].filter(Boolean).join(' · ')
    : ''

  return (
    <OverviewShell
      projectId={p.id}
      header={header}
      modes={<ModeSelector project={p} actions={actions} />}
      player={p.playerUrl ? { url: p.playerUrl, version: 0 } : null}
      workOpen={playout.open}
      overlays={<>
        {playerSettings && (
          <PlayerSettingsDialog
            project={p}
            actions={actions}
            liveHlsUrl={channel?.playbackUrl ?? null}
            ingest={channel ? { channel, streamKey, onTeardown: () => actions.teardownChannel() } : null}
            initialCategory={playerSettings}
            onClose={() => setPlayerSettings(null)}
          />
        )}
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
      {phase === 'signalInterrupted' && <SignalInterrupt actions={actions} />}

      {/* Sändningsläget och signalchippet står i rubriken; här bara sedan när och signalens detaljer. */}
      {(health?.streamStartedAt || signalDetails) && (
        <div class="lw-summary">
          {health?.streamStartedAt && <span class="lw-summary-sub">Signal sedan {formatLocalTime(health.streamStartedAt)} · <Elapsed since={health.streamStartedAt} /></span>}
          {signalDetails && <span class="lw-summary-sub">{signalDetails}</span>}
        </div>
      )}

      <div class="lw-summary">
        <span class="lw-summary-label">Utspelat nu</span>
        <NowPanels project={p} actions={actions} showTime={false} />
      </div>

      <button class="btn btn-primary ovs-wide" type="button" onClick={playout.openPlayout}>
        <Icon name="playlist_play" size={18} /> Spela ut kapitel
      </button>

      {isRootAdmin && <section class="lw-testbed" aria-label="Testbädd">
        <div>
          <strong>Testbädd</strong>
          {testbed.state.running ? (
            <span>{testbed.state.completedSteps}/{testbed.state.totalSteps} cues · {formatHms(testbed.state.durationSeconds)} · klar cirka {expectedEndAt ? formatLocalTime(expectedEndAt) : '–'}</span>
          ) : null}
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

      <div class="ovs-bottom lw-bottom">
        <div class="lw-actions">
          <button class="btn" type="button" onClick={() => setPlayerSettings('link')}>
            <Icon name="settings" size={18} /> Spelarinställningar…
          </button>
          <button class="btn" type="button" disabled={!channel} onClick={() => setPlayerSettings('ingest')}>
            <Icon name="info" size={18} /> Ingest info
          </button>
          {onForked && <ForkButton project={p} livePhase={health?.livePhase} onForked={onForked} />}
        </div>
      </div>
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
