import { useRef, useState } from 'preact/hooks'
import { client } from '../../data'
import type { ProjectCaptions } from '../../data/types'
import { formatDateTime } from '../../app/time'
import { ConfirmModal } from '../../components/ConfirmModal'
import { captionsLengthWarning, validateCaptionFile } from './captionsCheck'
import './CaptionsPanel.css'

interface CaptionsPanelProps {
  projectId: string
  captions: ProjectCaptions | null
  /** Längden på den publicerade videon, för att varna om undertexten inte hör till den. */
  videoDurationSeconds?: number
  /** Anropas när undertexten laddats upp eller tagits bort, så projektet kan hämtas om. */
  onChanged: () => void
}

// UNG-94: undertexter (WebVTT) för den inspelning som publiceras: den trimmade versionen om du trimmat, annars
// originalet. Filen skapas i ett externt verktyg och laddas upp här; tiderna ska räknas från den publicerade videons start. Spelaren visar undertexten via
// webbläsarens egna undertextmeny, av tills tittaren väljer.
export function CaptionsPanel({ projectId, captions, videoDurationSeconds, onChanged }: CaptionsPanelProps) {
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [justUploaded, setJustUploaded] = useState<ProjectCaptions | null>(null)
  const [confirmRemove, setConfirmRemove] = useState(false)
  const fileInput = useRef<HTMLInputElement>(null)

  async function upload(file: File | undefined) {
    if (!file) return
    const problem = validateCaptionFile(file)
    if (problem) {
      setError(problem)
      return
    }
    setBusy(true)
    setError('')
    try {
      setJustUploaded(await client.projects.setCaptions(projectId, file))
      onChanged()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Undertexten kunde inte laddas upp.')
    } finally {
      setBusy(false)
    }
  }

  async function remove() {
    setConfirmRemove(false)
    setBusy(true)
    setError('')
    try {
      await client.projects.removeCaptions(projectId)
      setJustUploaded(null)
      onChanged()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Undertexten kunde inte tas bort.')
    } finally {
      setBusy(false)
    }
  }

  const shown = captions ?? justUploaded
  const warning = shown ? captionsLengthWarning(shown, videoDurationSeconds) : null

  return (
    <section class="captions-panel" aria-label="Undertexter">
      <h3>Undertexter</h3>
      <input
        ref={fileInput}
        class="captions-file"
        type="file"
        accept=".vtt,text/vtt"
        aria-label="Välj VTT-fil"
        onChange={(event) => {
          const input = event.currentTarget
          void upload(input.files?.[0])
          input.value = ''
        }}
      />
      {shown ? (
        <>
          <p class="captions-current">
            {shown.label} · {shown.cueCount.toLocaleString('sv-SE')} repliker · uppladdad {formatDateTime(shown.uploadedAt)}
          </p>
          <div class="captions-actions">
            <button class="btn btn-sm" type="button" disabled={busy} onClick={() => fileInput.current?.click()}>
              {busy ? 'Laddar upp…' : 'Ersätt…'}
            </button>
            <button class="btn btn-sm" type="button" disabled={busy} onClick={() => setConfirmRemove(true)}>
              Ta bort
            </button>
          </div>
        </>
      ) : (
        <div class="captions-actions">
          <button class="btn btn-sm" type="button" disabled={busy} onClick={() => fileInput.current?.click()}>
            {busy ? 'Laddar upp…' : 'Ladda upp VTT-fil…'}
          </button>
        </div>
      )}
      <p class="captions-help">
        Gäller videon som publiceras, alltså den trimmade versionen om du trimmat, annars originalet. Filen ska vara gjord
        från just den videon, så att tiderna räknas från dess start. Tittarna väljer själva att visa undertexterna i spelaren.
      </p>
      {warning && <p class="captions-warning" role="alert">{warning}</p>}
      {error && <p class="captions-error" role="alert">{error}</p>}

      {confirmRemove && (
        <ConfirmModal title="Ta bort undertexterna?" confirmLabel="Ta bort" danger onCancel={() => setConfirmRemove(false)} onConfirm={() => void remove()}>
          <p>Undertexterna försvinner från spelaren. Du kan ladda upp filen igen när som helst.</p>
        </ConfirmModal>
      )}
    </section>
  )
}
