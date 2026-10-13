import { t } from '@lingui/core/macro'
import { useState } from 'preact/hooks'
import type { Channel } from '../../data/types'
import { ConfirmModal } from '../../components/ConfirmModal'
import { IngestInfo } from './IngestInfo'
import './IngestInfoPanel.css'

interface IngestInfoPanelProps {
  channel: Channel
  streamKey: string | null
  /** Saknas den visas ingen Stäng-knapp (i spelarinställningarnas flik Ingest). */
  onClose?: () => void
  /** Rivningen efter bekräftelse (Before stoppar också pollningen först). */
  onTeardown: () => Promise<void> | void
}

// Ingest-uppgifterna med Riv ingest: i Before under förberedelsen Ingest när den just skapats (med Stäng), och i spelarinställningarnas
// flik Ingest.
export function IngestInfoPanel({ channel, streamKey, onClose, onTeardown }: IngestInfoPanelProps) {
  const [confirmTeardown, setConfirmTeardown] = useState(false)
  return (
    <div class="iip" role="region" aria-label={t({ message: 'Ingest info', context: 'region' })}>
      <IngestInfo
        channel={channel}
        streamKey={streamKey}
        trailingAction={(
          <div class="iip-actions">
            <button class="btn btn-sm btn-danger" type="button" onClick={() => setConfirmTeardown(true)}>
              {t`Tear down ingest`}
            </button>
            {onClose && (
              <button class="btn btn-sm" type="button" onClick={onClose}>
                {t`Close`}
              </button>
            )}
          </div>
        )}
      />
      {confirmTeardown && (
        <ConfirmModal
          title={t`Tear down ingest?`}
          confirmLabel={t`Tear down ingest`}
          danger
          onCancel={() => setConfirmTeardown(false)}
          onConfirm={() => {
            setConfirmTeardown(false)
            onClose?.()
            void onTeardown()
          }}
        >
          <p>{t`The ingest resource is removed. To broadcast you need to create a new ingest and use a new stream key in the encoder.`}</p>
        </ConfirmModal>
      )}
    </div>
  )
}
