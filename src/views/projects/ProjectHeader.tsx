import { t } from '@lingui/core/macro'
import { useEffect, useRef, useState } from 'preact/hooks'
import { Icon } from '../../components/Icon'
import { ConfirmModal } from '../../components/ConfirmModal'
import { RenameModal } from '../../components/RenameModal'
import { Clock } from '../../components/Clock'
import type { Channel, ChannelHealth, Project } from '../../data/types'
import type { ProjectActions } from './actions'
import { EncoderStatusChip, ViewersChip } from './LiveStatusBadges'
import { encoderStatusOf, viewerCountOf } from './liveStatus'
import './ProjectHeader.css'

interface ProjectHeaderProps {
  project: Project
  actions: ProjectActions
  onBack: () => void
  channel?: Channel | null
  health?: ChannelHealth | null
  showIngestInfo: boolean
  onShowIngestInfoChange: (show: boolean) => void
  /** Knappen Ingest info i rubriken: öppnar spelarinställningarnas flik Ingest. */
  onIngestInfo?: () => void
  /** UNG-305: in Live without an ingest the button becomes Create ingest (after a short confirmation, then Ingest info opens). */
  onCreateIngest?: () => Promise<void>
}

// Gemensam för Livesändning och Ondemand. showIngestInfo ägs av föräldern; ingest-panelen och knappen som öppnar den ligger i
// översiktens vänsterspalt (i Before under förberedelsen Ingest), och rubriken stänger panelen när signalen blir OK. Lägesknapparna
// ligger också i vänsterspalten, spelarlänken och HLS-adresserna i spelarinställningarna (UI-finslipning omgång 1).
/** UNG-308: the clock shows the broadcast duration while Live has a signal. */
export function signalSince(p: Project, health: ChannelHealth | null): string | null {
  return p.publicMode === 'live' && health?.streamStartedAt ? health.streamStartedAt : null
}

export function ProjectHeader({ project: p, actions, onBack, channel = null, health = null, showIngestInfo, onShowIngestInfoChange, onIngestInfo, onCreateIngest }: ProjectHeaderProps) {
  const [editingTitle, setEditingTitle] = useState(false)
  const [confirmTeardown, setConfirmTeardown] = useState(false)
  const [confirmCreate, setConfirmCreate] = useState(false)
  const [creating, setCreating] = useState(false)
  const wasStoppedInAfter = useRef(false)

  async function saveTitle(name: string) {
    setEditingTitle(false)
    if (name && name !== p.name) await actions.rename(name)
  }

  async function createIngest() {
    if (!onCreateIngest) return
    setConfirmCreate(false)
    setCreating(true)
    try {
      await onCreateIngest()
    } finally {
      setCreating(false)
    }
    onIngestInfo?.()
  }

  async function teardownIngest() {
    setConfirmTeardown(false)
    onShowIngestInfoChange(false)
    await actions.teardownChannel()
  }

  const phase = health?.livePhase?.toLowerCase()

  // Fångar övergången till "stoppad medan vi redan står i After" — oavsett om
  // enkodern hann stanna innan eller efter klicket Live→After. Frågan ska
  // bara ställas en gång per stopp, inte vid varje pollning (var 5:e sekund).
  useEffect(() => {
    const stoppedInAfter = p.publicMode === 'after' && phase === 'streamended'
    if (stoppedInAfter && !wasStoppedInAfter.current) setConfirmTeardown(true)
    wasStoppedInAfter.current = stoppedInAfter
  }, [p.publicMode, phase])
  const encoderStatus = encoderStatusOf({ hasChannel: Boolean(channel), publicMode: p.publicMode, livePhase: health?.livePhase, healthState: health?.state })

  // UNG-22: bara medan strömmen är live och IVS har gett en siffra.
  const viewerCount = viewerCountOf(health)

  // Ingest-panelen stängs när signalen blir OK medan den är öppen; öppnar man den efter att signalen redan är OK ligger den kvar.
  const prevEncoderLabelRef = useRef(encoderStatus.label)
  useEffect(() => {
    const prevLabel = prevEncoderLabelRef.current
    prevEncoderLabelRef.current = encoderStatus.label
    if (showIngestInfo && encoderStatus.tone === 'ok' && prevLabel !== encoderStatus.label) onShowIngestInfoChange(false)
  }, [encoderStatus.label, showIngestInfo])

  return (
    <header class="pv-header">
      <div class="pv-row">
        <button class="btn" type="button" aria-label={t`Projects`} title={t`Projects`} onClick={onBack}>
          <Icon name="arrow_back" size={18} />
        </button>
        <h1 class="pv-title" title={p.name}>{p.name}</h1>
        {p.liveOnly && <span class="pv-liveonly" title={t`Marked as live only. It changes no behavior, and the marker is removed in the player settings.`}>{t`Live only`}</span>}
        <button class="pv-icon-btn" type="button" aria-label={t`Edit title`} onClick={() => setEditingTitle(true)}>
          <Icon name="edit" size={18} />
        </button>
        {/* UNG-308: the title is edited in a dialog; inline it got too cramped with long titles. */}
        {editingTitle && (
          <RenameModal title={t`Edit title`} initialValue={p.name} onCancel={() => setEditingTitle(false)} onSave={(name) => void saveTitle(name)} />
        )}
        <span class="spacer" />
        <EncoderStatusChip status={encoderStatus} />
        {viewerCount !== null && <ViewersChip count={viewerCount} />}
        {onCreateIngest && !channel && !p.channel ? (
          <button class="btn btn-sm" type="button" disabled={creating} onClick={() => setConfirmCreate(true)}>
            <Icon name="add" size={18} /> {creating ? t`Creating ingest…` : t`Create ingest`}
          </button>
        ) : onIngestInfo && (
          <button class="btn btn-sm" type="button" disabled={!channel} onClick={onIngestInfo}>
            <Icon name="info" size={18} /> {t`Ingest info`}
          </button>
        )}
        <span class="spacer" />
        <span class="pv-clock"><Clock since={signalSince(p, health)} /></span>
      </div>

      {confirmCreate && (
        <ConfirmModal
          title={t`Create ingest?`}
          confirmLabel={t`Create ingest`}
          onCancel={() => setConfirmCreate(false)}
          onConfirm={() => void createIngest()}
        >
          <p>{t`A streaming server (the ingest) is created for the project. Its details are shown when it is ready.`}</p>
        </ConfirmModal>
      )}

      {confirmTeardown && (
        <ConfirmModal
          title={t`Has the broadcast ended?`}
          confirmLabel={t`Tear down ingest`}
          danger
          onCancel={() => setConfirmTeardown(false)}
          onConfirm={() => void teardownIngest()}
        >
          <p>{t`The encoder has stopped sending. Should we tear down the streaming server (the ingest) that was used? If this was only a test, answer Cancel — the server stays, ready for a new broadcast.`}</p>
        </ConfirmModal>
      )}


    </header>
  )
}
