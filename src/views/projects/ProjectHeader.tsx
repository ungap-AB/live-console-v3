import { useRef, useState } from 'preact/hooks'
import { Icon } from '../../components/Icon'
import { Modal } from '../../components/Modal'
import { Clock } from '../../components/Clock'
import type { Project, Visibility } from '../../data/types'
import { formatDate } from '../../app/time'
import type { ProjectActions } from './actions'
import { useModeChange } from './useModeChange'
import { MODES, MODE_LABEL } from './projectMode'
import './ProjectHeader.css'

interface ProjectHeaderProps {
  project: Project
  actions: ProjectActions
  onBack: () => void
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
export function ProjectHeader({ project: p, actions, onBack }: ProjectHeaderProps) {
  const [editingTitle, setEditingTitle] = useState(false)
  const [titleDraft, setTitleDraft] = useState(p.name)
  const { selectMode, dialog: modeDialog } = useModeChange(p, actions)
  const [showSettings, setShowSettings] = useState(false)
  const [copied, setCopied] = useState(false)
  const settingsButton = useRef<HTMLButtonElement>(null)

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
        <span class="pv-clock"><Clock /></span>
        <button class="btn" type="button" ref={settingsButton} onClick={() => setShowSettings(true)}>
          <Icon name="settings" size={18} />
          <span>Projektinställningar</span>
        </button>
      </div>

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
                onClick={() => selectMode(mode)}
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
