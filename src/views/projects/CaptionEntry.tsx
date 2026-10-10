import { useState } from 'preact/hooks'
import { Icon } from '../../components/Icon'
import { captionEntry, consumeCaptionStudio } from './captionEntryLogic'
import { CaptionStudio } from './CaptionStudio'
import type { TrimRange } from '../../components/trimBarLogic'
import { useCaptionGeneration } from './useCaptionGeneration'

interface CaptionEntryProps {
  projectId: string
  projectName: string
  videoDurationSeconds?: number
  posterUrl?: string | null
  onChanged: () => void
  /** Kapitel sparades i redigeraren. */
  onChaptersChanged?: () => void
  /** Trimningen som redigeraren visar och ändrar (ägs av ondemand-vyn). */
  trim?: { start: number; end: number; onChange: (range: TrimRange) => void }
}

// UNG-165: knappen ovanför videofönstret som leder direkt till att skapa eller redigera undertexter. Etiketten följer serverns läge
// (skapa, genererar n %, redigera). Knappen äger också studion (redigeraren med skapandet som overlay) och dess öppna/stängda läge.
export function CaptionEntry({ projectId, projectName, videoDurationSeconds, posterUrl, onChanged, onChaptersChanged, trim }: CaptionEntryProps) {
  const captions = useCaptionGeneration(projectId)
  // Öppnas direkt när man kommit hit via knappen i projektlistan.
  const [open, setOpen] = useState(() => consumeCaptionStudio(projectId))
  const entry = captionEntry(captions.generation)
  if (!entry) return null

  return (
    <>
      <button
        class={`btn btn-sm caption-entry${entry.kind === 'edit' ? ' btn-primary' : ''}`}
        type="button"
        disabled={Boolean(entry.disabledReason)}
        title={entry.disabledReason ?? (entry.kind === 'progress' ? 'Undertexterna genereras. Öppna för att följa framsteget.' : 'Öppnar undertextredigeraren')}
        onClick={() => setOpen(true)}
      >
        <Icon name="closed_caption" size={18} /> {entry.label}
      </button>
      {open && (
        <CaptionStudio
          projectId={projectId}
          projectName={projectName}
          videoDurationSeconds={videoDurationSeconds}
          posterUrl={posterUrl}
          generation={captions.generation}
          phase={captions.phase}
          setGeneration={captions.setGeneration}
          refresh={captions.refresh}
          onChanged={onChanged}
          onChaptersChanged={onChaptersChanged}
          trim={trim}
          onClose={() => {
            setOpen(false)
            void captions.refresh()
          }}
        />
      )}
    </>
  )
}
