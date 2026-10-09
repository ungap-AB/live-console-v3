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

const COPY = {
  agenda: {
    title: 'Importera dagordning',
    subtitle: 'En punkt per rad.',
    placeholder: 'Kommunfullmäktiges sammanträde\nVal av justerare\nFrågor',
    noun: 'punkter',
    replaceHelp: 'Befintliga punkter ersätts efter plats: de behåller bilagor och Meeting-koppling men får ny rubrik och tom referens. Punkter utan motsvarande rad tas bort.',
  },
  namelist: {
    title: 'Importera namn',
    subtitle: 'Ett namn per rad.',
    placeholder: 'Anna Andersson\nBo Berg\nCecilia Carlsson',
    noun: 'namn',
    replaceHelp: 'Befintliga namn ersätts efter plats: de får nytt namn och tomt parti och titel. Namn utan motsvarande rad tas bort.',
  },
} as const

// UNG-197: delad dialog för att importera dagordningspunkter och namn. Hela texten skickas i ETT anrop och servern delar upp den och sparar
// allt eller inget. "Lägg till sist" är förvalt: att skriva över är ett aktivt val.
export function ImportTextDialog({ kind, existingCount, onClose, run }: ImportTextDialogProps) {
  const copy = COPY[kind]
  const [text, setText] = useState('')
  const [mode, setMode] = useState<ImportMode>('append')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [done, setDone] = useState<string | null>(null)
  const check = useMemo(() => checkImportText(text), [text])

  async function submit() {
    if (busy) return
    if (check.lines === 0) {
      setError(`Klistra in minst en rad, en ${kind === 'agenda' ? 'punkt' : 'person'} per rad.`)
      return
    }
    setBusy(true)
    setError('')
    try {
      setDone(importSummary(kind, await run(text, existingCount > 0 ? mode : 'append')))
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Importen misslyckades. Inget importerades.')
    } finally {
      setBusy(false)
    }
  }

  if (done !== null) {
    return (
      <Modal title={copy.title} onClose={onClose} footer={<button class="btn btn-sm primary" type="button" onClick={onClose}>Klart</button>}>
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
          <button class="btn btn-sm" type="button" disabled={busy} onClick={onClose}>Avbryt</button>
          <button class="btn btn-sm primary" type="button" disabled={busy || check.problem !== null} onClick={() => void submit()}>
            {busy ? 'Importerar…' : 'Importera'}
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
        {check.lines} {copy.noun}{check.blank > 0 && check.lines > 0 ? ` (${check.blank} tomma rader hoppas över)` : ''}
      </p>
      {existingCount > 0 && (
        <fieldset class="import-mode">
          <legend>Befintliga {copy.noun} ({existingCount})</legend>
          <label>
            <input type="radio" name="import-mode" checked={mode === 'append'} onChange={() => setMode('append')} />
            <span>Lägg till sist</span>
          </label>
          <label>
            <input type="radio" name="import-mode" checked={mode === 'replace'} onChange={() => setMode('replace')} />
            <span>Ersätt de befintliga</span>
          </label>
          {mode === 'replace' && <span class="import-help">{copy.replaceHelp}</span>}
        </fieldset>
      )}
      {(check.problem ?? error) && <p class="form-error" role="alert">{check.problem ?? error}</p>}
    </Modal>
  )
}
