import { useState } from 'preact/hooks'
import { Modal } from '../../components/Modal'
import { formatHms } from '../../app/time'
import { validateCaptionFile } from './captionsCheck'

export type VttTimeline = 'published' | 'original'

interface VttImportDialogProps {
  projectName: string
  /** Den publicerade delens start i originalets tid, när videon är trimmad. Saknas den finns bara originalets tidslinje. */
  publishedStart?: number
  hasCaptions: boolean
  /** Antal osparade ändringar (sparas först). */
  dirtyCount: number
  busy: boolean
  error: string
  onImport: (file: File, timeline: VttTimeline) => void
  onClose: () => void
}

// UNG-272: en egen VTT-fil läses in som redigerarens utkast. Den syns inte för tittarna förrän den publiceras. Filens tider kan räknas
// från den publicerade (trimmade) videons start eller från originalinspelningens.
export function VttImportDialog({ projectName, publishedStart, hasCaptions, dirtyCount, busy, error, onImport, onClose }: VttImportDialogProps) {
  const trimmed = publishedStart !== undefined && publishedStart > 0
  const [timeline, setTimeline] = useState<VttTimeline>(trimmed ? 'published' : 'original')
  const [file, setFile] = useState<File | null>(null)
  const problem = file ? validateCaptionFile(file) : null

  return (
    <Modal
      title="Läs in VTT-fil"
      subtitle={projectName}
      closeDisabled={busy}
      onClose={onClose}
      footer={<>
        <button class="btn" type="button" disabled={busy} onClick={onClose}>Avbryt</button>
        <button class="btn btn-primary" type="button" disabled={busy || !file || Boolean(problem)} onClick={() => file && onImport(file, timeline)}>
          {busy ? 'Läser in…' : dirtyCount > 0 ? 'Spara och läs in' : 'Läs in'}
        </button>
      </>}
    >
      <div class="ce-vtt-import">
        <input
          type="file"
          accept=".vtt,text/vtt"
          aria-label="Välj VTT-fil"
          disabled={busy}
          onChange={(event) => setFile(event.currentTarget.files?.[0] ?? null)}
        />
        {trimmed && (
          <fieldset class="ce-vtt-timeline">
            <legend>Filens tider räknas från</legend>
            <label>
              <input type="radio" name="vtt-timeline" checked={timeline === 'published'} onChange={() => setTimeline('published')} />
              Den publicerade videons start ({formatHms(publishedStart)} i originalet)
            </label>
            <label>
              <input type="radio" name="vtt-timeline" checked={timeline === 'original'} onChange={() => setTimeline('original')} />
              Originalinspelningens start
            </label>
          </fieldset>
        )}
        <p class="ce-vtt-help">
          Filen blir ett utkast i redigeraren{hasCaptions ? ' och ersätter nuvarande arbetsversion (den finns kvar i versionshistoriken)' : ''}.
          Tittarna ser den först när du publicerar.
          {dirtyCount > 0 ? ` Dina ${dirtyCount} osparade ändringar sparas först.` : ''}
        </p>
        {problem && <p class="ce-vtt-error" role="alert">{problem}</p>}
        {error && <p class="ce-vtt-error" role="alert">{error}</p>}
      </div>
    </Modal>
  )
}
