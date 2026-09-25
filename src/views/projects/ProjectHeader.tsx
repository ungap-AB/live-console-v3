import { useEffect, useRef, useState } from 'preact/hooks'
import { create, isPlayerSupported } from 'amazon-ivs-player'
import wasmBinary from 'amazon-ivs-player/dist/assets/amazon-ivs-wasmworker.min.wasm?url'
import wasmWorker from 'amazon-ivs-player/dist/assets/amazon-ivs-wasmworker.min.js?url'
import { Icon } from '../../components/Icon'
import { ConfirmModal } from '../../components/ConfirmModal'
import { Modal } from '../../components/Modal'
import { Clock } from '../../components/Clock'
import type { Channel, ChannelHealth, Project } from '../../data/types'
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
  showIngestInfo: boolean
  onShowIngestInfoChange: (show: boolean) => void
}

// Spelarlänken visas utan protokoll.
function displayUrl(url: string): string {
  return url.replace(/^https?:\/\//, '')
}

// Gemensam för Livesändning och Ondemand. showIngestInfo ägs av föräldern så
// att t.ex. BeforeWorkspaces "Visa ingest-info"-menyval kan slå på samma
// panel som knappen här i headern, istället för att ha en egen kopia.
export function ProjectHeader({ project: p, actions, onBack, onModeSelect, channel = null, health = null, streamKey = null, showIngestInfo, onShowIngestInfoChange }: ProjectHeaderProps) {
  const [editingTitle, setEditingTitle] = useState(false)
  const [titleDraft, setTitleDraft] = useState(p.name)
  const { selectMode, dialog: modeDialog } = useModeChange(p, actions)
  const [closingIngestInfo, setClosingIngestInfo] = useState(false)
  const [confirmTeardown, setConfirmTeardown] = useState<'manual' | 'encoderStopped' | null>(null)
  const [copied, setCopied] = useState(false)
  const [iframeCopied, setIframeCopied] = useState(false)
  const [showIframeMenu, setShowIframeMenu] = useState(false)
  const [showPlayerSettings, setShowPlayerSettings] = useState(false)
  const [showPreview, setShowPreview] = useState(false)
  const [previewError, setPreviewError] = useState<string | null>(null)
  const previewVideoRef = useRef<HTMLVideoElement>(null)
  const iframeMenuRef = useRef<HTMLDivElement>(null)
  const wasStoppedInAfter = useRef(false)

  function toggleVisibility() {
    const next = p.visibility === 'open' ? 'closed' : 'open'
    if (p.publicMode === 'after' && next === 'open') return
    void actions.setVisibility(next)
  }

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

  function iframeExampleUrl(): string {
    // host.html är den skyltade exempelsidan (engelska texter, ungap
    // Presenter-logga) — visar hur inbäddningen ser ut för en värdsida.
    const base = p.playerUrl.split('?')[0]
    return `${base}host.html?p=${p.id}`
  }

  async function copyIframeAndClose() {
    setShowIframeMenu(false)
    await copyIframe()
  }

  function openIframeExample() {
    setShowIframeMenu(false)
    window.open(iframeExampleUrl(), '_blank', 'noopener,noreferrer')
  }

  useEffect(() => {
    if (!showIframeMenu) return
    function onDocMouseDown(e: MouseEvent) {
      if (iframeMenuRef.current && !iframeMenuRef.current.contains(e.target as Node)) setShowIframeMenu(false)
    }
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') setShowIframeMenu(false)
    }
    document.addEventListener('mousedown', onDocMouseDown)
    document.addEventListener('keydown', onKeyDown)
    return () => {
      document.removeEventListener('mousedown', onDocMouseDown)
      document.removeEventListener('keydown', onKeyDown)
    }
  }, [showIframeMenu])

  useEffect(() => {
    if (!showPreview) return
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') setShowPreview(false)
    }
    document.addEventListener('keydown', onKeyDown)
    return () => document.removeEventListener('keydown', onKeyDown)
  }, [showPreview])

  // Förhandsgranskningen spelar HLS direkt via IVS-spelaren (inte live-player-v3-sidan).
  useEffect(() => {
    setPreviewError(null)
    if (!showPreview) return
    const video = previewVideoRef.current
    const playbackUrl = channel?.playbackUrl
    if (!video || !playbackUrl) return
    if (!isPlayerSupported) {
      setPreviewError('AWS IVS Player kan inte köras i den här webbläsaren.')
      return
    }

    const player = create({ wasmWorker, wasmBinary })
    player.attachHTMLVideoElement(video)
    player.load(playbackUrl)
    video.defaultMuted = true
    video.muted = true
    player.play()

    return () => {
      player.pause()
      player.delete()
    }
  }, [showPreview, channel?.playbackUrl])

  async function teardownIngest() {
    setConfirmTeardown(null)
    onShowIngestInfoChange(false)
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
            : p.publicMode === 'ondemand'
              ? { label: 'Ingen signal', tone: 'warn' }
              : { label: 'Väntar på signal', tone: 'warn' }

  const prevEncoderLabelRef = useRef(encoderStatus.label)

  useEffect(() => {
    const prevLabel = prevEncoderLabelRef.current
    prevEncoderLabelRef.current = encoderStatus.label

    // Bara auto-kollapsa när signalen blir OK medan panelen redan är öppen —
    // öppnar man den efter att signalen redan är OK ska den ligga kvar.
    const justBecameOk = showIngestInfo && encoderStatus.label === 'Signal OK' && prevLabel !== 'Signal OK'
    if (!justBecameOk) {
      setClosingIngestInfo(false)
      return
    }

    setClosingIngestInfo(true)
    const closeTimer = window.setTimeout(() => onShowIngestInfoChange(false), 350)
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
            onShowIngestInfoChange(!showIngestInfo)
          }}
        >
          <Icon name="info" size={17} />
          <span>Ingest info</span>
        </button>
        <button
          class="pv-ingest-button"
          type="button"
          disabled={encoderStatus.label !== 'Signal OK'}
          aria-pressed={showPreview}
          aria-label="Förhandsgranska sändningen"
          title={encoderStatus.label === 'Signal OK' ? 'Förhandsgranska sändningen' : 'Kräver signal för att förhandsgranska'}
          onClick={() => setShowPreview((visible) => !visible)}
        >
          <Icon name="videocam" size={17} />
          <span>Preview</span>
        </button>
        <span class="spacer" />
        <span class="pv-clock"><Clock /></span>
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
                <button class="pv-icon-btn" type="button" aria-label="Stäng ingest-info" title="Stäng" onClick={() => { setClosingIngestInfo(false); onShowIngestInfoChange(false) }}>
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

        <div class="pv-field pv-link-field">
          <div class="pv-label">Spelare</div>
          <div class="pv-link">
            <button
              class="pv-icon-btn"
              type="button"
              aria-pressed={p.visibility === 'open'}
              disabled={p.publicMode === 'after' && p.visibility === 'closed'}
              aria-label={p.visibility === 'open' ? 'Stäng spelaren för publik' : 'Öppna spelaren för publik'}
              title={p.visibility === 'open' ? 'Stäng spelaren för publik' : 'Öppna spelaren för publik'}
              onClick={toggleVisibility}
            >
              <Icon name={p.visibility === 'open' ? 'visibility' : 'visibility_off'} size={18} />
            </button>
            <span class="pv-link-url">{displayUrl(p.playerUrl)}</span>
            <button
              class="pv-icon-btn"
              type="button"
              aria-label={copied ? 'Länken kopierad' : 'Kopiera spelarlänk'}
              onClick={() => void copyLink()}
            >
              <Icon name={copied ? 'check' : 'content_copy'} size={18} />
            </button>
            <div class="pv-iframe-menu-wrap" ref={iframeMenuRef}>
              <button
                class="pv-icon-btn"
                type="button"
                aria-haspopup="menu"
                aria-expanded={showIframeMenu}
                aria-label={iframeCopied ? 'Iframe-koden kopierad' : 'IFRAME-alternativ'}
                title={iframeCopied ? 'Iframe-koden kopierad' : 'IFRAME-alternativ'}
                onClick={() => setShowIframeMenu((visible) => !visible)}
              >
                <Icon name={iframeCopied ? 'check' : 'code'} size={18} />
              </button>
              {showIframeMenu && (
                <div class="pv-iframe-menu" role="menu">
                  <button type="button" role="menuitem" onClick={() => void copyIframeAndClose()}>Kopiera IFRAME-kod</button>
                  <button type="button" role="menuitem" onClick={openIframeExample}>Öppna exempelsida</button>
                </div>
              )}
            </div>
            <a
              class="pv-icon-btn"
              href={p.playerUrl}
              target="_blank"
              rel="noopener noreferrer"
              aria-label="Öppna spelaren i ny flik"
            >
              <Icon name="open_in_new" size={18} />
            </a>
            <button
              class="pv-icon-btn"
              type="button"
              aria-label="Spelarinställningar"
              title="Spelarinställningar"
              onClick={() => setShowPlayerSettings(true)}
            >
              <Icon name="settings" size={18} />
            </button>
          </div>
        </div>

      </div>

      {modeDialog}

      {showPlayerSettings && (
        <Modal title="Spelarinställningar" onClose={() => setShowPlayerSettings(false)}>
          <p>Inställningar för spelaren är inte implementerade ännu.</p>
          <p class="field-help">Det här är en mockruta för att reservera flödet tills spelarinställningarna finns.</p>
          <div class="modal-actions"><button class="btn btn-primary" type="button" onClick={() => setShowPlayerSettings(false)}>Stäng</button></div>
        </Modal>
      )}

      {showPreview && (
        <div class="pv-preview-popup" role="dialog" aria-label="Förhandsgranska sändningen">
          <div class="pv-preview-video">
            <button class="pv-preview-close" type="button" aria-label="Stäng förhandsgranskning" onClick={() => setShowPreview(false)}>
              <Icon name="close" size={20} />
            </button>
            {previewError && <div class="pv-preview-error">{previewError}</div>}
            <video ref={previewVideoRef} playsInline />
          </div>
        </div>
      )}
    </header>
  )
}
