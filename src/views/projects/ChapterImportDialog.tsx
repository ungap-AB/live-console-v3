import { plural, t } from '@lingui/core/macro'
import { i18n } from '@lingui/core'
import { useEffect, useState } from 'preact/hooks'
import { client } from '../../data'
import type { ChapterImportItem, ChapterImportResult } from '../../data/types'
import { formatHms } from '../../app/time'
import { Modal } from '../../components/Modal'
import { buildImportItems, guessTimeMode, parseChapterLines, type TimeMode } from './chapterImport'

interface ChapterImportDialogProps {
  projectId: string
  agendaId: string | null
  /** Antal nuvarande kapitel (de ersätts, eller finns kvar vid "lägg till"). */
  currentChapterCount: number
  /** Inspelad sändning med riktig klocka (UNG-169): klockslag placeras direkt mot videon, och kapitel kan läggas till i stället för att ersätta. */
  directClock?: boolean
  /** Datum (ÅÅÅÅ-MM-DD) som klockslag utan datum tolkas mot, t.ex. sändningens datum. */
  defaultDate?: string
  /** UNG-249: utkastets version som importen villkoras på (editorn). Saknas den är importen villkorslös. */
  ifDraftRevision?: number
  /** Kapitel med tid i utkastet (de som tas bort vid Ersätt och syns för tittarna efter publicering). */
  positionedChapterCount?: number
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
export function ChapterImportDialog({ projectId, agendaId, currentChapterCount, positionedChapterCount, directClock = false, defaultDate, ifDraftRevision, onClose, onImported }: ChapterImportDialogProps) {
  const [source, setSource] = useState<Source>('paste')
  const [text, setText] = useState('')
  const [mode, setMode] = useState<TimeMode | null>(null)
  const [modeChosen, setModeChosen] = useState(false)
  const [date, setDate] = useState(() => defaultDate ?? todayIso())
  // Inspelad sändning med kapitel som redan finns: lägg till är det vanliga (det som spelades ut ska inte försvinna).
  const canAdd = directClock && currentChapterCount > 0
  const [importMode, setImportMode] = useState<'replace' | 'add'>(canAdd ? 'add' : 'replace')
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
      onImported(await client.projects.importChapters(projectId, items, directClock ? importMode : undefined, ifDraftRevision))
    } catch (err) {
      setError(err instanceof Error ? err.message : t`The import failed.`)
      setBusy(false)
    }
  }

  const hasTimes = source === 'paste' && lines.some((line) => line.time)
  return (
    <Modal
      title={t`Import chapters`}
      onClose={onClose}
      footer={
        <>
          <button class="btn btn-sm" type="button" onClick={onClose}>{t`Cancel`}</button>
          <button class="btn btn-sm btn-primary" type="button" disabled={busy || items.length === 0} onClick={() => void submit()}>
            {busy ? t({ message: 'Importing…', context: 'list import' }) : canAdd && importMode === 'add' ? t`Add to the chapter list (${items.length})` : currentChapterCount > 0 ? t`Replace the chapter list (${items.length})` : t`Create the chapter list (${items.length})`}
          </button>
        </>
      }
    >
      <div class="od-import">
        <div class="theme-seg" role="group" aria-label={t`Source`}>
          <button type="button" aria-pressed={source === 'paste'} onClick={() => setSource('paste')}>{t`Paste list`}</button>
          <button type="button" aria-pressed={source === 'agenda'} onClick={() => setSource('agenda')}>{t`From the agenda`}</button>
        </div>

        {source === 'paste' ? (
          <>
            <p class="od-empty">{t`One line per chapter. Start the line with a time if you have one, for example “00:12:34 Item 3”.`}</p>
            <textarea
              class="od-import-text"
              rows={8}
              aria-label={t`Chapter list`}
              placeholder={t`00:00:00 The meeting is opened\n00:12:34 Previous minutes\n00:41:10 Financial follow-up`}
              value={text}
              onInput={(event) => setText(event.currentTarget.value)}
            />
            {hasTimes && (
              <fieldset class="od-import-mode">
                <legend>{t`The times are`}</legend>
                <label>
                  <input type="radio" name="time-mode" checked={effectiveMode === 'video'} onChange={() => { setMode('video'); setModeChosen(true) }} />
                  {t`Positions in the video (already synced)`}
                </label>
                <label>
                  <input type="radio" name="time-mode" checked={effectiveMode === 'clock'} onChange={() => { setMode('clock'); setModeChosen(true) }} />
                  {directClock ? t`Clock times in the broadcast (placed directly against the video)` : t`Clock times in the broadcast (anchored to the video)`}
                </label>
                {effectiveMode === 'clock' && (
                  <label>
                    {t`Date`}
                    <input type="date" value={date} onInput={(event) => setDate(event.currentTarget.value)} />
                  </label>
                )}
              </fieldset>
            )}
          </>
        ) : !agendaId ? (
          <p class="od-empty">{t`The project has no linked agenda.`}</p>
        ) : agendaItems === null ? (
          <p class="od-empty">{t`Fetching the agenda…`}</p>
        ) : (
          <p class="od-empty">{t`Creates one chapter per agenda item, without a time. You set the times with the Sync button below the video.`}</p>
        )}

        {items.length > 0 && (
          <ol class="od-import-preview" aria-label={t({ message: 'Preview', context: 'chapter import' })}>
            {items.slice(0, 200).map((item, index) => (
              <li key={index}>
                <span class="od-time">
                  {item.offsetSeconds !== undefined
                    ? formatHms(item.offsetSeconds)
                    : item.clockUtc
                      ? new Date(item.clockUtc).toLocaleTimeString(i18n.locales)
                      : '—'}
                </span>
                <span>{item.label}</span>
              </li>
            ))}
          </ol>
        )}
        {canAdd && (
          <fieldset class="od-import-mode">
            <legend>{plural(currentChapterCount, { one: 'The # current chapter', other: 'The # current chapters' })}</legend>
            <label>
              <input type="radio" name="import-mode" checked={importMode === 'add'} onChange={() => setImportMode('add')} />
              {t`Keep them and add the new ones`}
            </label>
            <label>
              <input type="radio" name="import-mode" checked={importMode === 'replace'} onChange={() => setImportMode('replace')} />
              {t`Replace them`}
            </label>
          </fieldset>
        )}
        <p class="od-empty">
          {currentChapterCount > 0 && !(canAdd && importMode === 'add')
            ? (directClock
              ? plural(currentChapterCount, { one: 'The import replaces the # current chapter.', other: 'The import replaces the # current chapters.' })
              : plural(currentChapterCount, { one: 'The import replaces the # current chapter and the anchoring.', other: 'The import replaces the # current chapters and the anchoring.' }))
              + (positionedChapterCount ? ' ' + plural(positionedChapterCount, { one: '# chapter with a time is removed from the draft.', other: '# chapters with a time are removed from the draft.' }) : '')
            : currentChapterCount > 0
              ? t`The new chapters are added after the current ones.`
              : t`The import creates the chapter list.`}
          {' '}{directClock
            ? t`Chapters without a time are hidden from the audience until they have been placed.`
            : t`Chapters without a time, and clock times not yet anchored, are hidden from the audience until they have been placed.`}
        </p>
        {error && <span class="od-download-error">{error}</span>}
      </div>
    </Modal>
  )
}
