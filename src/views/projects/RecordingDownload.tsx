import { t } from '@lingui/core/macro'
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

// UNG-58: the same "Preparing… → real link" pattern as the Video archive's download button.
function downloadFileText(name: string): string {
  const fileName = `${name}.mp4`
  return t`Download ${fileName}`
}

export function DownloadButton({ label, fileName, download, onDownload, onShare }: DownloadButtonProps) {
  if (download?.status === 'starting') {
    return <button class="btn btn-sm" type="button" disabled>{t`Starting…`}</button>
  }
  if (download?.status === 'queued') {
    return (
      <span class="od-download-ready">
        <span>{t`The download is being prepared. You will be notified when it is ready.`}</span>
        <button class="btn btn-sm" type="button" onClick={openJobsView}>
          {t`Show jobs`}
        </button>
      </span>
    )
  }
  if (download?.status === 'ready' && download.url) {
    return (
      <span class="od-download-ready">
        <a class="btn btn-sm" href={download.url} download>
          {downloadFileText(fileName)}
        </a>
        <button class="btn btn-sm" type="button" onClick={onDownload}>
          {t`Prepare again`}
        </button>
        {onShare && (
          <button class="btn btn-sm" type="button" onClick={onShare}>
            {t`Share…`}
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
        title={t`Prepares a downloadable file (can take a few minutes). The file is kept for 7 days.`}
      >
        {label}
      </button>
      <NotifyCheckbox />
      {download?.status === 'error' && <span class="od-download-error">{download.message}</span>}
    </span>
  )
}
