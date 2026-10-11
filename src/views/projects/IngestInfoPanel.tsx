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
    <div class="iip" role="region" aria-label="Ingest-info">
      <IngestInfo
        channel={channel}
        streamKey={streamKey}
        trailingAction={(
          <div class="iip-actions">
            <button class="btn btn-sm btn-danger" type="button" onClick={() => setConfirmTeardown(true)}>
              Riv ingest
            </button>
            {onClose && (
              <button class="btn btn-sm" type="button" onClick={onClose}>
                Stäng
              </button>
            )}
          </div>
        )}
      />
      {confirmTeardown && (
        <ConfirmModal
          title="Riva ingest?"
          confirmLabel="Riv ingest"
          danger
          onCancel={() => setConfirmTeardown(false)}
          onConfirm={() => {
            setConfirmTeardown(false)
            onClose?.()
            void onTeardown()
          }}
        >
          <p>Ingest-resursen tas bort. För att sända behöver du skapa en ny ingest och använda en ny stream key i enkodern.</p>
        </ConfirmModal>
      )}
    </div>
  )
}
