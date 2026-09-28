import { useEffect, useMemo, useRef, useState } from 'preact/hooks'
import { Modal } from '../../components/Modal'
import type { Project } from '../../data/types'
import type { ProjectActions } from './actions'
import {
  MAX_PLAYER_TEXT_LENGTH,
  PLAYER_TEXT_FIELDS,
  POSTER_ACCEPTED_TYPES,
  changedTexts,
  textsOf,
  validatePosterFile,
} from './playerSettings'
import './PlayerSettingsDialog.css'

interface PlayerSettingsDialogProps {
  project: Project
  actions: ProjectActions
  onClose: () => void
}

// Texter och poster sparas tillsammans med en gemensam "Spara" — ingenting skrivs förrän
// operatören bekräftar, och en vald bild förhandsvisas lokalt tills dess.
export function PlayerSettingsDialog({ project, actions, onClose }: PlayerSettingsDialogProps) {
  const [texts, setTexts] = useState(() => textsOf(project))
  const [posterFile, setPosterFile] = useState<File | null>(null)
  const [posterRemoved, setPosterRemoved] = useState(false)
  const [posterError, setPosterError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const fileInput = useRef<HTMLInputElement>(null)

  const localPreview = useMemo(() => (posterFile ? URL.createObjectURL(posterFile) : null), [posterFile])
  useEffect(() => () => { if (localPreview) URL.revokeObjectURL(localPreview) }, [localPreview])

  const shownPoster = posterRemoved ? null : localPreview ?? project.posterUrl ?? null
  const changed = changedTexts(project, texts)
  const dirty = changed !== null || posterFile !== null || (posterRemoved && Boolean(project.posterUrl))

  function choosePoster(file: File | undefined) {
    if (!file) return
    const error = validatePosterFile(file)
    setPosterError(error)
    if (error) return
    setPosterFile(file)
    setPosterRemoved(false)
  }

  function clearPoster() {
    setPosterFile(null)
    setPosterError(null)
    setPosterRemoved(Boolean(project.posterUrl))
  }

  async function save() {
    if (!dirty) return
    setSaving(true)
    try {
      // Stannar vid första felet (toast visas av actions) och lämnar dialogen öppen så inget går förlorat.
      if (changed && !(await actions.rename(project.name, changed))) return
      if (posterFile) {
        if (!(await actions.setPoster(posterFile))) return
        setPosterFile(null)
      } else if (posterRemoved && project.posterUrl) {
        if (!(await actions.removePoster())) return
      }
      onClose()
    } finally {
      setSaving(false)
    }
  }

  return (
    <Modal
      title="Spelarinställningar"
      onClose={onClose}
      wide
      footer={
        <>
          <button class="btn btn-sm" type="button" onClick={onClose}>
            Avbryt
          </button>
          <button class="btn btn-sm btn-primary" type="button" disabled={!dirty || saving} onClick={save}>
            {saving ? 'Sparar…' : 'Spara'}
          </button>
        </>
      }
    >
      <section class="ps-section">
        <h3>Texter i spelaren</h3>
        <p class="ps-help">Texten som tittarna ser i respektive läge. Lämnas ett fält tomt används spelarens standardtext, om det finns någon.</p>
        {PLAYER_TEXT_FIELDS.map((field) => (
          <div class="ps-field" key={field.key}>
            <label for={`ps-${field.key}`}>{field.label}</label>
            <textarea
              id={`ps-${field.key}`}
              rows={2}
              maxLength={MAX_PLAYER_TEXT_LENGTH}
              value={texts[field.key]}
              placeholder={field.fallback ?? 'Ingen text visas'}
              onInput={(e) => {
                const value = (e.target as HTMLTextAreaElement).value
                setTexts((current) => ({ ...current, [field.key]: value }))
              }}
            />
            <span class="ps-help">{field.when}</span>
          </div>
        ))}
      </section>

      <section class="ps-section">
        <h3>Poster</h3>
        <p class="ps-help">Bilden visas i spelaren när ingen video spelas, t.ex. före sändningen och när inspelningen inte är klar.</p>
        <div class="ps-poster" aria-label="Förhandsvisning av poster">
          {shownPoster ? <img src={shownPoster} alt="Poster" /> : <span>Ingen poster</span>}
        </div>
        <div class="ps-poster-actions">
          <input
            ref={fileInput}
            class="ps-file"
            type="file"
            accept={POSTER_ACCEPTED_TYPES.join(',')}
            onChange={(e) => {
              const input = e.target as HTMLInputElement
              choosePoster(input.files?.[0])
              input.value = ''
            }}
          />
          <button class="btn btn-sm" type="button" onClick={() => fileInput.current?.click()}>
            {shownPoster ? 'Byt bild…' : 'Välj bild…'}
          </button>
          {shownPoster && (
            <button class="btn btn-sm" type="button" onClick={clearPoster}>
              Ta bort
            </button>
          )}
        </div>
        {posterError && <p class="ps-error" role="alert">{posterError}</p>}
        <p class="ps-help">JPG, PNG eller WebP, högst 5 MB. Rekommenderat format 16:9, t.ex. 1920×1080.</p>
      </section>
    </Modal>
  )
}
