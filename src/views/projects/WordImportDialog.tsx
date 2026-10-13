import { t } from '@lingui/core/macro'
import { i18n } from '@lingui/core'
import { useEffect, useState } from 'preact/hooks'
import { client } from '../../data'
import { ApiError } from '../../data/http/fetchJson'
import type { CaptionVersionInfo, WordImportResult } from '../../data/types'
import { Modal } from '../../components/Modal'

interface WordImportDialogProps {
  projectId: string
  /** Osparade ändringar i redigeraren: inläsningen utgår från den sparade versionen, så de måste sparas eller ångras först. */
  blockedByEdits: boolean
  /** Visa valet av version att jämföra mot från början (t.ex. när dokumentet inte stämde med sin bas). */
  startWithBaseChoice?: boolean
  onClose: () => void
  onResult: (result: WordImportResult) => void
}

// UNG-147: läs in ett rättat manus (Word). Texten riktar sig till kyrkokansliets personal: rätta direkt i Word-filen, spara den, välj den här.
export function WordImportDialog({ projectId, blockedByEdits, startWithBaseChoice = false, onClose, onResult }: WordImportDialogProps) {
  const [file, setFile] = useState<File | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [versions, setVersions] = useState<CaptionVersionInfo[] | null>(null)
  const [baseChoice, setBaseChoice] = useState('auto')

  useEffect(() => {
    let cancelled = false
    client.projects.listCaptionVersions(projectId).then(
      (list) => { if (!cancelled) setVersions(list) },
      () => { if (!cancelled) setVersions([]) },
    )
    return () => { cancelled = true }
  }, [projectId])

  async function read() {
    if (!file || busy) return
    setBusy(true)
    setError('')
    try {
      onResult(await client.projects.importWordCorrections(projectId, file, baseChoice === 'auto' ? undefined : Number(baseChoice)))
    } catch (err) {
      setError(err instanceof ApiError || err instanceof Error ? err.message : t`The file could not be imported.`)
    } finally {
      setBusy(false)
    }
  }

  return (
    <Modal
      title={t`Import corrections from Word`}
      onClose={onClose}
      closeDisabled={busy}
      footer={(
        <>
          <button class="btn btn-sm" type="button" disabled={busy} onClick={onClose}>{t`Cancel`}</button>
          <button class="btn btn-sm btn-primary" type="button" disabled={!file || busy || blockedByEdits} onClick={() => void read()}>
            {busy ? t`Importing…` : t({ message: 'Import', context: 'Word corrections' })}
          </button>
        </>
      )}
    >
      <p>
        {t`Correct the text directly in the Word document (the manuscript) that you printed from ungap, save the file and choose it here. The corrections are added as suggestions in the captions, and nothing is saved until you save.`}
      </p>
      <ul class="ce-word-hints">
        <li>{t`Correct only the text itself. Headings (items and speakers) are not read and changes in them are not included.`}</li>
        <li>{t`You can use Track Changes in Word. All tracked changes are read as if you had accepted them.`}</li>
        <li>{t`Text you remove is removed from the box, and text you add ends up in the box where it belongs. Boxes are changed only where you changed something.`}</li>
      </ul>
      {blockedByEdits && <p class="ce-error-text" role="alert">{t`You have unsaved changes. Save or undo them first.`}</p>}
      <label class="ce-word-file">
        <span>{t`Word file (.docx)`}</span>
        <input
          type="file"
          accept=".docx,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
          onChange={(event) => { setFile(event.currentTarget.files?.[0] ?? null); setError('') }}
        />
      </label>
      <details class="ce-word-advanced" open={startWithBaseChoice}>
        <summary>{t`The document does not match? Choose a version to compare against`}</summary>
        <p class="ce-regen-hint">
          {t`By default the document is compared against the version of the captions that the manuscript was printed from. Choose another one if it has been pruned or if the document comes from another version.`}
        </p>
        <select value={baseChoice} onChange={(event) => setBaseChoice(event.currentTarget.value)} aria-label={t`Version to compare against`}>
          <option value="auto">{t`The version the manuscript was printed from (recommended)`}</option>
          {(versions ?? []).map((item) => (
            <option key={item.version} value={String(item.version)}>
              {t`Version ${item.version}`}{item.current ? ' ' + t`(current)` : ''}{item.published ? ' ' + t`(published)` : ''} · {new Date(item.createdAtUtc).toLocaleString(i18n.locales, { dateStyle: 'short', timeStyle: 'short' })}
            </option>
          ))}
        </select>
      </details>
      {error && <p class="ce-error-text" role="alert">{error}</p>}
    </Modal>
  )
}
