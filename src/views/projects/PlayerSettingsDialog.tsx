import { useEffect, useMemo, useRef, useState } from 'preact/hooks'
import { Modal } from '../../components/Modal'
import type { Project } from '../../data/types'
import type { ProjectActions } from './actions'
import {
  MAX_PLAYER_TEXT_LENGTH,
  PLAYER_TEXT_FIELDS,
  POSTER_ACCEPTED_TYPES,
  TEXT_PLACEMENT_OPTIONS,
  changedSettings,
  textsOf,
  validatePosterFile,
} from './playerSettings'
import type { PlayerTextKey } from './playerSettings'
import type { TextPlacement } from '../../data/types'
import { InheritLayoutDialog } from './InheritLayoutDialog'
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
  const [placement, setPlacement] = useState<TextPlacement>(project.textPlacement)
  const [activeTextField, setActiveTextField] = useState<PlayerTextKey>(PLAYER_TEXT_FIELDS[0].key)
  const [muxEnabled, setMuxEnabled] = useState(project.muxEnabled)
  const [muxRespectDnt, setMuxRespectDnt] = useState(project.muxRespectDoNotTrack)
  const [posterFile, setPosterFile] = useState<File | null>(null)
  const [posterRemoved, setPosterRemoved] = useState(false)
  const [posterError, setPosterError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  // UNG-180: hämta layouten från ett annat projekt. Efteråt är dialogens lokala värden inaktuella, så den stängs.
  const [inheriting, setInheriting] = useState(false)
  const fileInput = useRef<HTMLInputElement>(null)

  const localPreview = useMemo(() => (posterFile ? URL.createObjectURL(posterFile) : null), [posterFile])
  useEffect(() => () => { if (localPreview) URL.revokeObjectURL(localPreview) }, [localPreview])

  const shownPoster = posterRemoved ? null : localPreview ?? project.posterUrl ?? null
  // Exempeltexten i förhandsvisningen: den valda flikens text, annars spelarens standardtext eller ett exempel.
  const activeField = PLAYER_TEXT_FIELDS.find((field) => field.key === activeTextField) ?? PLAYER_TEXT_FIELDS[0]
  const previewText = texts[activeField.key].trim() || activeField.fallback || 'Exempeltext'
  const changed = changedSettings(project, texts, placement, muxEnabled, muxRespectDnt)
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
    <>
    <Modal
      title="Spelarinställningar"
      onClose={onClose}
      // Esc och ✕ hör till den öppna layoutdialogen medan den visas, så båda dialogerna inte stängs på en gång.
      closeDisabled={inheriting}
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
        <h3>Layout från ett annat projekt</h3>
        <p class="ps-help">Hämta texter, textplacering och Mux-inställning från ett annat projekt. De ersätter dessa inställningar, efter bekräftelse.</p>
        <div class="ps-poster-actions">
          <button class="btn btn-sm" type="button" onClick={() => setInheriting(true)}>
            Hämta layout från projekt…
          </button>
        </div>
      </section>

      <section class="ps-section">
        <h3>Texter i spelaren</h3>
        <p class="ps-help">Texten som tittarna ser i respektive läge. Lämnas ett fält tomt används spelarens standardtext, om det finns någon.</p>
        <div class="ps-tabs" role="tablist" aria-label="Textläge">
          {PLAYER_TEXT_FIELDS.map((field) => (
            <button
              key={field.key}
              type="button"
              role="tab"
              id={`ps-tab-${field.key}`}
              aria-selected={activeTextField === field.key}
              aria-controls={`ps-tabpanel-${field.key}`}
              class={`ps-tab${activeTextField === field.key ? ' active' : ''}`}
              onClick={() => setActiveTextField(field.key)}
            >
              {field.label}
            </button>
          ))}
        </div>
        {PLAYER_TEXT_FIELDS.map((field) => (
          <div
            key={field.key}
            role="tabpanel"
            id={`ps-tabpanel-${field.key}`}
            aria-labelledby={`ps-tab-${field.key}`}
            hidden={activeTextField !== field.key}
            class="ps-field"
          >
            <textarea
              id={`ps-${field.key}`}
              rows={4}
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

        <div class="ps-placement">
          <span id="ps-placement-label" class="ps-placement-label">Placering i videofönstret</span>
          <div class="ps-seg" role="radiogroup" aria-labelledby="ps-placement-label">
            {TEXT_PLACEMENT_OPTIONS.map((option) => (
              <button
                key={option.value}
                type="button"
                role="radio"
                aria-checked={placement === option.value}
                class={`ps-seg-option${placement === option.value ? ' active' : ''}`}
                onClick={() => setPlacement(option.value)}
              >
                {option.label}
              </button>
            ))}
          </div>
          <span class="ps-help">Gäller alla fyra texterna. Välj överkant eller underkant om posterns grafik ligger i mitten.</span>
        </div>
      </section>

      <section class="ps-section">
        <h3>Poster</h3>
        <p class="ps-help">Bilden visas i spelaren när ingen video spelas, t.ex. före sändningen och när inspelningen inte är klar.</p>
        <div class="ps-poster" aria-label="Förhandsvisning av poster och text">
          {shownPoster ? <img src={shownPoster} alt="Poster" /> : <span>Ingen poster</span>}
          <span class={`ps-poster-text ps-poster-text-${placement}`}>{previewText}</span>
        </div>
        <p class="ps-help">Förhandsvisningen visar vald placering med texten från den valda fliken.</p>
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

      <section class="ps-section">
        <h3>Uppspelningsmätning</h3>
        <p class="ps-help">
          Spelaren skickar anonym uppspelningsdata (kvalitet, buffring och fel) till Mux, till hjälp vid felsökning. Inga cookies används
          och tittarna identifieras inte.
        </p>
        <label class="ps-switch">
          <input
            type="checkbox"
            checked={muxEnabled}
            onChange={(e) => setMuxEnabled((e.target as HTMLInputElement).checked)}
          />
          <span>Mät uppspelning med Mux</span>
        </label>
        <label class="ps-switch">
          <input
            type="checkbox"
            checked={muxRespectDnt}
            disabled={!muxEnabled}
            onChange={(e) => setMuxRespectDnt((e.target as HTMLInputElement).checked)}
          />
          <span>Respektera tittarens "Do Not Track"</span>
        </label>
        <span class="ps-help">Av som standard: alla visningar mäts. Slås det på mäts inte tittare vars webbläsare har Do Not Track aktiverat.</span>
        <label class="ps-mux-key">
          <span class="ps-placement-label">Mux env key</span>
          <input type="text" readOnly value={project.muxEnvKey ?? ''} placeholder="Ingen nyckel konfigurerad" aria-label="Mux env key (skrivskyddad)" />
        </label>
        <span class="ps-help">Nyckeln ställs in per domän av en administratör. Utan egen nyckel används ungaps standardnyckel.</span>
      </section>
    </Modal>
    {inheriting && (
      <InheritLayoutDialog project={project} actions={actions} onCancel={() => setInheriting(false)} onDone={() => { setInheriting(false); onClose() }} />
    )}
    </>
  )
}
