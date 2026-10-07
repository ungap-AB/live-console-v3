import { useState } from 'preact/hooks'
import type { ProjectCaptions } from '../../data/types'
import { Modal } from '../../components/Modal'
import { Tabs } from '../../components/Tabs'
import { CaptionsPanel } from './CaptionsPanel'
import { DownloadPanel, type DownloadState } from './DownloadPanel'
import { UploadPanel } from './UploadPanel'
import { VIDEO_TABS, defaultVideoTab, type VideoTab } from './videoDialogLogic'
import './VideoActionsDialog.css'

interface VideoActionsDialogProps {
  projectId: string
  projectName: string
  /** Undertexter går att koppla när videon är klar och inte väntar på godkännande. */
  captionsEnabled: boolean
  captions: ProjectCaptions | null
  videoDurationSeconds?: number
  /** Ladda upp video / egen HLS-URL är bara aktuellt innan något är publicerat och medan inget annat pågår. */
  uploadEnabled: boolean
  /** Förklaring till varför uppladdning inte går just nu. */
  uploadBlockedReason?: string
  /** Det finns redan en video som en ny ersätter först när den godkänts. */
  replacing: boolean
  /** Nedladdning (UNG-132): original och trimmad version, flyttad hit från under videorutan. */
  downloadEnabled: boolean
  downloadBlockedReason?: string
  externalVideo: boolean
  sourceId?: string
  trimmedId?: string
  downloads: Record<string, DownloadState>
  onDownload: (recordingId: string) => void
  /** Flik som dialogen öppnas på (annars den första som går att använda). */
  initialTab?: VideoTab
  onChanged: () => void
  onClose: () => void
}

// UNG-101/132: åtgärderna kring projektets video samlade på ett ställe, i flikarna Undertexter, Ladda upp och Ladda ner. Panelerna förblir
// monterade när man byter flik (annars skulle en pågående uppladdning avbrytas); inaktiva paneler döljs bara.
// Dialogen får inte stängas medan en fil överförs från webbläsaren — därefter fortsätter allt i bakgrunden.
export function VideoActionsDialog({
  projectId, projectName, captionsEnabled, captions, videoDurationSeconds, uploadEnabled, uploadBlockedReason, replacing,
  downloadEnabled, downloadBlockedReason, externalVideo, sourceId, trimmedId, downloads, onDownload, initialTab, onChanged, onClose,
}: VideoActionsDialogProps) {
  const [tab, setTab] = useState<VideoTab>(() => defaultVideoTab({ captionsEnabled, uploadEnabled, downloadEnabled }, initialTab))
  const [captionsBusy, setCaptionsBusy] = useState(false)
  const [uploadBusy, setUploadBusy] = useState(false)
  const busy = captionsBusy || uploadBusy

  return (
    <Modal
      title="Video och undertexter"
      subtitle={projectName}
      wide
      className="video-actions-dialog"
      closeDisabled={busy}
      onClose={onClose}
      footer={<button class="btn" type="button" disabled={busy} title={busy ? 'Vänta tills överföringen är klar' : undefined} onClick={onClose}>Stäng</button>}
    >
      {busy && (
        <p class="video-actions-note is-busy" role="status">
          En fil överförs från din webbläsare. Lämna den här rutan öppen tills det är klart — då kan du stänga den.
        </p>
      )}

      <Tabs tabs={VIDEO_TABS} active={tab} onChange={(id) => setTab(id as VideoTab)} label="Video och undertexter" idPrefix="vad" />

      {/* Alla paneler ligger i samma ruta och döljs med synlighet, så att dialogen alltid har storleken av den största fliken. */}
      <div class="vad-panels">
      <div class={`vad-panel${tab === 'captions' ? '' : ' is-inactive'}`} role="tabpanel" id="vad-panel-captions" aria-labelledby="vad-tab-captions" aria-hidden={tab !== 'captions'}>
      {captionsEnabled ? (
        <CaptionsPanel
          projectId={projectId}
          projectName={projectName}
          captions={captions}
          videoDurationSeconds={videoDurationSeconds}
          onChanged={onChanged}
          onBusyChange={setCaptionsBusy}
        />
      ) : (
        <section class="captions-panel" aria-label="Undertexter">
          <h3>Undertexter</h3>
          <p class="captions-help">Undertexter går att koppla när videon är klar och du har godkänt den.</p>
        </section>
      )}
      </div>

      <div class={`vad-panel${tab === 'upload' ? '' : ' is-inactive'}`} role="tabpanel" id="vad-panel-upload" aria-labelledby="vad-tab-upload" aria-hidden={tab !== 'upload'}>
      {uploadEnabled ? (
        <UploadPanel
          projectId={projectId}
          projectName={projectName}
          replacing={replacing}
          failed={false}
          onBusyChange={setUploadBusy}
          onUploaded={() => {
            onChanged()
            onClose()
          }}
        />
      ) : (
        <section class="captions-panel" aria-label="Ladda upp video">
          <h3>Ladda upp video</h3>
          <p class="captions-help">{uploadBlockedReason ?? 'Det går inte att ladda upp en ny video just nu.'}</p>
        </section>
      )}
      </div>

      <div class={`vad-panel${tab === 'download' ? '' : ' is-inactive'}`} role="tabpanel" id="vad-panel-download" aria-labelledby="vad-tab-download" aria-hidden={tab !== 'download'}>
        <DownloadPanel
          projectName={projectName}
          sourceId={downloadEnabled ? sourceId : undefined}
          trimmedId={trimmedId}
          externalVideo={externalVideo}
          blockedReason={downloadBlockedReason}
          downloads={downloads}
          onDownload={onDownload}
        />
      </div>
      </div>
    </Modal>
  )
}
