import { useEffect, useRef, useState } from 'preact/hooks'
import { Icon } from '../../components/Icon'
import { ConfirmModal } from '../../components/ConfirmModal'
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
}

// Gemensam för Livesändning och Ondemand. showIngestInfo ägs av föräldern; ingest-panelen och knappen som öppnar den ligger i
// översiktens vänsterspalt (i Before under förberedelsen Ingest), och rubriken stänger panelen när signalen blir OK. Lägesknapparna
// ligger också i vänsterspalten, spelarlänken och HLS-adresserna i spelarinställningarna (UI-finslipning omgång 1).
export function ProjectHeader({ project: p, actions, onBack, channel = null, health = null, showIngestInfo, onShowIngestInfoChange }: ProjectHeaderProps) {
  const [editingTitle, setEditingTitle] = useState(false)
  const [titleDraft, setTitleDraft] = useState(p.name)
  const [confirmTeardown, setConfirmTeardown] = useState(false)
  const wasStoppedInAfter = useRef(false)

  async function saveTitle() {
    const name = titleDraft.trim()
    setEditingTitle(false)
    if (name && name !== p.name) await actions.rename(name)
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
    if (showIngestInfo && encoderStatus.label === 'Signal OK' && prevLabel !== 'Signal OK') onShowIngestInfoChange(false)
  }, [encoderStatus.label, showIngestInfo])

  return (
    <header class="pv-header">
      <div class="pv-row">
        <button class="btn" type="button" onClick={onBack}>
          <Icon name="arrow_back" size={18} />
          <span>Projekt</span>
        </button>
        {editingTitle ? (
          <form
            class="pv-title-form"
            onSubmit={(e) => {
              e.preventDefault()
              void saveTitle()
            }}
          >
            <input
              class="pv-title-input"
              aria-label="Rubrik"
              value={titleDraft}
              autoFocus
              onInput={(e) => setTitleDraft((e.target as HTMLInputElement).value)}
              onKeyDown={(e) => {
                if (e.key === 'Escape') setEditingTitle(false)
              }}
            />
            <button class="btn btn-primary" type="submit">
              Spara
            </button>
            <button class="btn" type="button" onClick={() => setEditingTitle(false)}>
              Avbryt
            </button>
          </form>
        ) : (
          <>
            <h1 class="pv-title">{p.name}</h1>
            {p.liveOnly && <span class="pv-liveonly" title="Markerat som endast live. Det ändrar inget beteende, och markören tas bort i spelarinställningarna.">Endast live</span>}
            <button
              class="pv-icon-btn"
              type="button"
              aria-label="Redigera rubrik"
              onClick={() => {
                setTitleDraft(p.name)
                setEditingTitle(true)
              }}
            >
              <Icon name="edit" size={18} />
            </button>
          </>
        )}
        <span class="spacer" />
        <EncoderStatusChip status={encoderStatus} />
        {viewerCount !== null && <ViewersChip count={viewerCount} />}
        <span class="spacer" />
        <span class="pv-clock"><Clock /></span>
      </div>

      {confirmTeardown && (
        <ConfirmModal
          title="Är sändningen slut?"
          confirmLabel="Riv ingest"
          danger
          onCancel={() => setConfirmTeardown(false)}
          onConfirm={() => void teardownIngest()}
        >
          <p>Enkodern har slutat sända. Ska vi riva streamingservern (ingesten) som användes? Om detta bara var ett test svarar du Avbryt — servern finns kvar och redo för en ny sändning.</p>
        </ConfirmModal>
      )}


    </header>
  )
}
