import { useEffect, useState } from 'preact/hooks'
import { client } from '../../data'
import type { Project, Recording, RecordingState } from '../../data/types'
import { StatusChip, type ChipTone } from '../../components/StatusChip'
import { CopyField } from '../../components/CopyField'
import { VideoLightbox } from '../../components/VideoLightbox'
import { ConfirmModal } from '../../components/ConfirmModal'
import type { ProjectActions } from './actions'
import { formatDateTime, formatHms } from '../../app/time'
import { useTick } from './useTick'
import { useLiveChannel } from './useLiveChannel'
import { phaseMeta } from './livePhase'
import { TrimDialog } from '../archive/TrimDialog'
import './ProjectDetail.css'

interface ProjectDetailProps {
  project: Project
  onOpenPlayout: () => void
  onDelete: () => void
  actions: ProjectActions
}

// Ondemand-flikens inspelade tid — rör inte, se scope-anteckning i steg-planen
// (project.sim är fortfarande inspelnings-domänens fält tills den städningen
// görs separat).
function recordedSeconds(project: Project): number {
  const base = project.sim.accumulatedSeconds
  if (!project.sim.recordingStartedAt) return base
  return base + (Date.now() - new Date(project.sim.recordingStartedAt).getTime()) / 1000
}

function liveElapsedSeconds(streamStartedAt: string | undefined): number | null {
  if (!streamStartedAt) return null
  return (Date.now() - new Date(streamStartedAt).getTime()) / 1000
}

const ODM_META: Record<RecordingState, { label: string; tone: ChipTone }> = {
  none: { label: 'Ingen inspelning', tone: 'neutral' },
  recording: { label: 'Spelas in', tone: 'neutral' },
  recorded: { label: 'Ej publicerad', tone: 'neutral' },
  trimmed: { label: 'Granskas', tone: 'warn' },
  published: { label: 'Publicerad', tone: 'accent' },
}

function initialTab(project: Project): 'live' | 'odm' {
  return project.onDemandLocked || project.publication.state !== 'none' || project.recording?.state === 'trimmed' || project.recording?.state === 'published'
    ? 'odm'
    : 'live'
}

export function ProjectDetail({ project: p, onOpenPlayout, onDelete, actions }: ProjectDetailProps) {
  const { channel, health, streamKey, refresh } = useLiveChannel(p.channel?.id ?? null)
  const phase = health?.livePhase
  const live = phase === 'live'
  // Signalavbrott räknas som "i bruk" precis som backendens Teardown-spärr
  // (ChannelStore.ApplyAutomaticTransition) — undviker att man kan klicka
  // Riv resurs och bara få ett felmeddelande tillbaka.
  const inUse = live || phase === 'signalInterrupted'
  useTick(live)
  const [tab, setTab] = useState<'live' | 'odm'>(() => initialTab(p))
  const [showVideo, setShowVideo] = useState(false)
  const [trimming, setTrimming] = useState<Recording | null>(null)
  const [confirmReturnToLive, setConfirmReturnToLive] = useState(false)

  useEffect(() => {
    setTab(initialTab(p))
    setShowVideo(false)
    setTrimming(null)
    setConfirmReturnToLive(false)
  }, [p.id])

  useEffect(() => {
    if (phase === 'streamEnded' && p.recording?.state === 'recording') {
      void actions.refreshProject()
    }
  }, [phase, p.recording?.state])

  const hasIngest = !!p.channel
  const rec = p.recording?.state ?? 'none'
  const pub = p.visibility === 'open'
  const canDelete = !pub && !live
  const canUseOnDemand = !pub && !live
  const elapsed = recordedSeconds(p)
  const liveElapsed = liveElapsedSeconds(health?.streamStartedAt)
  const status = hasIngest ? phaseMeta(phase) : { label: 'Ingen resurs', tone: 'neutral' as ChipTone }

  const subtitle = live
    ? `Projekt · sänder sedan ${health?.streamStartedAt ? formatDateTime(health.streamStartedAt) : ''}`
    : p.publication.state === 'published'
      ? 'Projekt · publicerad som ondemand'
      : `Projekt · skapad ${formatDateTime(p.createdAt)}`

  let liveNote = ''
  if (live) liveNote = 'Riv resurs är låst medan signal tas emot. Stoppa enkodern först.'
  else if (phase === 'signalInterrupted')
    liveNote =
      'Enkodern har slutat sända. Det kan vara en tillfällig störning — resursen ligger kvar tills du river den.'
  else if (phase === 'streamEnded') liveNote = 'Sändningen är avslutad. Starta enkodern igen eller arbeta vidare i Ondemand.'
  else if (hasIngest) liveNote = 'Resursen är allokerad och väntar på signal.'

  let odmNote = ''
  if (pub) odmNote = 'Stäng projektet innan ondemand-funktionerna blir tillgängliga.'
  else if (live) odmNote = 'Stoppa enkodern innan ondemand-funktionerna blir tillgängliga.'
  else if (rec === 'recording') odmNote = 'Trimning blir tillgänglig när enkodern slutat sända.'
  else if (rec === 'none') odmNote = 'Ingen inspelning finns ännu.'
  else if (rec === 'recorded')
    odmNote = `Inspelningen är klar (${formatHms(elapsed)}). Trimma den innan du publicerar.`
  else if (rec === 'trimmed')
    odmNote = 'Trimmad. Dela granskningslänken för godkännande — materialet är ännu inte publikt.'
  else odmNote = pub ? 'Publicerad och öppen för publik. Kapitellistan är fryst.' : 'Publicerad men stängd för publik.'
  if (p.sim.segments > 1 && rec !== 'recording' && rec !== 'none') {
    odmNote += ` Inspelningen har ${p.sim.segments - 1} glapp — kontrollera kapitlens offset efter trimning.`
  }

  async function selectTab(next: 'live' | 'odm') {
    if (next === 'live' && tab === 'odm' && p.onDemandLocked) {
      setConfirmReturnToLive(true)
      return
    }
    setTab(next)
  }

  async function returnToLive() {
    await actions.returnToLive()
    setConfirmReturnToLive(false)
    setTab('live')
  }

  async function openTrimDialog() {
    if (!p.recording) return
    const recording = await client.recordings.get(p.recording.id)
    if (!recording) return
    const original = recording.kind === 'trimmed' && recording.parentId
      ? await client.recordings.get(recording.parentId)
      : recording
    if (original) setTrimming(original)
  }

  async function saveTrim(range: { startOffsetSeconds: number; endOffsetSeconds: number }) {
    await actions.trim(range)
    setTrimming(null)
  }

  return (
    <>
      <div class="panel-head">
        <div class="title">
          {p.name}
          <span>{subtitle}</span>
        </div>
        <div class="panel-head-row">
          <div class="field field-grow">
            <label>Spelarlänk</label>
            <CopyField value={p.playerUrl} monospace />
          </div>
          <div class="field">
            <label>Publik</label>
            <div class="seg">
              <button
                type="button"
                aria-pressed={p.visibility === 'open'}
                onClick={() => actions.setVisibility('open')}
              >
                Öppen
              </button>
              <button
                type="button"
                class="closed"
                aria-pressed={p.visibility === 'closed'}
                onClick={() => actions.setVisibility('closed')}
              >
                Stängd
              </button>
            </div>
          </div>
          <button class="btn btn-primary" type="button" onClick={onOpenPlayout}>
            Öppna playout
          </button>
          <button
            class="btn btn-danger"
            type="button"
            disabled={!canDelete}
            title={pub ? 'Stäng projektet innan det raderas' : live ? 'Går inte att radera medan signal tas emot' : undefined}
            onClick={onDelete}
          >
            Radera projekt
          </button>
        </div>
      </div>

      <div class="tabs" role="tablist">
        <button role="tab" type="button" aria-selected={tab === 'live'} onClick={() => void selectTab('live')}>
          Live
        </button>
        <button role="tab" type="button" aria-selected={tab === 'odm'} onClick={() => void selectTab('odm')}>
          Ondemand
        </button>
      </div>

      {tab === 'live' && (
        <div class="tabpanel">
          <div class="actions">
            <StatusChip tone={status.tone} dot>
              {status.label}
            </StatusChip>
            <span class="sep" />
            <button
              class="btn"
              type="button"
              disabled={hasIngest}
              onClick={() => actions.createChannel().then(refresh)}
            >
              Skapa ingest
            </button>
            <button
              class="btn btn-danger"
              type="button"
              disabled={!hasIngest || inUse}
              title={inUse ? 'Går inte att riva medan signal tas emot' : undefined}
              onClick={() => actions.teardownChannel().then(refresh)}
            >
              Riv resurs
            </button>
            <button
              class="btn btn-sm"
              type="button"
              disabled={!channel?.playbackUrl}
              onClick={() => setShowVideo(true)}
            >
              Visa livesändning
            </button>
          </div>
          <div class="resource">
            <div class="rowset">
              <div class="field">
                <label>Ingest-server</label>
                <CopyField value={channel?.ingestEndpoint ?? null} placeholder="Skapa ingest först" monospace />
              </div>
              <div class="field">
                <label>Stream key</label>
                <CopyField value={streamKey} mask monospace />
              </div>
              <div class="field">
                <label>HLS-URL</label>
                <CopyField value={channel?.playbackUrl ?? null} monospace />
              </div>
            </div>
            <div class="health">
              <h4>Inkommande signal</h4>
              {live ? (
                <dl>
                  <dt>Bitrate</dt>
                  <dd>{(health?.bitrateKbps ?? 0).toLocaleString('sv-SE')} kbps</dd>
                  <dt>Upplösning</dt>
                  <dd>{health?.resolution ?? ''}</dd>
                  <dt>Senaste bild</dt>
                  <dd>{(health?.lastFrameSecondsAgo ?? 0).toLocaleString('sv-SE')} s sedan</dd>
                  <dt>Sänder sedan</dt>
                  <dd>{liveElapsed !== null ? formatHms(liveElapsed) : ''}</dd>
                </dl>
              ) : (
                <p>
                  {phase === 'signalInterrupted'
                    ? 'Signalavbrott — väntar på återanslutning.'
                    : phase === 'streamEnded'
                      ? 'Sändningen är avslutad.'
                      : hasIngest
                        ? 'Ingen signal. Starta enkodern.'
                        : 'Ingen live-resurs allokerad.'}
                </p>
              )}
            </div>
          </div>
          {liveNote && <div class={`note ${inUse ? 'warn' : ''}`}>{liveNote}</div>}

          <div class="debugbar">
            <span class="debugbar-label">Debug</span>
            <button
              class="btn btn-sm"
              type="button"
              disabled={!hasIngest || inUse}
              onClick={() => actions.setEncoderSending(true).then(refresh)}
            >
              Simulera signal start
            </button>
            <button
              class="btn btn-sm"
              type="button"
              disabled={!hasIngest || !inUse}
              onClick={() => actions.setEncoderSending(false).then(refresh)}
            >
              Simulera signal stopp
            </button>
            <span class="spacer" />
            <button class="btn btn-sm btn-danger" type="button" onClick={() => actions.reset().then(refresh)}>
              Återställ allt
            </button>
          </div>
        </div>
      )}

      {tab === 'odm' && (
        <div class="tabpanel">
          <div class="actions">
            <StatusChip tone={ODM_META[rec].tone} dot>
              {rec === 'recording' ? 'Spelas in' : ODM_META[rec].label}
            </StatusChip>
            <span class="sep" />
            <button
              class="btn"
              type="button"
              disabled={!canUseOnDemand || !(rec === 'recorded' || rec === 'trimmed')}
              title={pub ? 'Stäng projektet först' : live ? 'Tillgänglig först när enkodern slutat sända' : undefined}
              onClick={() => void openTrimDialog()}
            >
              Trimma inspelning
            </button>
            <button
              class="btn btn-primary"
              type="button"
              disabled={!canUseOnDemand || rec !== 'trimmed'}
              title={pub ? 'Stäng projektet först' : live ? 'Tillgänglig först när enkodern slutat sända' : rec !== 'trimmed' ? 'Trimma inspelningen först' : undefined}
              onClick={actions.publish}
            >
              Publicera
            </button>
            {p.publication.state === 'published' && (
              <button class="btn btn-sm" type="button" disabled={!p.recording?.hlsUrl} onClick={() => setShowVideo(true)}>
                Visa inspelning
              </button>
            )}
          </div>
          <div class="rowset" style={{ maxWidth: '660px' }}>
            <div class="field">
              <label>HLS-URL</label>
              <CopyField
                value={p.publication.state === 'published' ? (p.recording?.hlsUrl ?? null) : null}
                placeholder="Tillgänglig efter publicering"
                monospace
              />
            </div>
          </div>
          {odmNote && (
            <div class={`note ${p.sim.segments > 1 || rec === 'trimmed' ? 'warn' : ''}`}>{odmNote}</div>
          )}
        </div>
      )}

      {showVideo && (
        <VideoLightbox
          title={p.name}
          src={tab === 'live' ? (channel?.playbackUrl ?? '') : (p.recording?.hlsUrl ?? '')}
          live={tab === 'live'}
          onClose={() => setShowVideo(false)}
        />
      )}

      {trimming && (
        <TrimDialog
          recording={trimming}
          onCancel={() => setTrimming(null)}
          onSave={(range) => void saveTrim(range)}
        />
      )}

      {confirmReturnToLive && (
        <ConfirmModal
          title="Gå tillbaka till live?"
          confirmLabel="Gå till live"
          danger
          onCancel={() => setConfirmReturnToLive(false)}
          onConfirm={() => void returnToLive()}
        >
          <p>
            Den kopplade ondemand-versionen kopplas bort och publiken kan inte längre se den. För att
            sända igen behöver du skapa en ny ingest-resurs och använda en ny stream key i enkodern.
          </p>
        </ConfirmModal>
      )}
    </>
  )
}
