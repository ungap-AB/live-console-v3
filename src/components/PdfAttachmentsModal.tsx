import { useRef, useState } from 'preact/hooks'
import { client } from '../data'
import type { Agenda, AgendaItem } from '../data/types'
import { DeleteIcon } from './icons'
import { Modal } from './Modal'
import './PdfAttachmentsModal.css'

interface PdfAttachmentsModalProps {
  agenda: Agenda
  item: AgendaItem
  onChanged: (agenda: Agenda) => void
  onClose: () => void
}

function getPdfFiles(files: FileList | File[]): File[] {
  return Array.from(files).filter((file) => file.type === 'application/pdf' || file.name.toLowerCase().endsWith('.pdf'))
}

export function PdfAttachmentsModal({ agenda, item, onChanged, onClose }: PdfAttachmentsModalProps) {
  const inputRef = useRef<HTMLInputElement | null>(null)
  const [busy, setBusy] = useState(false)
  const [dragging, setDragging] = useState(false)
  const attachments = item.attachments ?? []

  async function add(files: FileList | File[]) {
    const pdfs = getPdfFiles(files)
    if (pdfs.length === 0) return
    setBusy(true)
    try {
      onChanged(await client.agendas.addAttachments(agenda.id, item.id, { files: pdfs }))
    } finally {
      setBusy(false)
      setDragging(false)
    }
  }

  function handleDragLeave(event: DragEvent) {
    if (event.currentTarget === event.target) setDragging(false)
  }

  return (
    <Modal
      title={`PDF-dokument — ${item.title}`}
      onClose={onClose}
      wide
      className={`pdf-modal ${dragging ? 'is-dragging' : ''}`}
      onDragEnter={(event) => {
        event.preventDefault()
        setDragging(true)
      }}
      onDragOver={(event) => event.preventDefault()}
      onDragLeave={handleDragLeave}
      onDrop={(event) => {
        event.preventDefault()
        void add(event.dataTransfer?.files ?? [])
      }}
      bodyClassName="pdf-modal-body"
      footer={
        <button class="btn" type="button" onClick={onClose}>
          Stäng
        </button>
      }
    >
      <input
        ref={inputRef}
        type="file"
        accept="application/pdf,.pdf"
        multiple
        hidden
        onChange={(event) => {
          if (event.currentTarget.files) void add(event.currentTarget.files)
          event.currentTarget.value = ''
        }}
      />
      <div class="pdf-modal-drop-hint">
        <span>Dra och släpp en eller flera PDF-filer här</span>
        <button class="btn btn-primary" type="button" disabled={busy} onClick={() => inputRef.current?.click()}>
          {busy ? 'Laddar...' : 'Lägg till...'}
        </button>
      </div>
      {attachments.length === 0 ? (
        <p class="hint pdf-modal-empty">Inga PDF-dokument kopplade.</p>
      ) : (
        <div class="pdf-modal-list">
          {attachments.map((attachment) => (
            <div class="pdf-modal-row" key={attachment.id}>
              <a href={attachment.url} target="_blank" rel="noopener noreferrer">{attachment.fileName}</a>
              <button
                type="button"
                class="ib del"
                title="Ta bort PDF"
                aria-label={`Ta bort ${attachment.fileName}`}
                disabled={busy}
                onClick={() => {
                  setBusy(true)
                  void client.agendas.removeAttachment(agenda.id, item.id, attachment.id).then(onChanged).finally(() => setBusy(false))
                }}
              >
                <DeleteIcon />
              </button>
            </div>
          ))}
        </div>
      )}
      {dragging && <div class="pdf-modal-drag-overlay">Släpp PDF-filer för att lägga till dem</div>}
    </Modal>
  )
}