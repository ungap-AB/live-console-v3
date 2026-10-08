import { useEffect, useMemo, useRef, useState } from 'preact/hooks'
import type { ComponentChildren } from 'preact'
import { client } from '../../data'
import type { Project } from '../../data/types'
import { Modal } from '../../components/Modal'
import { Tabs } from '../../components/Tabs'
import { ShareDialog } from '../../components/ShareDialog'
import { buildExportChapters, exportFileName, toUngapChaptersJson, toWebVttChapters, toYoutubeChapters } from './chapterExport'
import { loadChapterExportData, type ChapterExportData } from './chapterExportData'
import {
  chaptersExportAvailability, copiedMessage, importAvailability, savedMessage, videoDownloadAvailability, type Availability, type ImportHandlers,
} from './exportImportLogic'
import { DownloadButton } from './RecordingDownload'
import { useRecordingDownloads } from './useRecordingDownloads'
import './ExportImportDialog.css'

interface ExportImportDialogProps extends ImportHandlers {
  project: Project
  onClose: () => void
  /** Från projektlistan: öppnar projektet, där importerna görs. */
  onOpenProject?: () => void
}

type Mode = 'export' | 'import'
interface RowStatus { kind: 'ok' | 'error'; text: string }

const MODES = [
  { id: 'export', label: 'Exportera' },
  { id: 'import', label: 'Importera' },
] as const

function saveFile(fileName: string, content: string | Blob, type: string) {
  const url = URL.createObjectURL(content instanceof Blob ? content : new Blob([content], { type }))
  const link = document.createElement('a')
  link.href = url
  link.download = fileName
  link.click()
  window.setTimeout(() => URL.revokeObjectURL(url), 1000)
}

interface RowProps {
  title: string
  description: string
  availability: Availability
  status?: RowStatus
  /** Knappar som visas när raden går att använda. */
  children?: ComponentChildren
  /** Visas i stället för knapparna när raden inte går att använda, bredvid förklaringen. */
  fallbackAction?: ComponentChildren
}

function Row({ title, description, availability, status, children, fallbackAction }: RowProps) {
  return (
    <li class={`ei-row${availability.enabled ? '' : ' is-disabled'}`}>
      <div class="ei-head">
        <strong>{title}</strong>
        <small>{description}</small>
      </div>
      {availability.enabled ? (
        <div class="ei-actions">{children}</div>
      ) : (
        <div class="ei-reason">
          <span>{availability.reason}</span>
          {fallbackAction}
        </div>
      )}
      {status && <p class={`ei-status is-${status.kind}`} role={status.kind === 'error' ? 'alert' : 'status'}>{status.text}</p>}
    </li>
  )
}

// UNG-193/194: allt som går ut ur (och in i) ett projekt på ett ställe, med återkoppling på raden där man gjorde något. Raderna beskrivs av
// rena funktioner (exportImportLogic.ts); här ritas de. Öppnas från ...-menyn på projektraden och från projektet självt.
export function ExportImportDialog({ project, onClose, onOpenProject, onImportChapters, onOpenVideoActions }: ExportImportDialogProps) {
  const [mode, setMode] = useState<Mode>('export')
  const [includeSpeakers, setIncludeSpeakers] = useState(false)
  const [statuses, setStatuses] = useState<Record<string, RowStatus>>({})
  const [copied, setCopied] = useState(false)
  const [wordBusy, setWordBusy] = useState(false)
  const [shareRecordingId, setShareRecordingId] = useState<string | null>(null)
  const copyTimer = useRef<number | undefined>(undefined)
  const { downloads, start: startDownload } = useRecordingDownloads()

  const chaptersAvailability = chaptersExportAvailability(project)
  const videoAvailability = videoDownloadAvailability(project)
  const imports = importAvailability({ onImportChapters, onOpenVideoActions })
  const recordingId = project.recording?.id

  const [chapterData, setChapterData] = useState<ChapterExportData | null>(null)
  const [chapterError, setChapterError] = useState<string | null>(null)
  useEffect(() => {
    if (!chaptersAvailability.enabled || !recordingId) return
    let cancelled = false
    loadChapterExportData(project.id, recordingId).then(
      (data) => { if (!cancelled) setChapterData(data) },
      (reason) => { if (!cancelled) setChapterError(reason instanceof Error ? reason.message : 'Kapitlen kunde inte läsas.') },
    )
    return () => { cancelled = true }
  }, [project.id, recordingId, chaptersAvailability.enabled])

  // Original och trimmad version: en trimmad inspelning pekar på sitt original.
  const [videoIds, setVideoIds] = useState<{ sourceId?: string; trimmedId?: string } | null>(null)
  useEffect(() => {
    if (!videoAvailability.enabled || !recordingId) return
    let cancelled = false
    client.recordings.get(recordingId).then((recording) => {
      if (cancelled || !recording) return
      setVideoIds(recording.kind === 'trimmed' ? { sourceId: recording.parentId, trimmedId: recording.id } : { sourceId: recording.id })
    }, () => { if (!cancelled) setVideoIds({}) })
    return () => { cancelled = true }
  }, [recordingId, videoAvailability.enabled])

  useEffect(() => () => window.clearTimeout(copyTimer.current), [])

  const exports = useMemo(() => {
    if (!chapterData) return null
    const selected = buildExportChapters(chapterData.chapters, chapterData.window, { includeSpeakers })
    const everything = buildExportChapters(chapterData.chapters, chapterData.window, { includeSpeakers: true })
    return {
      count: selected.length,
      youtube: toYoutubeChapters(selected, chapterData.window.durationSeconds, project.name),
      vtt: toWebVttChapters(selected),
      json: toUngapChaptersJson(everything, { title: project.name, durationSeconds: chapterData.window.durationSeconds }),
    }
  }, [chapterData, includeSpeakers, project.name])

  const report = (id: string, kind: RowStatus['kind'], text: string) => setStatuses((current) => ({ ...current, [id]: { kind, text } }))

  const copyYoutube = async () => {
    if (!exports) return
    try {
      await navigator.clipboard.writeText(exports.youtube.text)
      report('youtube', 'ok', copiedMessage(exports.youtube.count))
      setCopied(true)
      window.clearTimeout(copyTimer.current)
      copyTimer.current = window.setTimeout(() => setCopied(false), 3000)
    } catch {
      report('youtube', 'error', 'Det gick inte att kopiera. Markera texten och kopiera själv.')
    }
  }

  const saveText = (id: string, suffix: string, extension: string, content: string, type: string) => {
    const fileName = exportFileName(project.name, suffix, extension)
    saveFile(fileName, content, type)
    report(id, 'ok', savedMessage(fileName))
  }

  const saveWord = async () => {
    setWordBusy(true)
    try {
      const blob = await client.projects.exportChaptersDocx(project.id)
      const fileName = exportFileName(project.name, 'kapitel', 'docx')
      saveFile(fileName, blob, 'application/vnd.openxmlformats-officedocument.wordprocessingml.document')
      report('word', 'ok', savedMessage(fileName))
    } catch (reason) {
      report('word', 'error', reason instanceof Error ? reason.message : 'Dokumentet kunde inte skapas.')
    } finally {
      setWordBusy(false)
    }
  }

  const noChapters = exports !== null && exports.count === 0
  const chapterRowAvailability: Availability = chapterError
    ? { enabled: false, reason: chapterError }
    : !chaptersAvailability.enabled
      ? chaptersAvailability
      : !exports
        ? { enabled: false, reason: 'Läser kapitlen…' }
        : noChapters
          ? { enabled: false, reason: 'Det finns inga kapitel att exportera.' }
          : { enabled: true }

  const openProject = onOpenProject && (
    <button class="btn btn-sm" type="button" onClick={() => { onOpenProject(); onClose() }}>Öppna projektet</button>
  )
  const leave = (action: () => void) => () => { onClose(); action() }

  return (
    <Modal
      title="Exportera och importera"
      subtitle={project.name}
      wide
      className="ei-dialog"
      onClose={onClose}
      footer={<button class="btn" type="button" onClick={onClose}>Stäng</button>}
    >
      <Tabs tabs={MODES} active={mode} onChange={(id) => setMode(id as Mode)} label="Exportera och importera" idPrefix="eid" />

      <div class="ei-panel" role="tabpanel" id={`eid-panel-${mode}`} aria-labelledby={`eid-tab-${mode}`}>
        {mode === 'export' ? (
          <>
            <section class="ei-group" aria-labelledby="ei-chapters">
              <h3 id="ei-chapters">Kapitel</h3>
              <p class="ei-help">Tiderna räknas från den publicerade videons start.</p>
              {chaptersAvailability.enabled && (
                <label class="ps-switch ei-option">
                  <input type="checkbox" checked={includeSpeakers} onChange={(event) => setIncludeSpeakers((event.target as HTMLInputElement).checked)} />
                  <span>Ta med talare som egna kapitel (YouTube och WebVTT)</span>
                </label>
              )}
              <ul class="ei-list">
                <Row title="YouTube-kapitel" description="Text att klistra in i videons beskrivning på YouTube." availability={chapterRowAvailability} status={statuses.youtube}>
                  {exports && (
                    <>
                      <details class="ei-preview">
                        <summary>Visa texten</summary>
                        <pre class="ei-text" aria-label="YouTube-kapitel">{exports.youtube.text}</pre>
                      </details>
                      <button class="btn btn-sm" type="button" onClick={() => void copyYoutube()}>{copied ? 'Kopierat ✓' : 'Kopiera'}</button>
                      <button class="btn btn-sm" type="button" onClick={() => saveText('youtube', 'kapitel youtube', 'txt', exports.youtube.text + '\n', 'text/plain;charset=utf-8')}>Ladda ner .txt</button>
                      {exports.youtube.notes.length > 0 && (
                        <ul class="ei-notes">{exports.youtube.notes.map((note) => <li key={note}>{note}</li>)}</ul>
                      )}
                    </>
                  )}
                </Row>
                <Row title="WebVTT-kapitel (.vtt)" description="Kapitel som tidsintervall, för spelare och plattformar som läser WebVTT-kapitel." availability={chapterRowAvailability} status={statuses.vtt}>
                  <button class="btn btn-sm" type="button" onClick={() => exports && saveText('vtt', 'kapitel', 'vtt', exports.vtt, 'text/vtt;charset=utf-8')}>Ladda ner</button>
                </Row>
                <Row title="ungap Chapters (.json)" description="Presenters eget format med alla kapitel och talare, för säkerhetskopia och flytt." availability={chapterRowAvailability} status={statuses.json}>
                  <button class="btn btn-sm" type="button" onClick={() => exports && saveText('json', 'kapitel', 'json', exports.json, 'application/json;charset=utf-8')}>Ladda ner</button>
                </Row>
                <Row title="Kapitel för arkivering (Word)" description="Dokument med punkter och starttider, talare, bilagornas namn och pauser." availability={chapterRowAvailability} status={statuses.word}>
                  <button class="btn btn-sm" type="button" disabled={wordBusy} onClick={() => void saveWord()}>{wordBusy ? 'Skapar dokumentet…' : 'Ladda ner'}</button>
                </Row>
              </ul>
            </section>

            <section class="ei-group" aria-labelledby="ei-video">
              <h3 id="ei-video">Video</h3>
              <ul class="ei-list">
                <Row
                  title="Video (MP4)"
                  description="Förbereds som en fil att ladda ner. Filen sparas i 7 dagar."
                  availability={videoAvailability.enabled && !videoIds ? { enabled: false, reason: 'Läser videon…' } : videoAvailability}
                >
                  {videoIds?.sourceId && (
                    <DownloadButton
                      label="Ladda ner originalinspelning"
                      fileName={`${project.name} (original)`}
                      download={downloads[videoIds.sourceId]}
                      onDownload={() => void startDownload(videoIds.sourceId!)}
                      onShare={() => setShareRecordingId(videoIds.sourceId!)}
                    />
                  )}
                  {videoIds?.trimmedId && (
                    <DownloadButton
                      label="Ladda ner trimmad version"
                      fileName={`${project.name} (trimmad)`}
                      download={downloads[videoIds.trimmedId]}
                      onDownload={() => void startDownload(videoIds.trimmedId!)}
                      onShare={() => setShareRecordingId(videoIds.trimmedId!)}
                    />
                  )}
                </Row>
              </ul>
            </section>
          </>
        ) : (
          <section class="ei-group" aria-labelledby="ei-import">
            <h3 id="ei-import">Läs in i projektet</h3>
            <ul class="ei-list">
              <Row title="Kapitel" description="Från dagordningen, en namnlista eller en klistrad lista med tider." availability={imports.chapters} fallbackAction={openProject}>
                <button class="btn btn-sm" type="button" onClick={leave(() => onImportChapters?.())}>Importera kapitel…</button>
              </Row>
              <Row title="Undertexter" description="Läs in en egen VTT-fil eller skapa undertexter automatiskt." availability={imports.captions} fallbackAction={openProject}>
                <button class="btn btn-sm" type="button" onClick={leave(() => onOpenVideoActions?.('captions'))}>Undertexter…</button>
              </Row>
              <Row title="Video" description="Ladda upp en fil eller ange en HLS-adress." availability={imports.upload} fallbackAction={openProject}>
                <button class="btn btn-sm" type="button" onClick={leave(() => onOpenVideoActions?.('upload'))}>Ladda upp video…</button>
              </Row>
            </ul>
          </section>
        )}
      </div>
      {shareRecordingId && <ShareDialog initialRecordingIds={[shareRecordingId]} onClose={() => setShareRecordingId(null)} />}
    </Modal>
  )
}
