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
      setError(err instanceof ApiError || err instanceof Error ? err.message : 'Filen kunde inte läsas in.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <Modal
      title="Läs in rättningar från Word"
      onClose={onClose}
      closeDisabled={busy}
      footer={(
        <>
          <button class="btn btn-sm" type="button" disabled={busy} onClick={onClose}>Avbryt</button>
          <button class="btn btn-sm btn-primary" type="button" disabled={!file || busy || blockedByEdits} onClick={() => void read()}>
            {busy ? 'Läser in…' : 'Läs in'}
          </button>
        </>
      )}
    >
      <p>
        Rätta texten direkt i Word-dokumentet (manuset) som du skrivit ut från ungap, spara filen och välj den här. Rättningarna läggs in som förslag i
        undertexterna, och inget sparas förrän du sparar.
      </p>
      <ul class="ce-word-hints">
        <li>Rätta bara själva texten. Rubriker (punkter och talare) läses inte och ändringar i dem följer inte med.</li>
        <li>Du kan använda Spåra ändringar i Word. Alla spårade ändringar läses som om du godkänt dem.</li>
        <li>Text du tar bort tas bort ur rutan, och text du lägger till hamnar i rutan där den hör hemma. Rutor ändras bara där du ändrat något.</li>
      </ul>
      {blockedByEdits && <p class="ce-error-text" role="alert">Du har osparade ändringar. Spara eller ångra dem först.</p>}
      <label class="ce-word-file">
        <span>Word-fil (.docx)</span>
        <input
          type="file"
          accept=".docx,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
          onChange={(event) => { setFile(event.currentTarget.files?.[0] ?? null); setError('') }}
        />
      </label>
      <details class="ce-word-advanced" open={startWithBaseChoice}>
        <summary>Dokumentet stämmer inte? Välj version att jämföra mot</summary>
        <p class="ce-regen-hint">
          Som standard jämförs dokumentet mot den version av undertexterna som manuset skrevs ut från. Välj en annan om den har gallrats eller
          om dokumentet kommer från en annan version.
        </p>
        <select value={baseChoice} onChange={(event) => setBaseChoice(event.currentTarget.value)} aria-label="Version att jämföra mot">
          <option value="auto">Den version manuset skrevs ut från (rekommenderas)</option>
          {(versions ?? []).map((item) => (
            <option key={item.version} value={String(item.version)}>
              Version {item.version}{item.current ? ' (nuvarande)' : ''}{item.published ? ' (publicerad)' : ''} · {new Date(item.createdAtUtc).toLocaleString('sv-SE', { dateStyle: 'short', timeStyle: 'short' })}
            </option>
          ))}
        </select>
      </details>
      {error && <p class="ce-error-text" role="alert">{error}</p>}
    </Modal>
  )
}
