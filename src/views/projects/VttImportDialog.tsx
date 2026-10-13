import { plural, t } from '@lingui/core/macro'
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
function publishedStartText(start: string): string {
  return t`The start of the published video (${start} in the original)`
}

export function VttImportDialog({ projectName, publishedStart, hasCaptions, dirtyCount, busy, error, onImport, onClose }: VttImportDialogProps) {
  const trimmed = publishedStart !== undefined && publishedStart > 0
  const [timeline, setTimeline] = useState<VttTimeline>(trimmed ? 'published' : 'original')
  const [file, setFile] = useState<File | null>(null)
  const problem = file ? validateCaptionFile(file) : null

  return (
    <Modal
      title={t`Import VTT file`}
      subtitle={projectName}
      closeDisabled={busy}
      onClose={onClose}
      footer={<>
        <button class="btn" type="button" disabled={busy} onClick={onClose}>{t`Cancel`}</button>
        <button class="btn btn-primary" type="button" disabled={busy || !file || Boolean(problem)} onClick={() => file && onImport(file, timeline)}>
          {busy ? t`Importing…` : dirtyCount > 0 ? t`Save and import` : t({ message: 'Import', context: 'caption file' })}
        </button>
      </>}
    >
      <div class="ce-vtt-import">
        <input
          type="file"
          accept=".vtt,text/vtt"
          aria-label={t`Choose VTT file`}
          disabled={busy}
          onChange={(event) => setFile(event.currentTarget.files?.[0] ?? null)}
        />
        {trimmed && (
          <fieldset class="ce-vtt-timeline">
            <legend>{t`The file's times are counted from`}</legend>
            <label>
              <input type="radio" name="vtt-timeline" checked={timeline === 'published'} onChange={() => setTimeline('published')} />
              {publishedStartText(formatHms(publishedStart))}
            </label>
            <label>
              <input type="radio" name="vtt-timeline" checked={timeline === 'original'} onChange={() => setTimeline('original')} />
              {t`The start of the original recording`}
            </label>
          </fieldset>
        )}
        <p class="ce-vtt-help">
          {hasCaptions
            ? t`The file becomes a draft in the editor and replaces the current working version (it remains in the version history). Viewers see it only when you publish.`
            : t`The file becomes a draft in the editor. Viewers see it only when you publish.`}
          {dirtyCount > 0 ? ' ' + plural(dirtyCount, { one: 'Your # unsaved change is saved first.', other: 'Your # unsaved changes are saved first.' }) : ''}
        </p>
        {problem && <p class="ce-vtt-error" role="alert">{problem}</p>}
        {error && <p class="ce-vtt-error" role="alert">{error}</p>}
      </div>
    </Modal>
  )
}
