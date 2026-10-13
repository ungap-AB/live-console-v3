import { plural, t } from '@lingui/core/macro'
import { useMemo, useState } from 'preact/hooks'
import type { ImportMode, TextImportCounts } from '../data/types'
import { Modal } from './Modal'
import { checkImportText, importSummary, type ImportKind } from './importTextLogic'
import './ImportTextDialog.css'

interface ImportTextDialogProps {
  kind: ImportKind
  /** Antal befintliga punkter eller namn. Finns inga finns inget val av läge (lägg till sist och ersätt blir samma sak). */
  existingCount: number
  onClose: () => void
  /** Skickar texten som den är till servern (ett anrop) och uppdaterar vyn. Kastar vid fel; felet visas i dialogen. */
  run: (text: string, mode: ImportMode) => Promise<TextImportCounts>
}

// Texts per kind, built when shown (the language is chosen at start).
function copyFor(kind: ImportKind) {
  return kind === 'agenda'
    ? {
      title: t`Import agenda`,
      subtitle: t`One item per line.`,
      placeholder: t`City council meeting\nElection of adjusters\nQuestions`,
      lineCount: (lines: number) => plural(lines, { one: '# item', other: '# items' }),
      existing: (count: number) => t`Existing items (${count})`,
      replaceHelp: t`Existing items are replaced by position: they keep attachments and Meeting link but get a new heading and an empty reference. Items without a corresponding line are removed.`,
      missing: t`Paste at least one line, one item per line.`,
    }
    : {
      title: t`Import names`,
      subtitle: t`One name per line.`,
      placeholder: t`Anna Andersson\nBo Berg\nCecilia Carlsson`,
      lineCount: (lines: number) => plural(lines, { one: '# name', other: '# names' }),
      existing: (count: number) => t`Existing names (${count})`,
      replaceHelp: t`Existing names are replaced by position: they get a new name and an empty party and title. Names without a corresponding line are removed.`,
      missing: t`Paste at least one line, one person per line.`,
    }
}

// UNG-197: delad dialog för att importera dagordningspunkter och namn. Hela texten skickas i ETT anrop och servern delar upp den och sparar
// allt eller inget. "Lägg till sist" är förvalt: att skriva över är ett aktivt val.
export function ImportTextDialog({ kind, existingCount, onClose, run }: ImportTextDialogProps) {
  const copy = copyFor(kind)
  const [text, setText] = useState('')
  const [mode, setMode] = useState<ImportMode>('append')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [done, setDone] = useState<string | null>(null)
  const check = useMemo(() => checkImportText(text), [text])

  async function submit() {
    if (busy) return
    if (check.lines === 0) {
      setError(copy.missing)
      return
    }
    setBusy(true)
    setError('')
    try {
      setDone(importSummary(kind, await run(text, existingCount > 0 ? mode : 'append')))
    } catch (err) {
      setError(err instanceof Error ? err.message : t`The import failed. Nothing was imported.`)
    } finally {
      setBusy(false)
    }
  }

  if (done !== null) {
    return (
      <Modal title={copy.title} onClose={onClose} footer={<button class="btn btn-sm primary" type="button" onClick={onClose}>{t`Done`}</button>}>
        <p class="import-done" role="status">{done}</p>
      </Modal>
    )
  }

  return (
    <Modal
      title={copy.title}
      subtitle={copy.subtitle}
      onClose={onClose}
      closeDisabled={busy}
      footer={(
        <>
          <button class="btn btn-sm" type="button" disabled={busy} onClick={onClose}>{t`Cancel`}</button>
          <button class="btn btn-sm primary" type="button" disabled={busy || check.problem !== null} onClick={() => void submit()}>
            {busy ? t({ message: 'Importing…', context: 'list import' }) : t`Import`}
          </button>
        </>
      )}
    >
      <textarea
        class="import-textarea"
        rows={12}
        value={text}
        placeholder={copy.placeholder}
        onInput={(event) => { setText(event.currentTarget.value); setError('') }}
        autofocus
      />
      <p class="import-count">
        {copy.lineCount(check.lines)}{check.blank > 0 && check.lines > 0 ? ' ' + plural(check.blank, { one: '(# empty line is skipped)', other: '(# empty lines are skipped)' }) : ''}
      </p>
      {existingCount > 0 && (
        <fieldset class="import-mode">
          <legend>{copy.existing(existingCount)}</legend>
          <label>
            <input type="radio" name="import-mode" checked={mode === 'append'} onChange={() => setMode('append')} />
            <span>{t`Add at the end`}</span>
          </label>
          <label>
            <input type="radio" name="import-mode" checked={mode === 'replace'} onChange={() => setMode('replace')} />
            <span>{t`Replace the existing ones`}</span>
          </label>
          {mode === 'replace' && <span class="import-help">{copy.replaceHelp}</span>}
        </fieldset>
      )}
      {(check.problem ?? error) && <p class="form-error" role="alert">{check.problem ?? error}</p>}
    </Modal>
  )
}
