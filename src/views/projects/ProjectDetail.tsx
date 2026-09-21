import { useEffect, useState } from 'preact/hooks'
import { client } from '../../data'
import type { Project, PublicMode, Recording, RecordingState } from '../../data/types'
import { useResource } from '../../app/useResource'
import { StatusChip, type ChipTone } from '../../components/StatusChip'
import { CopyField } from '../../components/CopyField'
import { FieldBlock } from '../../components/FieldBlock'
import { OverflowMenu } from '../../components/OverflowMenu'
import { StatusCard } from '../../components/StatusCard'
import { VideoLightbox } from '../../components/VideoLightbox'
import { ConfirmModal } from '../../components/ConfirmModal'
import { Modal } from '../../components/Modal'
import { RenameModal } from '../../components/RenameModal'
import { AttachedListPicker } from '../../components/AttachedListPicker'
import { EditIcon, PlayIcon, SwapIcon, UnlinkIcon } from '../../components/icons'
import type { ProjectActions } from './actions'
import { formatDateTime, formatHms } from '../../app/time'
import { useTick } from './useTick'
import { useLiveChannel } from './useLiveChannel'
import { phaseMeta } from './livePhase'
import { TrimDialog } from '../archive/TrimDialog'
import { MeetingBindingModal } from './MeetingBindingModal'
import { resolveOriginalRecordingForTrim } from './openTrimDialog'
import { ApiError } from '../../data/http/fetchJson'
import './ProjectDetail.css'

interface ProjectDetailProps {
  project: Project
  meetingDomain: string
  onDelete: () => void
  onDeleteBlocked: (reason: string) => void
  actions: ProjectActions
  onOpenAgenda: (id: string) => void
  onOpenNameList: (id: string) => void
  onOpenPlayout: () => void
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

function publicModeTab(publicMode: Project['publicMode']): 'live' | 'odm' {
  return publicMode === 'after' || publicMode === 'ondemand' ? 'odm' : 'live'
}

export function ProjectDetail({ project: p, meetingDomain, onDelete, onDeleteBlocked, actions, onOpenAgenda, onOpenNameList, onOpenPlayout }: ProjectDetailProps) {
  const { channel, health, streamKey, refresh, stopPolling } = useLiveChannel(p.channel?.id ?? null)
  const phase = health?.livePhase
  const live = phase === 'live'
  // Signalavbrott räknas som "i bruk" precis som backendens Teardown-spärr
  // (ChannelStore.ApplyAutomaticTransition) — undviker att man kan klicka
  // Riv resurs och bara få ett felmeddelande tillbaka.
  const inUse = live || phase === 'signalInterrupted'
  useTick(live)
  const [tab, setTab] = useState<'live' | 'odm'>(() => publicModeTab(p.publicMode))
  const [showVideo, setShowVideo] = useState(false)
  const [trimming, setTrimming] = useState<Recording | null>(null)
  const [sourceRecording, setSourceRecording] = useState<Recording | null>(null)
  const [sessionVideo, setSessionVideo] = useState<{ name: string; hlsUrl: string } | null>(null)
  const [confirmUnpublish, setConfirmUnpublish] = useState<'toLive' | 'fromAction' | null>(null)
  const [pendingPublicMode, setPendingPublicMode] = useState<PublicMode | null>(null)
  const [askIngestTeardown, setAskIngestTeardown] = useState(false)
  const [disconnectingMeeting, setDisconnectingMeeting] = useState(false)
  const [renaming, setRenaming] = useState(false)
  const [editingPublicTexts, setEditingPublicTexts] = useState(false)
  const [publicTextDraft, setPublicTextDraft] = useState({
    beforeText: p.beforeText,
    liveText: p.liveText,
    afterText: p.afterText,
    ondemandText: p.ondemandText,
  })
  const [showMeetingBinding, setShowMeetingBinding] = useState(false)

  const agendaResource = useResource(
    () => (p.agendaId ? client.agendas.get(p.agendaId) : Promise.resolve(undefined)),
    [p.agendaId],
  )
  const nameListResource = useResource(
    () => (p.namelistId ? client.namelists.get(p.namelistId) : Promise.resolve(undefined)),
    [p.namelistId],
  )
  const meetingResource = useResource(
    () => (p.meetingDomain ? client.meetings.list(p.meetingDomain) : Promise.resolve([])),
    [p.meetingDomain],
  )
  const allAgendasResource = useResource(() => client.agendas.list(), [])
  const allNameListsResource = useResource(() => client.namelists.list(), [])

  async function createAndAttachAgenda() {
    const created = await client.agendas.create({ name: p.name, description: 'Utkast' })
    await actions.setAgenda(created.id)
    allAgendasResource.reload()
  }

  async function createAndAttachNameList() {
    const created = await client.namelists.create({ name: p.name, description: 'Utkast' })
    actions.setNameList(created.id)
    allNameListsResource.reload()
  }

  useEffect(() => {
    setTab(publicModeTab(p.publicMode))
    setShowVideo(false)
    setTrimming(null)
    setSourceRecording(null)
    setSessionVideo(null)
    setConfirmUnpublish(null)
    setPendingPublicMode(null)
    setDisconnectingMeeting(false)
    setRenaming(false)
    setEditingPublicTexts(false)
    setShowMeetingBinding(false)
  }, [p.id])

  useEffect(() => {
    setTab(publicModeTab(p.publicMode))
  }, [p.publicMode])

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
  const publicModeLabel: Record<PublicMode, string> = {
    before: 'Before',
    live: 'Live',
    after: 'After',
    ondemand: 'Ondemand',
  }
  const currentPublicText = p.publicMode === 'before'
    ? (p.beforeText || 'Ingen text satt för Before.')
    : p.publicMode === 'live'
      ? (p.liveText || 'Ingen text satt för Live.')
      : p.publicMode === 'after'
        ? (p.afterText || 'Ingen text satt för After.')
        : (p.ondemandText || 'Ingen text satt för Ondemand.')
  const meetingName = p.meetingId
    ? meetingResource.data?.find((meeting) => String(meeting.id) === p.meetingId)?.title ?? `Meeting-ID ${p.meetingId}`
    : null
  const meetingAvailable = meetingResource.data !== undefined
    && !(meetingResource.error instanceof ApiError && meetingResource.error.code === 'meeting_domain_not_found')

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
      setConfirmUnpublish('toLive')
      return
    }
    setTab(next)
  }

  async function returnToLive() {
    await actions.returnToLive()
    setConfirmUnpublish(null)
    setTab('live')
  }

  function requiresPublicModeConfirmation(publicMode: PublicMode): boolean {
    return (p.publicMode === 'live' && publicMode === 'after')
      || (p.publicMode === 'live' && publicMode === 'before')
      || (p.publicMode === 'after' && publicMode === 'live')
      || (p.publicMode === 'ondemand' && publicMode === 'after')
  }

  async function applyPublicMode(publicMode: PublicMode) {
    await actions.setPublicMode(publicMode, publicMode === 'after' ? 'liveFinished' : undefined)
    setTab(publicModeTab(publicMode))
    if (publicMode === 'after' && p.channel) setAskIngestTeardown(true)
  }

  function setPublicMode(publicMode: PublicMode) {
    if (publicMode === p.publicMode) return
    if (requiresPublicModeConfirmation(publicMode)) {
      setPendingPublicMode(publicMode)
      return
    }
    void applyPublicMode(publicMode)
  }

  async function confirmPublicMode() {
    if (!pendingPublicMode) return
    const next = pendingPublicMode
    setPendingPublicMode(null)
    await applyPublicMode(next)
  }

  async function teardownAfterLive() {
    await actions.teardownChannel()
    setAskIngestTeardown(false)
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

  async function disconnectMeeting() {
    await actions.clearMeetingBinding()
    setDisconnectingMeeting(false)
  }

  return (
    <>
      <div class="head">
        <h2>
          <span class="project-header-nav">
            <button class="btn btn-sm" type="button" onClick={onOpenPlayout}>
              <PlayIcon /> Playout
            </button>
          </span>
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
          <button
            class="ib"
            type="button"
            title="Redigera publiktexter"
            aria-label="Redigera publiktexter"
            onClick={() => {
              setPublicTextDraft({ beforeText: p.beforeText, liveText: p.liveText, afterText: p.afterText, ondemandText: p.ondemandText })
              setEditingPublicTexts(true)
            }}
          >
            <EditIcon />
          </button>
          <span class="head-actions">
            <OverflowMenu
              items={[
                {
                  label: 'Flytta till papperskorgen',
                  danger: true,
                  disabled: !canDelete,
                  title: deleteBlockedReason ?? undefined,
                  onClick: () => (deleteBlockedReason ? onDeleteBlocked(deleteBlockedReason) : onDelete()),
                },
              ]}
            />
          </span>
        </h2>
        <div class="facts">
          <span>{subtitle}</span>
        </div>
      </div>

      <div class="body">
        <div class="panel-head-row">
          <CopyField label="Spelarlänk" value={p.playerUrl} monospace grow />
        </div>
        <div class="panel-head-row">
          <div class="field-block grow">
            <div class="field-block-label">Synlighet</div>
            <div class="seg full">
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
            <p class="field-help">
              {p.visibility === 'open' ? 'Vem som helst med spelarlänken kan se projektet.' : 'Projektet är dolt för publik.'}
            </p>
          </div>
        </div>
        <div class="panel-head-row">
          <div class="field-block grow">
            <div class="field-block-label">Publikläge</div>
            <select
              class="rename-input"
              value={p.publicMode}
              onChange={(event) => void setPublicMode(event.currentTarget.value as PublicMode)}
            >
              <option value="before">Before</option>
              <option value="live">Live</option>
              <option value="after">After</option>
              <option value="ondemand">Ondemand</option>
            </select>
            <p class="field-help">
              {p.afterReason === 'ondemandUnpublished' ? 'Ondemand är avpublicerad.' : 'Publikläget ändras separat från synlighet.'}
            </p>
          </div>
          <div class="field-block grow">
            <div class="field-block-label">Publikmeddelande</div>
            <div class="public-message-box">
              <div class="public-message-title">Aktuell text · {publicModeLabel[p.publicMode]}</div>
              <div class="public-message-body">{currentPublicText}</div>
              <button
                class="btn btn-sm btn-primary"
                type="button"
                onClick={() => {
                  setPublicTextDraft({ beforeText: p.beforeText, liveText: p.liveText, afterText: p.afterText, ondemandText: p.ondemandText })
                  setEditingPublicTexts(true)
                }}
              >
                Redigera texter
              </button>
            </div>
          </div>
        </div>
        <div class="panel-head-row">
          <FieldBlock label="Dagordning" grow dashed={!p.agendaId}>
            <span class="field-block-value">{agendaResource.data?.name ?? 'Ingen kopplad'}</span>
            {p.agendaId ? (
              <>
                <button class="btn btn-sm" type="button" onClick={() => onOpenAgenda(p.agendaId!)}>
                  Öppna
                </button>
                <AttachedListPicker
                  currentId={p.agendaId}
                  items={(allAgendasResource.data ?? []).map((a) => ({ id: a.id, name: a.name }))}
                  pickerTitle="Byt dagordning"
                  createNewLabel="Ny dagordning"
                  onPick={(id) => actions.setAgenda(id)}
                  onCreateNew={createAndAttachAgenda}
                  buttonClassName="ib"
                  icon={<SwapIcon />}
                  ariaLabel="Byt dagordning"
                />
              </>
            ) : (
              <AttachedListPicker
                currentId={p.agendaId}
                items={(allAgendasResource.data ?? []).map((a) => ({ id: a.id, name: a.name }))}
                pickerTitle="Koppla dagordning"
                createNewLabel="Ny dagordning"
                onPick={(id) => actions.setAgenda(id)}
                onCreateNew={createAndAttachAgenda}
                buttonLabel="Koppla..."
              />
            )}
          </FieldBlock>
        </div>
        <div class="panel-head-row">
          <FieldBlock label="Namnlista" grow dashed={!p.namelistId}>
            <span class="field-block-value">{nameListResource.data?.name ?? 'Ingen kopplad'}</span>
            {p.namelistId ? (
              <>
                <button class="btn btn-sm" type="button" onClick={() => onOpenNameList(p.namelistId!)}>
                  Öppna
                </button>
                <AttachedListPicker
                  currentId={p.namelistId}
                  items={(allNameListsResource.data ?? []).map((n) => ({ id: n.id, name: n.name }))}
                  pickerTitle="Byt namnlista"
                  createNewLabel="Ny namnlista"
                  onPick={(id) => actions.setNameList(id)}
                  onCreateNew={createAndAttachNameList}
                  buttonClassName="ib"
                  icon={<SwapIcon />}
                  ariaLabel="Byt namnlista"
                />
              </>
            ) : (
              <AttachedListPicker
                currentId={p.namelistId}
                items={(allNameListsResource.data ?? []).map((n) => ({ id: n.id, name: n.name }))}
                pickerTitle="Koppla namnlista"
                createNewLabel="Ny namnlista"
                onPick={(id) => actions.setNameList(id)}
                onCreateNew={createAndAttachNameList}
                buttonLabel="Koppla..."
              />
            )}
          </FieldBlock>
        </div>
        <div class="panel-head-row">
          <FieldBlock label="Meeting" grow dashed={!p.meetingBindingId}>
            <span class="field-block-value">{p.meetingBindingId ? meetingName : 'Ingen kopplad'}</span>
            {(p.meetingBindingId || meetingAvailable) && (
              <button class="btn btn-sm" type="button" onClick={() => setShowMeetingBinding(true)}>
                {p.meetingBindingId ? 'Byt Meeting' : 'Koppla...'}
              </button>
            )}
            {p.meetingBindingId && (
              <button
                class="ib"
                type="button"
                title="Koppla från Meeting"
                aria-label="Koppla från Meeting"
                onClick={() => setDisconnectingMeeting(true)}
              >
                <UnlinkIcon />
              </button>
            )}
          </FieldBlock>
        </div>
        {showMeetingBinding && (
          <MeetingBindingModal
            projectName={p.name}
            meetingDomain={meetingDomain}
            currentAgendaName={agendaResource.data?.name}
            actions={actions}
            onClose={() => setShowMeetingBinding(false)}
          />
        )}
        {disconnectingMeeting && (
          <ConfirmModal
            title="Koppla från Meeting?"
            confirmLabel="Koppla från"
            danger
            onCancel={() => setDisconnectingMeeting(false)}
            onConfirm={() => void disconnectMeeting()}
          >
            <p>Meeting-kopplingen tas bort från projektet. Kopplad dagordning och namnlista påverkas inte.</p>
          </ConfirmModal>
        )}

      <div class="tabs" role="tablist">
        <button role="tab" type="button" aria-selected={tab === 'live'} onClick={() => void selectTab('live')}>
          Livesändning
        </button>
        <button role="tab" type="button" aria-selected={tab === 'odm'} onClick={() => void selectTab('odm')}>
          Ondemand
        </button>
      </div>

      {tab === 'live' && (
        <div class="tabpanel">
          <StatusCard
            tone={status.tone}
            title={status.label}
            actions={
              <>
                {!hasIngest && (
                  <button class="btn btn-primary" type="button" onClick={() => actions.createChannel().then(refresh)}>
                    Skapa ingest
                  </button>
                )}
                {hasIngest && channel?.playbackUrl && (
                  <button
                    class={`btn btn-sm ${live ? 'btn-primary' : ''}`}
                    type="button"
                    onClick={() => setShowVideo(true)}
                  >
                    Visa livesändning
                  </button>
                )}
                {hasIngest && !inUse && (
                  <button
                    class="btn btn-sm btn-danger-ghost"
                    type="button"
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
                )}
                {hasIngest && inUse && (
                  <OverflowMenu
                    items={[
                      {
                        label: 'Riv ingest',
                        danger: true,
                        disabled: true,
                        title: 'Går inte att riva medan signal tas emot',
                        onClick: () => {},
                      },
                    ]}
                  />
                )}
              </>
            }
          >
            {liveNote}
          </StatusCard>
          <div class="resource">
            <div class="rowset-cols">
              <CopyField
                label="Ingest-server"
                value={channel?.ingestEndpoint ?? null}
                placeholder="Skapa ingest först"
                monospace
              />
              <CopyField label="Stream key" value={streamKey} mask monospace />
            </div>
            <div class="rowset">
              <CopyField label="HLS-URL" value={channel?.playbackUrl ?? null} monospace />
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

          <details class="debugbar">
            <summary class="debugbar-label">Debug</summary>
            <div class="debugbar-row">
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
          </details>
        </div>
      )}

      {tab === 'odm' && (
        <div class="tabpanel">
          <div class="actions">
            <StatusChip tone={ODM_META[rec].tone} dot>
              {rec === 'recording' ? 'Spelas in' : ODM_META[rec].label}
            </StatusChip>
            <span class="sep" />
            {p.publication.state !== 'published' && (
              <>
                <button
                  class={`btn ${rec === 'recorded' ? 'btn-primary' : ''}`}
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
                  class={`btn ${rec === 'trimmed' ? 'btn-primary' : ''}`}
                  type="button"
                  disabled={!canPublish}
                  title={pub ? 'Stäng projektet först' : live ? 'Tillgänglig först när enkodern slutat sända' : rec !== 'trimmed' ? 'Trimma inspelningen först' : undefined}
                  onClick={actions.publish}
                >
                  Publicera
                </button>
              </>
            )}
            {p.publication.state === 'published' && (
              <>
                <button class="btn btn-sm" type="button" disabled={!p.recording?.hlsUrl} onClick={() => setShowVideo(true)}>
                  Visa inspelning
                </button>
                <span class="spacer" />
                <OverflowMenu
                  items={[
                    {
                      label: 'Avpublicera',
                      danger: true,
                      onClick: () => setConfirmUnpublish('fromAction'),
                    },
                  ]}
                />
              </>
            )}
          </div>
          <div class="rowset" style={{ maxWidth: '660px' }}>
            <CopyField
              label="HLS-URL"
              value={p.recording?.hlsUrl ?? null}
              placeholder="Tillgänglig efter trimning"
              monospace
            />
          </div>
          {sourceRecording?.sessions && sourceRecording.sessions.length > 0 && (
            <div class="recording-sessions">
              <h4>IVS-inspelningar för kanalen</h4>
              <ul>
                {sourceRecording.sessions.map((session) => (
                  <li key={session.id}>
                    <span>{formatDateTime(session.startedAt)}</span>
                    <span>{formatHms(session.durationSeconds)}</span>
                    {!session.hlsUrl && <span class="recording-session-unavailable">Manifest saknas</span>}
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

      {editingPublicTexts && (
        <Modal title="Publiktexter" onClose={() => setEditingPublicTexts(false)}>
          <p class="field-help">Texterna visas när projektets publikläge är Before, Live, After eller Ondemand.</p>
          {([
            ['beforeText', 'Before-text'],
            ['liveText', 'Live-text'],
            ['afterText', 'After-text'],
            ['ondemandText', 'Ondemand-text'],
          ] as const).map(([key, label]) => (
            <label class="form-label" key={key}>
              {label}
              <textarea
                class="form-input public-textarea"
                rows={3}
                value={publicTextDraft[key]}
                onInput={(event) => setPublicTextDraft((draft) => ({ ...draft, [key]: event.currentTarget.value }))}
              />
            </label>
          ))}
          <div class="modal-actions">
            <button class="btn btn-sm" type="button" onClick={() => setEditingPublicTexts(false)}>Avbryt</button>
            <button
              class="btn btn-sm btn-primary"
              type="button"
              onClick={async () => {
                await actions.rename(p.name, publicTextDraft)
                setEditingPublicTexts(false)
              }}
            >
              Spara
            </button>
          </div>
        </Modal>
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

      {confirmUnpublish && (
        <ConfirmModal
          title={confirmUnpublish === 'toLive' ? 'Gå tillbaka till live?' : 'Avpublicera inspelningen?'}
          confirmLabel={confirmUnpublish === 'toLive' ? 'Gå till live' : 'Avpublicera'}
          danger
          onCancel={() => setConfirmUnpublish(null)}
          onConfirm={() => void returnToLive()}
        >
          {confirmUnpublish === 'toLive' ? (
            <p>
              Den kopplade ondemand-versionen kopplas bort och publiken kan inte längre se den. För att
              sända igen behöver du skapa en ny ingest-resurs och använda en ny stream key i enkodern.
            </p>
          ) : (
            <p>
              Ondemand-versionen kopplas bort och publiken kan inte längre se den. Du kan trimma och
              publicera på nytt senare, eller skapa en ny ingest-resurs för att sända live igen.
            </p>
          )}
        </ConfirmModal>
      )}

      {pendingPublicMode && (
        <ConfirmModal
          title={`Byt publikläge till ${pendingPublicMode}?`}
          confirmLabel="Byt läge"
          danger={pendingPublicMode === 'after' || pendingPublicMode === 'before'}
          onCancel={() => setPendingPublicMode(null)}
          onConfirm={() => void confirmPublicMode()}
        >
          {pendingPublicMode === 'after' && p.publicMode === 'live' ? (
            <p>Livevisningen lämnas för publiken och projektet visar After-meddelandet. Encoder och ingest påverkas inte ännu.</p>
          ) : pendingPublicMode === 'before' && p.publicMode === 'live' ? (
            <p>Den pågående livesändningen tas bort från publiken och projektet visar Before-meddelandet.</p>
          ) : pendingPublicMode === 'live' && p.publicMode === 'after' ? (
            <p>Projektet går tillbaka till Livesändning. En ny ingest kan behöva skapas och enkodern kan behöva en ny stream key.</p>
          ) : (
            <p>Ondemand tas bort från publiken och projektet visar After-meddelandet.</p>
          )}
        </ConfirmModal>
      )}

      {askIngestTeardown && (
        <Modal title="Vad ska hända med ingest?" onClose={() => setAskIngestTeardown(false)}>
          <p>
            Projektet ligger nu i After. Enkodern och ingest-resursen kan ligga kvar om du vill kunna fortsätta
            tekniskt, eller rivas för att frigöra resursen.
          </p>
          <div class="modal-actions">
            <button class="btn btn-sm" type="button" onClick={() => setAskIngestTeardown(false)}>
              Behåll ingest
            </button>
            <button class="btn btn-sm btn-danger" type="button" onClick={() => void teardownAfterLive()}>
              Riv ingest
            </button>
          </div>
        </Modal>
      )}
    </>
  )
}
