import { useState } from 'preact/hooks'
import type { ProjectCaptions } from '../../data/types'
import { Modal } from '../../components/Modal'
import { CaptionsPanel } from './CaptionsPanel'
import './VideoActionsDialog.css'

interface VideoActionsDialogProps {
  projectId: string
  projectName: string
  /** Undertexter går att koppla när videon är klar och inte väntar på godkännande. */
  captionsEnabled: boolean
  captions: ProjectCaptions | null
  videoDurationSeconds?: number
  onChanged: () => void
  onClose: () => void
}

// UNG-101/132: undertexterna (automatiska och egen VTT-fil). Uppladdning av video ligger i Exportera och importera (UI-finslipning omgång 1).
// Dialogen får inte stängas medan en fil överförs från webbläsaren — därefter fortsätter allt i bakgrunden.
export function VideoActionsDialog({
  projectId, projectName, captionsEnabled, captions, videoDurationSeconds, onChanged, onClose,
}: VideoActionsDialogProps) {
  const [busy, setBusy] = useState(false)

  return (
    <Modal
      title="Undertexter"
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

      {captionsEnabled ? (
        <CaptionsPanel
          projectId={projectId}
          projectName={projectName}
          captions={captions}
          videoDurationSeconds={videoDurationSeconds}
          onChanged={onChanged}
          onBusyChange={setBusy}
        />
      ) : (
        <section class="captions-panel" aria-label="Undertexter">
          <h3>Undertexter</h3>
          <p class="captions-help">Undertexter går att koppla när videon är klar och du har godkänt den.</p>
        </section>
      )}
    </Modal>
  )
}
