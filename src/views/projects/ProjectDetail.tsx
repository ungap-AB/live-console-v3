import { useEffect, useState } from 'preact/hooks'
import { client } from '../../data'
import type { Project, Recording, RecordingState } from '../../data/types'
import { useResource } from '../../app/useResource'
import { StatusChip, type ChipTone } from '../../components/StatusChip'
import { CopyField } from '../../components/CopyField'
import { VideoLightbox } from '../../components/VideoLightbox'
import { ConfirmModal } from '../../components/ConfirmModal'
import { RenameModal } from '../../components/RenameModal'
import { AttachedListPicker } from '../../components/AttachedListPicker'
import { EditIcon, DeleteIcon, PlayIcon } from '../../components/icons'
import type { ProjectActions } from './actions'
import { formatDateTime, formatHms } from '../../app/time'
import { useTick } from './useTick'
import { useLiveChannel } from './useLiveChannel'
import { phaseMeta } from './livePhase'
import { TrimDialog } from '../archive/TrimDialog'
import { resolveOriginalRecordingForTrim } from './openTrimDialog'
import './ProjectDetail.css'

interface ProjectDetailProps {
  project: Project
  onDelete: () => void
  onDeleteBlocked: (reason: string) => void
  actions: ProjectActions
  onOpenAgenda: (id: string) => void
  onOpenNameList: (id: string) => void
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

// "16 sep 2026 kl 19:00" — egen formatering (inte den delade formatDateTime,
// som ger "16 sep. 2026 12:37" och används på flera andra ställen redan).
function formatCreatedAt(iso: string): string {
  const d = new Date(iso)
  const date = d.toLocaleDateString('sv-SE', { day: 'numeric', month: 'short', year: 'numeric' }).replace('.', '')
  const time = d.toLocaleTimeString('sv-SE', { hour: '2-digit', minute: '2-digit' })
  return `${date} kl ${time}`
}

const ODM_META: Record<RecordingState, { label: string; tone: ChipTone }> = {
  none: { label: 'Ingen inspelning', tone: 'neutral' },
  recording: { label: 'Spelas in', tone: 'neutral' },
  processing: { label: 'Bearbetas', tone: 'warn' },
  recorded: { label: 'Ej publicerad', tone: 'neutral' },
  trimmed: { label: 'Granskas', tone: 'warn' },
  published: { label: 'Publicerad', tone: 'accent' },
}

function initialTab(project: Project): 'live' | 'odm' {
  return project.onDemandLocked || project.publication.state !== 'none' || project.recording?.state === 'trimmed' || project.recording?.state === 'published'
    ? 'odm'
    : 'live'
}

export function ProjectDetail({ project: p, onDelete, onDeleteBlocked, actions, onOpenAgenda, onOpenNameList }: ProjectDetailProps) {
  const { channel, health, streamKey, refresh, stopPolling } = useLiveChannel(p.channel?.id ?? null)
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
  const [sourceRecording, setSourceRecording] = useState<Recording | null>(null)
  const [sessionVideo, setSessionVideo] = useState<{ name: string; hlsUrl: string } | null>(null)
  const [confirmReturnToLive, setConfirmReturnToLive] = useState(false)
  const [renaming, setRenaming] = useState(false)

  const agendaResource = useResource(
    () => (p.agendaId ? client.agendas.get(p.agendaId) : Promise.resolve(undefined)),
    [p.agendaId],
  )
  const nameListResource = useResource(
    () => (p.namelistId ? client.namelists.get(p.namelistId) : Promise.resolve(undefined)),
    [p.namelistId],
  )
  const allAgendasResource = useResource(() => client.agendas.list(), [])
  const allNameListsResource = useResource(() => client.namelists.list(), [])

  async function createAndAttachAgenda() {
    const created = await client.agendas.create({ name: p.name, description: 'Utkast' })
    actions.setAgenda(created.id)
    allAgendasResource.reload()
  }

  async function createAndAttachNameList() {
    const created = await client.namelists.create({ name: p.name, description: 'Utkast' })
    actions.setNameList(created.id)
    allNameListsResource.reload()
  }

  useEffect(() => {
    setTab(initialTab(p))
    setShowVideo(false)
    setTrimming(null)
    setSourceRecording(null)
    setSessionVideo(null)
    setConfirmReturnToLive(false)
    setRenaming(false)
  }, [p.id])

  useEffect(() => {
    let cancelled = false
    if (!p.recording || p.recording.state === 'recording' || p.recording.state === 'processing') {
      setSourceRecording(null)
      return
    }
    client.recordings.get(p.recording.id).then(async (recording) => {
      if (!recording) return
      const original = recording.kind === 'trimmed' && recording.parentId
        ? await client.recordings.get(recording.parentId)
        : recording
      if (!cancelled) setSourceRecording(original ?? null)
    })
    return () => {
      cancelled = true
    }
  }, [p.recording?.id])

  useEffect(() => {
    if (phase === 'streamEnded' && p.recording?.state === 'recording') {
      void actions.refreshProject()
    }
  }, [phase, p.recording?.state])

  const hasIngest = !!p.channel
  const rec = p.recording?.state ?? 'none'
  const pub = p.visibility === 'open'
  const canDelete = !pub && p.capabilities.teardownChannel.status === 'allowed'
  const deleteBlockedReason = pub
    ? 'Stäng projektet innan det raderas'
    : live
      ? 'Går inte att radera medan signal tas emot'
      : null
  const canTrim = p.capabilities.trimRecording.status === 'allowed'
  const canPublish = p.capabilities.publishVod.status === 'allowed'
  const elapsed = recordedSeconds(p)
  const liveElapsed = liveElapsedSeconds(health?.streamStartedAt)
  const status = hasIngest ? phaseMeta(phase) : { label: 'Ingen ingest', tone: 'neutral' as ChipTone }

  const subtitle = live
    ? `Projekt (${p.id}) · sänder sedan ${health?.streamStartedAt ? formatDateTime(health.streamStartedAt) : ''}`
    : p.publication.state === 'published'
      ? `Projekt (${p.id}) · publicerad som ondemand`
      : `Projekt (${p.id}) skapat ${formatCreatedAt(p.createdAt)}`

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
    odmNote = 'Trimmad. Publicera inspelningen när du är klar — materialet är ännu inte publikt.'
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
    const original = await resolveOriginalRecordingForTrim(p.recording.id)
    if (original) setTrimming(original)
  }

  async function saveTrim(range: { startOffsetSeconds: number; endOffsetSeconds: number; sessionId?: string }): Promise<void> {
    if (await actions.trim(range)) {
      await actions.refreshProject()
      await refresh()
      setTrimming(null)
    }
  }

  return (
    <>
      <div class="panel-head">
        <div class="title-row">
          <div class="title">
            {p.name}
            <button
              class="ib"
              type="button"
              title="Byt namn på projektet"
              aria-label="Byt namn på projektet"
              onClick={() => setRenaming(true)}
            >
              <EditIcon />
            </button>
            <span class="subtitle">{subtitle}</span>
          </div>
          <button
            class={`ib del${canDelete ? '' : ' is-blocked'}`}
            type="button"
            title={deleteBlockedReason ?? 'Radera projekt'}
            aria-label="Radera projekt"
            onClick={() => (deleteBlockedReason ? onDeleteBlocked(deleteBlockedReason) : onDelete())}
          >
            <DeleteIcon />
          </button>
        </div>
        <div class="panel-head-row">
          <div class="field field-grow">
            <label>Spelarlänk</label>
            <CopyField value={p.playerUrl} monospace />
          </div>
          <div class="field">
            <label>Synlighet</label>
            <div class="seg">
              <button
                type="button"
                aria-pressed={p.visibility === 'open'}
                onClick={() => actions.setVisibility('open')}
              >
                Öppen för publik
              </button>
              <button
                type="button"
                class="closed"
                aria-pressed={p.visibility === 'closed'}
                onClick={() => actions.setVisibility('closed')}
              >
                Stängd för publik
              </button>
            </div>
          </div>
          <div class="field">
            <label>Dagordning</label>
            <div class="attached-list">
              <span class="attached-list-name">{agendaResource.data?.name ?? 'Ingen kopplad'}</span>
              {p.agendaId && (
                <button class="btn btn-sm" type="button" onClick={() => onOpenAgenda(p.agendaId!)}>
                  Öppna...
                </button>
              )}
              <AttachedListPicker
                currentId={p.agendaId}
                items={(allAgendasResource.data ?? []).map((a) => ({ id: a.id, name: a.name }))}
                pickerTitle="Byt dagordning"
                createNewLabel="Ny dagordning"
                onPick={(id) => actions.setAgenda(id)}
                onCreateNew={createAndAttachAgenda}
                buttonLabel="Välj..."
              />
            </div>
          </div>
          <div class="field">
            <label>Namnlista</label>
            <div class="attached-list">
              <span class="attached-list-name">{nameListResource.data?.name ?? 'Ingen kopplad'}</span>
              {p.namelistId && (
                <button class="btn btn-sm" type="button" onClick={() => onOpenNameList(p.namelistId!)}>
                  Öppna...
                </button>
              )}
              <AttachedListPicker
                currentId={p.namelistId}
                items={(allNameListsResource.data ?? []).map((n) => ({ id: n.id, name: n.name }))}
                pickerTitle="Byt namnlista"
                createNewLabel="Ny namnlista"
                onPick={(id) => actions.setNameList(id)}
                onCreateNew={createAndAttachNameList}
                buttonLabel="Välj..."
              />
            </div>
          </div>
        </div>
      </div>

      {renaming && (
        <RenameModal
          title="Byt namn på projektet"
          initialValue={p.name}
          onCancel={() => setRenaming(false)}
          onSave={async (name) => {
            await actions.rename(name)
            setRenaming(false)
          }}
        />
      )}

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
              onClick={() => {
                // Stoppa pollningen istället för att refresh:a — kanalen är
                // borta direkt efter teardown, en efterföljande hälsokoll
                // mot samma id 404:ar bara i onödan (se minnesanteckningen
                // om useLiveChannel.refresh-racet, 2026-09-16/18).
                stopPolling()
                void actions.teardownChannel()
              }}
            >
              Riv ingest
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
          {/* .resource är nu en enkel stapel (se ProjectDetail.css) — Inkommande
              signal ligger under HLS-URL istället för bredvid i en egen kolumn. */}
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
              disabled={!canTrim}
              title={
                pub
                  ? 'Stäng projektet först'
                  : live
                    ? 'Tillgänglig först när enkodern slutat sända'
                    : rec === 'processing'
                      ? 'Inspelningen bearbetas fortfarande'
                      : undefined
              }
              onClick={() => void openTrimDialog()}
            >
              Trimma inspelning
            </button>
            <button
              class="btn btn-primary"
              type="button"
              disabled={!canPublish}
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
                value={p.recording?.hlsUrl ?? null}
                placeholder="Tillgänglig efter trimning"
                monospace
              />
            </div>
          </div>
          {sourceRecording?.sessions && sourceRecording.sessions.length > 0 && (
            <div class="recording-sessions">
              <h4>IVS-inspelningar för kanalen</h4>
              <ul>
                {sourceRecording.sessions.map((session) => (
                  <li key={session.id}>
                    <span>{formatDateTime(session.startedAt)}</span>
                    <span>{formatHms(session.durationSeconds)}</span>
                    <button
                      class="play"
                      type="button"
                      title="Spela inspelning"
                      aria-label="Spela inspelning"
                      disabled={!session.hlsUrl}
                      onClick={() => session.hlsUrl && setSessionVideo({ name: `${p.name} · ${formatDateTime(session.startedAt)}`, hlsUrl: session.hlsUrl })}
                    >
                      <PlayIcon />
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          )}
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

      {sessionVideo && (
        <VideoLightbox title={sessionVideo.name} src={sessionVideo.hlsUrl} onClose={() => setSessionVideo(null)} />
      )}

      {trimming && (
        <TrimDialog
          recording={trimming}
          onCancel={() => setTrimming(null)}
          onSave={saveTrim}
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
