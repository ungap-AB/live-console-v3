import { t } from '@lingui/core/macro'
import type { ComponentChildren } from 'preact'
import type { Channel } from '../../data/types'
import { CopyField } from '../../components/CopyField'

interface IngestInfoProps {
  channel: Channel | null
  streamKey: string | null
  trailingAction?: ComponentChildren
}

// Ingest-uppgifter för enkodern. Live-HLS-adressen ligger i spelarinställningarna (UI-finslipning omgång 1).
export function IngestInfo({ channel, streamKey, trailingAction }: IngestInfoProps) {
  return (
    <div class="ingest-info">
      <div class="field">
        <label>{t`Ingest server`}</label>
        <CopyField value={channel?.ingestEndpoint ?? null} placeholder={t`Fetching…`} monospace />
      </div>
      <div class="field">
        <label>{t`Stream key`}</label>
        <CopyField value={streamKey} mask monospace />
      </div>
      {trailingAction}
    </div>
  )
}
