import { useState } from 'preact/hooks'
import { openJobsView } from '../../app/jobsBus'
import { NotifyCheckbox } from '../../components/NotifyCheckbox'
import { ShareDialog } from '../../components/ShareDialog'

export interface DownloadState {
  status: 'starting' | 'queued' | 'ready' | 'error'
  url?: string
  message?: string
}

interface DownloadPanelProps {
  projectName: string
  /** Originalinspelningen (saknas om inget går att ladda ner). */
  sourceId?: string
  /** Den trimmade versionen, om projektet är trimmat. */
  trimmedId?: string
  /** En extern video ligger på en annan adress och kan inte laddas ned som MP4. */
  externalVideo: boolean
  /** Förklaring när nedladdning inte går just nu. */
  blockedReason?: string
  downloads: Record<string, DownloadState>
  onDownload: (recordingId: string) => void
}

// UNG-58/132: nedladdning (original och trimmad) och delning, flyttad hit från under videorutan. Tillståndet för nedladdningarna ägs av
// Ondemand-vyn, så att "förbereds…" finns kvar när dialogen stängs och öppnas igen. Servern kör jobbet; framsteget visas i jobbfältet.
export function DownloadPanel({ projectName, sourceId, trimmedId, externalVideo, blockedReason, downloads, onDownload }: DownloadPanelProps) {
  const [shareRecordingId, setShareRecordingId] = useState<string | null>(null)
  return (
    <section class="captions-panel" aria-label="Ladda ner video">
      <h3>Ladda ner video</h3>
      {externalVideo ? (
        <p class="captions-help">Videon ligger på en extern adress och kan inte laddas ned som MP4 förrän den kopierats till ungap.</p>
      ) : !sourceId ? (
        <p class="captions-help">{blockedReason ?? 'Det går inte att ladda ner videon just nu.'}</p>
      ) : (
        <div class="od-download">
          <DownloadButton
            label="Ladda ner originalinspelning"
            fileName={`${projectName} (original)`}
            download={downloads[sourceId]}
            onDownload={() => onDownload(sourceId)}
            onShare={() => setShareRecordingId(sourceId)}
          />
          {trimmedId && (
            <DownloadButton
              label="Ladda ner trimmad version"
              fileName={`${projectName} (trimmad)`}
              download={downloads[trimmedId]}
              onDownload={() => onDownload(trimmedId)}
              onShare={() => setShareRecordingId(trimmedId)}
            />
          )}
        </div>
      )}
      {shareRecordingId && <ShareDialog initialRecordingIds={[shareRecordingId]} onClose={() => setShareRecordingId(null)} />}
    </section>
  )
}

interface DownloadButtonProps {
  label: string
  fileName: string
  download?: DownloadState
  onDownload: () => void
  /** Delar den färdiga filen via en länk (visas när filen är klar). */
  onShare?: () => void
}

// UNG-58: samma "Förbereder… → riktig länk"-mönster som Videoarkivets nedladdningsknapp.
function DownloadButton({ label, fileName, download, onDownload, onShare }: DownloadButtonProps) {
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
