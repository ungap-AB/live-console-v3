import { t } from '@lingui/core/macro'
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
import type { Channel, TextPlacement } from '../../data/types'
import { IngestInfoPanel } from './IngestInfoPanel'
import { InheritLayoutDialog } from './InheritLayoutDialog'
import { LiveHlsField } from './LiveHlsField'
import { PlayerLinkField } from './PlayerLinkField'
import './PlayerSettingsDialog.css'

// Dialogen är indelad i flikar efter kategori; alla flikar sparas tillsammans med Spara.
const CATEGORIES = [
  { key: 'link', get label() { return t`Link` } },
  { key: 'ingest', get label() { return t`Ingest` } },
  { key: 'look', get label() { return t`Texts and poster` } },
  { key: 'playback', get label() { return t`Playback` } },
  { key: 'stats', get label() { return t`Measurement` } },
] as const
export type PlayerSettingsCategory = (typeof CATEGORIES)[number]['key']

interface PlayerSettingsDialogProps {
  project: Project
  actions: ProjectActions
  /** Kanalens live-HLS-adress, när projektet har en ingest. */
  liveHlsUrl?: string | null
  /** The ingest (Ingest tab): channel, stream key, creating and tearing down (UNG-305). Without a channel the tab offers Create ingest when onCreate is given. */
  ingest?: { channel: Channel | null; streamKey: string | null; onCreate?: () => Promise<void>; onTeardown: () => Promise<void> | void } | null
  /** Fliken som dialogen öppnas på (knappen Ingest info öppnar Ingest). */
  initialCategory?: PlayerSettingsCategory
  onClose: () => void
}

// Texter och poster sparas tillsammans med en gemensam "Spara" — ingenting skrivs förrän
// operatören bekräftar, och en vald bild förhandsvisas lokalt tills dess.
export function PlayerSettingsDialog({ project, actions, liveHlsUrl = null, ingest = null, initialCategory = 'link', onClose }: PlayerSettingsDialogProps) {
  const [texts, setTexts] = useState(() => textsOf(project))
  const [placement, setPlacement] = useState<TextPlacement>(project.textPlacement)
  const [category, setCategory] = useState<PlayerSettingsCategory>(initialCategory)
  const [activeTextField, setActiveTextField] = useState<PlayerTextKey>(PLAYER_TEXT_FIELDS[0].key)
  const [muxEnabled, setMuxEnabled] = useState(project.muxEnabled)
  const [muxRespectDnt, setMuxRespectDnt] = useState(project.muxRespectDoNotTrack)
  const [dvrEnabled, setDvrEnabled] = useState(project.dvrEnabled)
  const [exclamationsAsSpeakers, setExclamationsAsSpeakers] = useState(project.exclamationsAsSpeakers)
  const [liveOnly, setLiveOnly] = useState(project.liveOnly)
  const [posterFile, setPosterFile] = useState<File | null>(null)
  const [posterRemoved, setPosterRemoved] = useState(false)
  const [posterError, setPosterError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [creatingIngest, setCreatingIngest] = useState(false)

  async function createIngest() {
    if (!ingest?.onCreate) return
    setCreatingIngest(true)
    try {
      await ingest.onCreate()
    } finally {
      setCreatingIngest(false)
    }
  }
  // UNG-180: hämta layouten från ett annat projekt. Efteråt är dialogens lokala värden inaktuella, så den stängs.
  const [inheriting, setInheriting] = useState(false)
  const fileInput = useRef<HTMLInputElement>(null)

  const localPreview = useMemo(() => (posterFile ? URL.createObjectURL(posterFile) : null), [posterFile])
  useEffect(() => () => { if (localPreview) URL.revokeObjectURL(localPreview) }, [localPreview])

  const shownPoster = posterRemoved ? null : localPreview ?? project.posterUrl ?? null
  // Exempeltexten i förhandsvisningen: den valda flikens text, annars spelarens standardtext eller ett exempel.
  const activeField = PLAYER_TEXT_FIELDS.find((field) => field.key === activeTextField) ?? PLAYER_TEXT_FIELDS[0]
  const previewText = texts[activeField.key].trim() || activeField.fallback || t`Example text`
  const changed = changedSettings(project, texts, placement, muxEnabled, muxRespectDnt, dvrEnabled, exclamationsAsSpeakers, liveOnly)
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
      title={t`Player settings`}
      onClose={onClose}
      // Esc och ✕ hör till den öppna layoutdialogen medan den visas, så båda dialogerna inte stängs på en gång.
      closeDisabled={inheriting}
      wide
      footer={
        <>
          <button class="btn btn-sm" type="button" onClick={onClose}>
            {t`Cancel`}
          </button>
          <button class="btn btn-sm btn-primary" type="button" disabled={!dirty || saving} onClick={save}>
            {saving ? t`Saving…` : t`Save`}
          </button>
        </>
      }
    >
      <div class="ps-cats" role="tablist" aria-label={t`Category`}>
        {CATEGORIES.map((item) => (
          <button
            key={item.key}
            type="button"
            role="tab"
            id={`ps-cat-tab-${item.key}`}
            aria-selected={category === item.key}
            aria-controls={`ps-cat-${item.key}`}
            class={`ps-cat-tab${category === item.key ? ' active' : ''}`}
            onClick={() => setCategory(item.key)}
          >
            {item.label}
          </button>
        ))}
      </div>

      {/* Panelerna ligger i samma rutnätscell, så dialogen har den högsta panelens storlek oavsett flik. */}
      <div class="ps-cat-stack">
      <div class="ps-cat" role="tabpanel" id="ps-cat-link" aria-labelledby="ps-cat-tab-link" hidden={category !== 'link'}>
      <section class="ps-section">
        <h3>{t`Link and addresses`}</h3>
        <p class="ps-help">{t`Open or close the player to the public (takes effect immediately), copy the link or the embed code.`}</p>
        <div class="ps-links">
          <PlayerLinkField project={project} actions={actions} />
          {liveHlsUrl && <LiveHlsField url={liveHlsUrl} />}
          {project.publicMode === 'ondemand' && project.recording?.hlsUrl && project.recording.state !== 'awaitingApproval' && (
            <LiveHlsField url={project.recording.hlsUrl} label={t`On-demand HLS (published video)`} warning={null} copyLabel={t`Copy the on-demand HLS address`} />
          )}
        </div>
      </section>

      </div>

      <div class="ps-cat" role="tabpanel" id="ps-cat-ingest" aria-labelledby="ps-cat-tab-ingest" hidden={category !== 'ingest'}>
      <section class="ps-section">
        <h3>{t`Ingest`}</h3>
        <p class="ps-help">{t`The details the encoder sends to. The live HLS address is under the Link tab.`}</p>
        {ingest?.channel
          ? <IngestInfoPanel channel={ingest.channel} streamKey={ingest.streamKey} onTeardown={ingest.onTeardown} />
          : ingest && (project.channel || creatingIngest)
            ? <p class="ps-help">{t`Loading the ingest…`}</p>
            : (
              <>
                <p class="ps-help">{t`No ingest created.`}</p>
                {ingest?.onCreate && (
                  <button class="btn btn-primary" type="button" onClick={() => void createIngest()}>
                    {t`Create ingest`}
                  </button>
                )}
              </>
            )}
      </section>
      </div>

      <div class="ps-cat" role="tabpanel" id="ps-cat-look" aria-labelledby="ps-cat-tab-look" hidden={category !== 'look'}>
      <section class="ps-section">
        <h3>{t`Layout from another project`}</h3>
        <p class="ps-help">{t`Get all the player settings and the poster image from another project. They replace these settings, after confirmation.`}</p>
        <div class="ps-poster-actions">
          <button class="btn btn-sm" type="button" onClick={() => setInheriting(true)}>
            {t`Get layout from project…`}
          </button>
        </div>
      </section>

      <section class="ps-section">
        <h3>{t`Texts in the player`}</h3>
        <p class="ps-help">{t`The text the viewers see in each mode. If a field is left empty, the player's default text is used, if there is one.`}</p>
        <div class="ps-tabs" role="tablist" aria-label={t`Text mode`}>
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
              placeholder={field.fallback ?? t`No text is shown`}
              onInput={(e) => {
                const value = (e.target as HTMLTextAreaElement).value
                setTexts((current) => ({ ...current, [field.key]: value }))
              }}
            />
            <span class="ps-help">{field.when}</span>
          </div>
        ))}

        <div class="ps-placement">
          <span id="ps-placement-label" class="ps-placement-label">{t`Placement in the video window`}</span>
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
          <span class="ps-help">{t`Applies to all four texts. Choose top or bottom edge if the poster's graphics are in the middle.`}</span>
        </div>
      </section>

      <section class="ps-section">
        <h3>{t`Poster`}</h3>
        <p class="ps-help">{t`The image is shown in the player when no video is playing, e.g. before the broadcast and when the recording is not ready.`}</p>
        <div class="ps-poster" aria-label={t`Preview of poster and text`}>
          {shownPoster ? <img src={shownPoster} alt={t`Poster`} /> : <span>{t`No poster`}</span>}
          <span class={`ps-poster-text ps-poster-text-${placement}`}>{previewText}</span>
        </div>
        <p class="ps-help">{t`The preview shows the chosen placement with the text from the chosen tab.`}</p>
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
            {shownPoster ? t`Change image…` : t`Choose image…`}
          </button>
          {shownPoster && (
            <button class="btn btn-sm" type="button" onClick={clearPoster}>
              {t`Remove`}
            </button>
          )}
        </div>
        {posterError && <p class="ps-error" role="alert">{posterError}</p>}
        <p class="ps-help">{t`JPG, PNG or WebP, at most 5 MB. Recommended format 16:9, e.g. 1920×1080.`}</p>
      </section>

      </div>

      <div class="ps-cat" role="tabpanel" id="ps-cat-playback" aria-labelledby="ps-cat-tab-playback" hidden={category !== 'playback'}>
      <section class="ps-section">
        <h3>{t`Speakers in the agenda`}</h3>
        <p class="ps-help">
          {t`During a live broadcast the player lists the speakers under each agenda item as they are shown with a name sign. The list is filled in with a delay of a few tens of seconds.`}
        </p>
        <label class="ps-switch">
          <input
            type="checkbox"
            checked={exclamationsAsSpeakers}
            onChange={(e) => setExclamationsAsSpeakers((e.target as HTMLInputElement).checked)}
          />
          <span>{t`Count announcements as speakers`}</span>
        </label>
        <span class="ps-help">{t`Off by default. Announcements (free texts shown as a name sign) are then also listed under the item.`}</span>
      </section>

      <section class="ps-section">
        <h3>{t`Live only`}</h3>
        <p class="ps-help">
          {t`A marker for projects that are only to be used for live viewing, for example a full-day session that is not to be published on demand in its entirety. It changes nothing: recording, rewinding and creating on-demand projects work as usual. It is shown as a label in the project list and in the project header, and you can remove it whenever you want.`}
        </p>
        <label class="ps-switch">
          <input type="checkbox" checked={liveOnly} onChange={(e) => setLiveOnly((e.target as HTMLInputElement).checked)} />
          <span>{t`Mark as live only`}</span>
        </label>
      </section>

      <section class="ps-section">
        <h3>{t`Rewind in a live broadcast`}</h3>
        <p class="ps-help">
          {t`The viewers can pause the live broadcast, rewind and jump to an earlier agenda item, and then go back to live. Only what was broadcast publicly can be watched afterwards.`}
        </p>
        <label class="ps-switch">
          <input
            type="checkbox"
            checked={dvrEnabled}
            onChange={(e) => setDvrEnabled((e.target as HTMLInputElement).checked)}
          />
          <span>{t`Let the viewers rewind`}</span>
        </label>
        <span class="ps-help">{t`Off by default. Takes effect for viewers who reload the player.`}</span>
      </section>

      </div>

      <div class="ps-cat" role="tabpanel" id="ps-cat-stats" aria-labelledby="ps-cat-tab-stats" hidden={category !== 'stats'}>
      <section class="ps-section">
        <h3>{t`Playback measurement`}</h3>
        <p class="ps-help">
          {t`The player sends anonymous playback data (quality, buffering and errors) to Mux, to help with troubleshooting. No cookies are used and the viewers are not identified.`}
        </p>
        <label class="ps-switch">
          <input
            type="checkbox"
            checked={muxEnabled}
            onChange={(e) => setMuxEnabled((e.target as HTMLInputElement).checked)}
          />
          <span>{t`Measure playback with Mux`}</span>
        </label>
        <label class="ps-switch">
          <input
            type="checkbox"
            checked={muxRespectDnt}
            disabled={!muxEnabled}
            onChange={(e) => setMuxRespectDnt((e.target as HTMLInputElement).checked)}
          />
          <span>{t`Respect the viewer's "Do Not Track"`}</span>
        </label>
        <span class="ps-help">{t`Off by default: all views are measured. When it is on, viewers whose browser has Do Not Track enabled are not measured.`}</span>
        <label class="ps-mux-key">
          <span class="ps-placement-label">{t`Mux env key`}</span>
          <input type="text" readOnly value={project.muxEnvKey ?? ''} placeholder={t`No key configured`} aria-label={t`Mux env key (read-only)`} />
        </label>
        <span class="ps-help">{t`The key is set per domain by an administrator. Without a key of its own, ungap's default key is used.`}</span>
      </section>
      </div>

      </div>
    </Modal>
    {inheriting && (
      <InheritLayoutDialog project={project} actions={actions} onCancel={() => setInheriting(false)} onDone={() => { setInheriting(false); onClose() }} />
    )}
    </>
  )
}
