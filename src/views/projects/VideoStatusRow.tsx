import type { ComponentChildren } from 'preact'
import type { Project } from '../../data/types'
import { Icon } from '../../components/Icon'
import { JobProgress } from '../../components/JobProgress'
import './VideoActionsDialog.css'

interface VideoStatusRowProps {
  recording: Project['recording']
  /** Åtgärderna (undertexter, ladda upp video) finns bara när något av dem går att göra. */
  actionsAvailable: boolean
  onOpenActions: () => void
  /** Öppnar dialogen Exportera och importera. */
  onOpenExport?: () => void
  /** Knappen för att skapa/redigera undertexter (UNG-165), före "…"-knappen. */
  captionAction?: ComponentChildren
}

// UNG-101: en rad ovanför videofönstret med det som pågår kring videon (bearbetning) och vilken undertext som hör till
// den, med "…" till höger som öppnar dialogen där åtgärderna görs.
export function VideoStatusRow({ recording, actionsAvailable, onOpenActions, onOpenExport, captionAction }: VideoStatusRowProps) {
  const ready = recording?.state === 'recorded' || recording?.state === 'trimmed' || recording?.state === 'published'
  const processing = recording?.state === 'processing' && (recording.source === 'upload')
  const awaiting = recording?.state === 'awaitingApproval'
  const captions = recording?.captions ?? null
  return (
    <div class="video-status-row" aria-label="Videons status">
      <div class="video-status-info">
        {processing && (
          <>
            <strong>Videon bearbetas</strong>
            <JobProgress progress={recording?.progress} phase={recording?.phase ?? 'QUEUED'} />
          </>
        )}
        {awaiting && <strong>Ny video väntar på ditt godkännande</strong>}
        {ready && (
          <span>
            {captions
              ? <>Undertexter: <strong>{captions.label}</strong> · {captions.cueCount.toLocaleString('sv-SE')} repliker</>
              : 'Inga undertexter'}
          </span>
        )}
      </div>
      {ready && captionAction}
      {onOpenExport && (
        <button class="ib video-status-more" type="button" aria-label="Exportera och importera" title="Exportera och importera" onClick={onOpenExport}>
          <Icon name="ios_share" size={20} />
        </button>
      )}
      <button
        class="ib video-status-more"
        type="button"
        aria-label="Åtgärder för videon"
        title="Undertexter och ladda upp video"
        disabled={!actionsAvailable}
        onClick={onOpenActions}
      >
        <Icon name="more_horiz" size={20} />
      </button>
    </div>
  )
}
