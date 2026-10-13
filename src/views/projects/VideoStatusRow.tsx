import { plural, t } from '@lingui/core/macro'
import type { ComponentChildren } from 'preact'
import type { Project } from '../../data/types'
import { Icon } from '../../components/Icon'
import { JobProgress } from '../../components/JobProgress'
import './VideoStatusRow.css'
import { formatNumber } from '../../i18n'

interface VideoStatusRowProps {
  recording: Project['recording']
  /** Åtgärderna (undertexter, ladda upp video) finns bara när något av dem går att göra. Utan onOpenActions visas ingen "…"-knapp. */
  actionsAvailable?: boolean
  onOpenActions?: () => void
  /** Öppnar dialogen Exportera och importera. */
  onOpenExport?: () => void
  /** Knappen för att skapa/redigera undertexter (UNG-165), före "…"-knappen. */
  captionAction?: ComponentChildren
}

// UNG-101: en rad ovanför videofönstret med det som pågår kring videon (bearbetning) och vilken undertext som hör till
// den, med "…" till höger som öppnar dialogen där åtgärderna görs.
function cuesText(count: number): string {
  const cues = formatNumber(count)
  return plural(count, { one: `${cues} line`, other: `${cues} lines` })
}

export function VideoStatusRow({ recording, actionsAvailable = false, onOpenActions, onOpenExport, captionAction }: VideoStatusRowProps) {
  const ready = recording?.state === 'recorded' || recording?.state === 'trimmed' || recording?.state === 'published'
  const processing = recording?.state === 'processing' && (recording.source === 'upload')
  const awaiting = recording?.state === 'awaitingApproval'
  const captions = recording?.captions ?? null
  return (
    <div class="video-status-row" aria-label={t`Video status`}>
      <div class="video-status-info">
        {processing && (
          <>
            <strong>{t`The video is being processed`}</strong>
            <JobProgress progress={recording?.progress} phase={recording?.phase ?? 'QUEUED'} />
          </>
        )}
        {awaiting && <strong>{t`A new video is waiting for your approval`}</strong>}
        {ready && (
          <span>
            {captions
              ? <>{t`Captions:`} <strong>{captions.label}</strong> · {cuesText(captions.cueCount)}</>
              : t`No captions`}
          </span>
        )}
      </div>
      {ready && captionAction}
      {onOpenExport && (
        <button class="ib video-status-more" type="button" aria-label={t`Export and import`} title={t`Export and import`} onClick={onOpenExport}>
          <Icon name="ios_share" size={20} />
        </button>
      )}
      {onOpenActions && (
        <button
          class="ib video-status-more"
          type="button"
          aria-label={t`Actions for the video`}
          title={t`Captions and upload video`}
          disabled={!actionsAvailable}
          onClick={onOpenActions}
        >
          <Icon name="more_horiz" size={20} />
        </button>
      )}
    </div>
  )
}
