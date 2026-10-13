import { useRef, useState } from 'preact/hooks'
import { useDismiss } from '../../app/useDismiss'
import { Icon } from '../../components/Icon'
import type { Project } from '../../data/types'
import type { ProjectActions } from './actions'
import './ProjectHeader.css'

interface PlayerLinkFieldProps {
  project: Project
  actions: ProjectActions
  /** Etiketten "Spelarlänk" ovanför fältet (standard). Utan den under spelaren i översikten. */
  label?: boolean
}

// Spelarlänken: öppen/stängd för publik, adressen, kopiera, IFRAME-alternativ och öppna i ny flik. Låg i projektets huvud, ligger nu
// överst i spelarinställningarna.
export function PlayerLinkField({ project: p, actions, label = true }: PlayerLinkFieldProps) {
  const [copied, setCopied] = useState(false)
  const [iframeCopied, setIframeCopied] = useState(false)
  const [showIframeMenu, setShowIframeMenu] = useState(false)
  const iframeMenuRef = useRef<HTMLDivElement>(null)
  useDismiss(showIframeMenu, iframeMenuRef, () => setShowIframeMenu(false))

  function toggleVisibility() {
    const next = p.visibility === 'open' ? 'closed' : 'open'
    if (p.publicMode === 'after' && next === 'open') return
    void actions.setVisibility(next)
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
    setShowIframeMenu(false)
    const iframe = `<iframe src="${p.playerUrl}" title="${p.name.replaceAll('"', '&quot;')}" allow="autoplay; fullscreen" allowfullscreen></iframe>`
    try {
      await navigator.clipboard.writeText(iframe)
      setIframeCopied(true)
      setTimeout(() => setIframeCopied(false), 1500)
    } catch {
      // Kopieringen misslyckas tyst; länken är fortfarande tillgänglig.
    }
  }

  function openIframeExample() {
    setShowIframeMenu(false)
    // host.html är den skyltade exempelsidan (engelska texter, ungap Presenter-logga) — visar hur inbäddningen ser ut för en värdsida.
    const base = p.playerUrl.split('?')[0]
    window.open(`${base}host.html?p=${p.id}`, '_blank', 'noopener,noreferrer')
  }

  return (
    <div class="pv-field pv-link-field">
      {label && <div class="pv-label">Spelarlänk</div>}
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
        <span class="pv-link-url" title={p.playerUrl}>{p.playerUrl.replace(/^https?:\/\//, '')}</span>
        <button class="pv-icon-btn" type="button" aria-label={copied ? 'Länken kopierad' : 'Kopiera spelarlänk'} onClick={() => void copyLink()}>
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
              <button type="button" role="menuitem" onClick={() => void copyIframe()}>Kopiera IFRAME-kod</button>
              <button type="button" role="menuitem" onClick={openIframeExample}>Öppna exempelsida</button>
            </div>
          )}
        </div>
        <a class="pv-icon-btn" href={p.playerUrl} target="_blank" rel="noopener noreferrer" aria-label="Öppna spelaren i ny flik">
          <Icon name="open_in_new" size={18} />
        </a>
      </div>
    </div>
  )
}

/** Raden under spelaren i översikten: Spelarinställningar… och spelarlänken med sina knappar. */
export function PlayerFooter({ project, actions, onSettings }: { project: Project; actions: ProjectActions; onSettings: () => void }) {
  return (
    <div class="pp-foot">
      <button class="btn btn-sm" type="button" onClick={onSettings}><Icon name="settings" size={18} /> Spelarinställningar…</button>
      <PlayerLinkField project={project} actions={actions} label={false} />
    </div>
  )
}
