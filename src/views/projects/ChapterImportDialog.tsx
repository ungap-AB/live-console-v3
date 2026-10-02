import { useEffect, useState } from 'preact/hooks'
import { client } from '../../data'
import type { ChapterImportItem, ChapterImportResult } from '../../data/types'
import { formatHms } from '../../app/time'
import { Modal } from '../../components/Modal'
import { buildImportItems, guessTimeMode, parseChapterLines, type TimeMode } from './chapterImport'

interface ChapterImportDialogProps {
  projectId: string
  agendaId: string | null
  /** Antal nuvarande kapitel som ersätts. */
  currentChapterCount: number
  onClose: () => void
  onImported: (result: ChapterImportResult) => void
}

type Source = 'paste' | 'agenda'

function todayIso(): string {
  const now = new Date()
  const pad = (value: number) => String(value).padStart(2, '0')
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`
}

// UNG-65/UNG-64: en källa åt gången — importen ersätter hela kapitellistan.
export function ChapterImportDialog({ projectId, agendaId, currentChapterCount, onClose, onImported }: ChapterImportDialogProps) {
  const [source, setSource] = useState<Source>('paste')
  const [text, setText] = useState('')
  const [mode, setMode] = useState<TimeMode | null>(null)
  const [modeChosen, setModeChosen] = useState(false)
  const [date, setDate] = useState(todayIso)
  const [agendaItems, setAgendaItems] = useState<string[] | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  const lines = parseChapterLines(text)
  const guessed = guessTimeMode(lines)
  const effectiveMode = modeChosen ? mode : guessed
  const items: ChapterImportItem[] = source === 'paste'
    ? buildImportItems(lines, effectiveMode, date)
    : (agendaItems ?? []).map((label) => ({ kind: 'agendaItem' as const, label }))

  useEffect(() => {
    if (source !== 'agenda' || !agendaId) return
    let cancelled = false
    client.agendas.get(agendaId).then((agenda) => {
      if (!cancelled) setAgendaItems(agenda ? [...agenda.items].sort((a, b) => a.position - b.position).map((item) => item.title) : [])
    }).catch(() => {
      if (!cancelled) setAgendaItems([])
    })
    return () => {
      cancelled = true
    }
  }, [source, agendaId])

  async function submit() {
    setBusy(true)
    setError('')
    try {
      onImported(await client.projects.importChapters(projectId, items))
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Importen misslyckades.')
      setBusy(false)
    }
  }

  const hasTimes = source === 'paste' && lines.some((line) => line.time)
  return (
    <Modal
      title="Importera kapitel"
      onClose={onClose}
      footer={
        <>
          <button class="btn btn-sm" type="button" onClick={onClose}>Avbryt</button>
          <button class="btn btn-sm btn-primary" type="button" disabled={busy || items.length === 0} onClick={() => void submit()}>
            {busy ? 'Importerar…' : `Ersätt kapitellistan (${items.length})`}
          </button>
        </>
      }
    >
      <div class="od-import">
        <div class="theme-seg" role="group" aria-label="Källa">
          <button type="button" aria-pressed={source === 'paste'} onClick={() => setSource('paste')}>Klistra in lista</button>
          <button type="button" aria-pressed={source === 'agenda'} onClick={() => setSource('agenda')}>Från dagordningen</button>
        </div>

        {source === 'paste' ? (
          <>
            <p class="od-empty">En rad per kapitel. Börja raden med en tid om du har en, till exempel ”00:12:34 Punkt 3”.</p>
            <textarea
              class="od-import-text"
              rows={8}
              aria-label="Kapitellista"
              placeholder={'00:00:00 Sammanträdet öppnas\n00:12:34 Föregående protokoll\n00:41:10 Ekonomisk uppföljning'}
              value={text}
              onInput={(event) => setText(event.currentTarget.value)}
            />
            {hasTimes && (
              <fieldset class="od-import-mode">
                <legend>Tiderna är</legend>
                <label>
                  <input type="radio" name="time-mode" checked={effectiveMode === 'video'} onChange={() => { setMode('video'); setModeChosen(true) }} />
                  Positioner i videon (redan synkade)
                </label>
                <label>
                  <input type="radio" name="time-mode" checked={effectiveMode === 'clock'} onChange={() => { setMode('clock'); setModeChosen(true) }} />
                  Klockslag i sändningen (förankras mot videon)
                </label>
                {effectiveMode === 'clock' && (
                  <label>
                    Datum
                    <input type="date" value={date} onInput={(event) => setDate(event.currentTarget.value)} />
                  </label>
                )}
              </fieldset>
            )}
          </>
        ) : !agendaId ? (
          <p class="od-empty">Projektet har ingen kopplad dagordning.</p>
        ) : agendaItems === null ? (
          <p class="od-empty">Hämtar dagordningen…</p>
        ) : (
          <p class="od-empty">Skapar ett kapitel per dagordningspunkt, utan tid. Du sätter tiderna med Synk-knappen under videon.</p>
        )}

        {items.length > 0 && (
          <ol class="od-import-preview" aria-label="Förhandsgranskning">
            {items.slice(0, 200).map((item, index) => (
              <li key={index}>
                <span class="od-time">
                  {item.offsetSeconds !== undefined
                    ? formatHms(item.offsetSeconds)
                    : item.clockUtc
                      ? new Date(item.clockUtc).toLocaleTimeString('sv-SE')
                      : '—'}
                </span>
                <span>{item.label}</span>
              </li>
            ))}
          </ol>
        )}
        <p class="od-empty">
          {currentChapterCount > 0
            ? `Importen ersätter de ${currentChapterCount} nuvarande kapitlen och förankringen.`
            : 'Importen skapar kapitellistan.'}
          {' '}Kapitel utan tid, och klockslag som inte förankrats ännu, är dolda för publiken.
        </p>
        {error && <span class="od-download-error">{error}</span>}
      </div>
    </Modal>
  )
}
