import { useRef, useState } from 'preact/hooks'
import { client } from '../data'
import type { Agenda, AgendaItem } from '../data/types'

interface PdfAttachmentsProps {
  agenda: Agenda
  item: AgendaItem
  onChanged: (agenda: Agenda) => void
}

export function PdfAttachments({ agenda, item, onChanged }: PdfAttachmentsProps) {
  const inputRef = useRef<HTMLInputElement | null>(null)
  const [busy, setBusy] = useState(false)
  const attachments = item.attachments ?? []

  async function add(files: FileList | File[]) {
    const pdfs = Array.from(files).filter((file) => file.type === 'application/pdf' || file.name.toLowerCase().endsWith('.pdf'))
    if (pdfs.length === 0) return
    setBusy(true)
    try {
      onChanged(await client.agendas.addAttachments(agenda.id, item.id, { files: pdfs }))
    } finally {
      setBusy(false)
    }
  }

  return (
    <span class="pdf-attachments" onDragOver={(event) => event.preventDefault()} onDrop={(event) => { event.preventDefault(); if (event.dataTransfer) void add(event.dataTransfer.files) }}>
      <input ref={inputRef} type="file" accept="application/pdf,.pdf" multiple hidden onChange={(event) => { if (event.currentTarget.files) void add(event.currentTarget.files); event.currentTarget.value = '' }} />
      <button type="button" class="btn btn-xs" disabled={busy} onClick={() => inputRef.current?.click()}>
        {busy ? 'Laddar...' : 'PDF'}
      </button>
      {attachments.map((attachment) => (
        <span class="pdf-attachment" key={attachment.id}>
          <a href={attachment.url} target="_blank" rel="noopener noreferrer">{attachment.fileName}</a>
          <button type="button" class="ib" title="Ta bort PDF" aria-label={`Ta bort ${attachment.fileName}`} disabled={busy} onClick={() => { setBusy(true); void client.agendas.removeAttachment(agenda.id, item.id, attachment.id).then(onChanged).finally(() => setBusy(false)) }}>x</button>
        </span>
      ))}
    </span>
  )
}
