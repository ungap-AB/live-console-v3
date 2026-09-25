import { useEffect, useRef, useState } from 'preact/hooks'
import { Icon } from '../../components/Icon'
import { ConfirmModal } from '../../components/ConfirmModal'
import { Modal } from '../../components/Modal'
import { Clock } from '../../components/Clock'
import type { Channel, ChannelHealth, Project, Visibility } from '../../data/types'
import { formatDate } from '../../app/time'
import type { ProjectActions } from './actions'
import { useModeChange } from './useModeChange'
import { MODES, MODE_LABEL } from './projectMode'
import { IngestInfo } from './IngestInfo'
import './ProjectHeader.css'

interface ProjectHeaderProps {
  project: Project
  actions: ProjectActions
  onBack: () => void
  onModeSelect?: (mode: Project['publicMode']) => void
  channel?: Channel | null
  health?: ChannelHealth | null
  streamKey?: string | null
}

const VISIBILITIES: { value: Visibility; label: string; icon: string }[] = [
  { value: 'open', label: 'Öppen', icon: 'visibility' },
  { value: 'closed', label: 'Stängd', icon: 'visibility_off' },
]

// Spelarlänken visas utan protokoll.
function displayUrl(url: string): string {
  return url.replace(/^https?:\/\//, '')
}

// Gemensam för Livesändning och Ondemand.
export function ProjectHeader({ project: p, actions, onBack, onModeSelect, channel = null, health = null, streamKey = null }: ProjectHeaderProps) {
  const [editingTitle, setEditingTitle] = useState(false)
  const [titleDraft, setTitleDraft] = useState(p.name)
  const { selectMode, dialog: modeDialog } = useModeChange(p, actions)
  const [showSettings, setShowSettings] = useState(false)
  const [showIngestInfo, setShowIngestInfo] = useState(false)
  const [closingIngestInfo, setClosingIngestInfo] = useState(false)
  const [confirmTeardown, setConfirmTeardown] = useState<'manual' | 'encoderStopped' | null>(null)
  const [copied, setCopied] = useState(false)
  const [iframeCopied, setIframeCopied] = useState(false)
  const settingsButton = useRef<HTMLButtonElement>(null)
  const wasStoppedInAfter = useRef(false)

  async function saveTitle() {
    const name = titleDraft.trim()
    setEditingTitle(false)
    if (name && name !== p.name) await actions.rename(name)
  }

  async function copyLink() {
    try {
      await navigator.clipboard.writeText(p.playerUrl)
      setCopied(true)
      setTimeout(() => setCopied(false), 1500)
    } catch {
      // Kopieringen misslyckas tyst; länken är synlig och går att markera.
    }
  }

  async function copyIframe() {
    const iframe = `<iframe src="${p.playerUrl}" title="${p.name.replaceAll('"', '&quot;')}" allow="autoplay; fullscreen" allowfullscreen></iframe>`
    try {
      await navigator.clipboard.writeText(iframe)
      setIframeCopied(true)
      setTimeout(() => setIframeCopied(false), 1500)
    } catch {
      // Kopieringen misslyckas tyst; länken är fortfarande tillgänglig.
    }
  }

  async function teardownIngest() {
    setConfirmTeardown(null)
    setShowIngestInfo(false)
    await actions.teardownChannel()
  }

  const phase = health?.livePhase?.toLowerCase()

  // Fångar övergången till "stoppad medan vi redan står i After" — oavsett om
  // enkodern hann stanna innan eller efter klicket Live→After. Frågan ska
  // bara ställas en gång per stopp, inte vid varje pollning (var 5:e sekund).
  useEffect(() => {
    const stoppedInAfter = p.publicMode === 'after' && phase === 'streamended'
    if (stoppedInAfter && !wasStoppedInAfter.current) setConfirmTeardown('encoderStopped')
    wasStoppedInAfter.current = stoppedInAfter
  }, [p.publicMode, phase])
  const encoderStatus = !channel
    ? { label: 'Ingen ingest', tone: 'neutral' }
    : p.publicMode === 'after' && (phase === 'live' || phase === 'waitingforstream' || health?.state?.toLowerCase() === 'live')
      ? { label: 'Väntar på att enkoder stoppar', tone: 'warn' }
      : phase === 'live' || health?.state?.toLowerCase() === 'live'
      ? { label: 'Signal OK', tone: 'ok' }
      : phase === 'signalinterrupted' || phase === 'signalinterrupteddeclined'
        ? { label: 'Avbrott i signal', tone: 'danger' }
        : p.publicMode === 'after' && phase === 'waitingforstream'
          ? { label: 'Väntar på att enkoder stoppar', tone: 'warn' }
          : phase === 'streamended'
            ? { label: 'Sändningen avslutad', tone: 'ended' }
            : { label: 'Väntar på signal', tone: 'warn' }

  useEffect(() => {
    if (!showIngestInfo || encoderStatus.label !== 'Signal OK') {
      setClosingIngestInfo(false)
      return
    }

    const closeTimer = window.setTimeout(() => {
      setClosingIngestInfo(true)
      window.setTimeout(() => setShowIngestInfo(false), 350)
    }, 5000)
    return () => window.clearTimeout(closeTimer)
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
        <div class={`pv-encoder-status is-${encoderStatus.tone}`} role="status">
          <span class="pv-encoder-dot" aria-hidden="true" />
          <span>{encoderStatus.label}</span>
        </div>
        <button
          class="pv-ingest-button"
          type="button"
          disabled={!channel}
          aria-expanded={showIngestInfo}
          onClick={() => {
            setClosingIngestInfo(false)
            setShowIngestInfo((visible) => !visible)
          }}
        >
          <Icon name="info" size={17} />
          <span>Ingest info</span>
        </button>
        <span class="spacer" />
        <span class="pv-clock"><Clock /></span>
        <button class="btn" type="button" ref={settingsButton} onClick={() => setShowSettings(true)}>
          <Icon name="settings" size={18} />
          <span>Projektinställningar</span>
        </button>
      </div>

      {(showIngestInfo || closingIngestInfo) && channel && (
        <div class={`pv-ingest-info${closingIngestInfo ? ' is-closing' : ''}`}>
          <IngestInfo
            channel={channel}
            streamKey={streamKey}
            trailingAction={(
              <div class="pv-ingest-actions">
                <button class="btn btn-sm btn-danger" type="button" onClick={() => setConfirmTeardown('manual')}>
                  Riv ingest
                </button>
                <button class="pv-icon-btn" type="button" aria-label="Stäng ingest-info" title="Stäng" onClick={() => { setClosingIngestInfo(false); setShowIngestInfo(false) }}>
                  <Icon name="close" size={18} />
                </button>
              </div>
            )}
          />
        </div>
      )}

      {confirmTeardown && (
        <ConfirmModal
          title={confirmTeardown === 'encoderStopped' ? 'Är sändningen slut?' : 'Riva ingest?'}
          confirmLabel="Riv ingest"
          danger
          onCancel={() => setConfirmTeardown(null)}
          onConfirm={() => void teardownIngest()}
        >
          {confirmTeardown === 'encoderStopped' ? (
            <p>Enkodern har slutat sända. Ska vi riva streamingservern (ingesten) som användes? Om detta bara var ett test svarar du Avbryt — servern finns kvar och redo för en ny sändning.</p>
          ) : (
            <p>Ingest-resursen tas bort. För att sända behöver du skapa en ny ingest och använda en ny stream key i enkodern.</p>
          )}
        </ConfirmModal>
      )}

      <div class="pv-row pv-controls">
        <div class="pv-field">
          <div class="pv-label" id="pv-mode-label">
            Läge
          </div>
          <div class="pv-seg" role="group" aria-labelledby="pv-mode-label">
            {MODES.map((mode) => (
              <button
                key={mode}
                type="button"
                class={`pv-seg-btn${mode === 'live' ? ' is-live' : ''}`}
                aria-pressed={p.publicMode === mode}
                disabled={mode === 'before' && p.publicMode === 'live'}
                title={mode === 'before' && p.publicMode === 'live' ? 'Gå till After innan Before — ett avbrutet test granskas alltid där först.' : undefined}
                onClick={() => (onModeSelect ? onModeSelect(mode) : selectMode(mode))}
              >
                {MODE_LABEL[mode]}
              </button>
            ))}
          </div>
        </div>

        <div class="pv-field">
          <div class="pv-label" id="pv-vis-label">
            Synlighet
          </div>
          <div class="pv-seg" role="group" aria-labelledby="pv-vis-label">
            {VISIBILITIES.map((v) => (
              <button
                key={v.value}
                type="button"
                class={`pv-seg-btn${v.value === 'open' ? ' is-open' : ''}`}
                aria-pressed={p.visibility === v.value}
                disabled={p.publicMode === 'after' && v.value === 'open'}
                onClick={() => p.publicMode !== 'after' && p.visibility !== v.value && actions.setVisibility(v.value)}
              >
                <Icon name={v.icon} size={16} />
                <span>{v.label}</span>
              </button>
            ))}
          </div>
        </div>

        <div class="pv-field pv-link-field">
          <div class="pv-label">Spelarlänk</div>
          <div class="pv-link">
            <span class="pv-link-url">{displayUrl(p.playerUrl)}</span>
            <button
              class="pv-icon-btn"
              type="button"
              aria-label={copied ? 'Länken kopierad' : 'Kopiera spelarlänk'}
              onClick={() => void copyLink()}
            >
              <Icon name={copied ? 'check' : 'content_copy'} size={18} />
            </button>
            <button
              class="pv-icon-btn"
              type="button"
              aria-label={iframeCopied ? 'Iframe-koden kopierad' : 'Kopiera iframe-kod'}
              title={iframeCopied ? 'Iframe-koden kopierad' : 'Kopiera iframe-kod'}
              onClick={() => void copyIframe()}
            >
              <Icon name={iframeCopied ? 'check' : 'code'} size={18} />
            </button>
            <a
              class="pv-icon-btn"
              href={p.playerUrl}
              target="_blank"
              rel="noopener noreferrer"
              aria-label="Öppna spelaren i ny flik"
            >
              <Icon name="open_in_new" size={18} />
            </a>
          </div>
        </div>

      </div>

      {modeDialog}

      {showSettings && (
        <Modal title="Projektinställningar" onClose={() => setShowSettings(false)}>
          <dl class="pv-settings">
            <dt>Projekt-id</dt>
            <dd>{p.id}</dd>
            <dt>Skapad</dt>
            <dd>{formatDate(p.createdAt)}</dd>
          </dl>
          <p class="pv-settings-note">Meeting-koppling och fler inställningar kommer här.</p>
        </Modal>
      )}
    </header>
  )
}
