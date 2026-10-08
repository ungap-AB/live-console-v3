import { openJobsView } from '../../app/jobsBus'
import { NotifyCheckbox } from '../../components/NotifyCheckbox'

export interface DownloadState {
  status: 'starting' | 'queued' | 'ready' | 'error'
  url?: string
  message?: string
}

// UNG-58: nedladdningsknappen med "Förbereder… → riktig länk", flyttad till dialogen Exportera och importera.
export interface DownloadButtonProps {
  label: string
  fileName: string
  download?: DownloadState
  onDownload: () => void
  /** Delar den färdiga filen via en länk (visas när filen är klar). */
  onShare?: () => void
}

// UNG-58: samma "Förbereder… → riktig länk"-mönster som Videoarkivets nedladdningsknapp.
export function DownloadButton({ label, fileName, download, onDownload, onShare }: DownloadButtonProps) {
  if (download?.status === 'starting') {
    return <button class="btn btn-sm" type="button" disabled>Startar…</button>
  }
  if (download?.status === 'queued') {
    return (
      <span class="od-download-ready">
        <span>Nedladdningen förbereds. Du får en avisering när den är klar.</span>
        <button class="btn btn-sm" type="button" onClick={openJobsView}>
          Visa jobb
        </button>
      </span>
    )
  }
  if (download?.status === 'ready' && download.url) {
    return (
      <span class="od-download-ready">
        <a class="btn btn-sm" href={download.url} download>
          Ladda ner {fileName}.mp4
        </a>
        <button class="btn btn-sm" type="button" onClick={onDownload}>
          Förbered på nytt
        </button>
        {onShare && (
          <button class="btn btn-sm" type="button" onClick={onShare}>
            Dela…
          </button>
        )}
      </span>
    )
  }
  return (
    <span class="od-download-start">
      <button
        class="btn btn-sm"
        type="button"
        onClick={onDownload}
        title="Förbereder en nedladdningsbar fil (kan ta några minuter). Filen sparas i 7 dagar."
      >
        {label}
      </button>
      <NotifyCheckbox />
      {download?.status === 'error' && <span class="od-download-error">{download.message}</span>}
    </span>
  )
}
