import type { ComponentChildren } from 'preact'
import type { Channel } from '../../data/types'
import { CopyField } from '../../components/CopyField'

interface IngestInfoProps {
  channel: Channel | null
  streamKey: string | null
  trailingAction?: ComponentChildren
}

// Ingest-uppgifter för enkodern. Delas av Before- och Live-arbetsytan.
export function IngestInfo({ channel, streamKey, trailingAction }: IngestInfoProps) {
  return (
    <div class="ingest-info">
      <div class="field">
        <label>Ingest-server</label>
        <CopyField value={channel?.ingestEndpoint ?? null} placeholder="Hämtar…" monospace />
      </div>
      <div class="field">
        <label>Stream key</label>
        <CopyField value={streamKey} mask monospace />
      </div>
      <div class="field">
        <label>HLS-URL</label>
        <CopyField value={channel?.playbackUrl ?? null} placeholder="Hämtar…" monospace />
      </div>
      {trailingAction}
    </div>
  )
}
