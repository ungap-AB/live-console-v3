import { t } from '@lingui/core/macro'
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
  captionDraftAvailability, chaptersExportAvailability, copiedMessage, importAvailability, publishedCaptionsAvailability, savedMessage, videoDownloadAvailability, type Availability, type ImportHandlers,
} from './exportImportLogic'
import { DownloadButton } from './RecordingDownload'
import { ManuscriptSpeakersWarning, speakersGap, type SpeakersGap } from './ManuscriptSpeakersWarning'
import { UploadPanel } from './UploadPanel'
import { useRecordingDownloads } from './useRecordingDownloads'
import './ExportImportDialog.css'

interface ExportImportDialogProps extends ImportHandlers {
  project: Project
  onClose: () => void
  /** Från projektlistan: öppnar projektet, där importerna görs. */
  onOpenProject?: () => void
}

type Mode = 'export' | 'import'
type Category = 'chapters' | 'captions' | 'video'
interface RowStatus { kind: 'ok' | 'error'; text: string }

// The same categories under Export and Import; the chosen category follows along when switching between them.
const categoryTabs = () => [
  { id: 'chapters', label: t`Chapters` },
  { id: 'captions', label: t`Captions` },
  { id: 'video', label: t`Video` },
]

const modeTabs = () => [
  { id: 'export', label: t`Export` },
  { id: 'import', label: t`Import` },
]

function originalFileName(name: string): string {
  return t`${name} (original)`
}

function trimmedFileName(name: string): string {
  return t`${name} (trimmed)`
}

export function saveFile(fileName: string, content: string | Blob, type: string) {
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
export function ExportImportDialog({ project, onClose, onOpenProject, onImportChapters, onOpenCaptions, upload }: ExportImportDialogProps) {
  const [mode, setMode] = useState<Mode>('export')
  const [category, setCategory] = useState<Category>('chapters')
  const [includeSpeakers, setIncludeSpeakers] = useState(false)
  const [statuses, setStatuses] = useState<Record<string, RowStatus>>({})
  const [copied, setCopied] = useState(false)
  const [wordBusy, setWordBusy] = useState(false)
  const [captionBusy, setCaptionBusy] = useState<string | null>(null)
  const [shareRecordingId, setShareRecordingId] = useState<string | null>(null)
  const copyTimer = useRef<number | undefined>(undefined)
  const { downloads, start: startDownload } = useRecordingDownloads()

  const chaptersAvailability = chaptersExportAvailability(project)
  const videoAvailability = videoDownloadAvailability(project)
  const publishedCaptions = publishedCaptionsAvailability(project)
  const draftCaptions = captionDraftAvailability(project)
  const imports = importAvailability({ onImportChapters, onOpenCaptions, upload })
  // En fil som överförs från webbläsaren: dialogen står kvar tills överföringen är klar.
  const [uploadBusy, setUploadBusy] = useState(false)
  const recordingId = project.recording?.id

  const [chapterData, setChapterData] = useState<ChapterExportData | null>(null)
  const [chapterError, setChapterError] = useState<string | null>(null)
  useEffect(() => {
    if (!chaptersAvailability.enabled || !recordingId) return
    let cancelled = false
    loadChapterExportData(project.id, recordingId).then(
      (data) => { if (!cancelled) setChapterData(data) },
      (reason) => { if (!cancelled) setChapterError(reason instanceof Error ? reason.message : t`The chapters could not be read.`) },
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
      report('youtube', 'error', t`Copying failed. Select the text and copy it yourself.`)
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
      report('word', 'error', reason instanceof Error ? reason.message : t`The document could not be created.`)
    } finally {
      setWordBusy(false)
    }
  }

  // Undertexter: servern läser den publicerade filen ur lagringen (VTT som den är, SRT omräknad) så att den hör till den publicerade videon.
  const saveCaptions = async (format: 'vtt' | 'srt') => {
    setCaptionBusy(format)
    try {
      const blob = await client.projects.exportCaptions(project.id, format)
      const fileName = exportFileName(project.name, 'undertexter', format)
      saveFile(fileName, blob, format === 'vtt' ? 'text/vtt;charset=utf-8' : 'application/x-subrip;charset=utf-8')
      report(`captions-${format}`, 'ok', savedMessage(fileName))
    } catch (reason) {
      report(`captions-${format}`, 'error', reason instanceof Error ? reason.message : t`The captions could not be fetched.`)
    } finally {
      setCaptionBusy(null)
    }
  }

  // UNG-141: manus ur arbetskopian av undertexterna (senast sparade version), ordnat efter punkter och talare, utan tidsstämplar.
  // UNG-296: saknas talarbytena (eller analyseras de) får operatören välja: ta ut manuset utan talare nu, och/eller analysera dem.
  const [speakersWarning, setSpeakersWarning] = useState<{ scope: 'published' | 'whole'; gap: SpeakersGap } | null>(null)
  const requestManuscript = async (scope: 'published' | 'whole') => {
    setCaptionBusy(`manuscript-${scope}`)
    const gap = await speakersGap(project.id)
    if (gap) {
      setCaptionBusy(null)
      setSpeakersWarning({ scope, gap })
      return
    }
    await saveManuscript(scope)
  }

  const saveManuscript = async (scope: 'published' | 'whole') => {
    setSpeakersWarning(null)
    setCaptionBusy(`manuscript-${scope}`)
    try {
      const blob = await client.projects.exportManuscriptDocx(project.id, scope)
      const fileName = exportFileName(project.name, 'manus', 'docx')
      saveFile(fileName, blob, 'application/vnd.openxmlformats-officedocument.wordprocessingml.document')
      report('captions-manuscript', 'ok', savedMessage(fileName))
    } catch (reason) {
      report('captions-manuscript', 'error', reason instanceof Error ? reason.message : t`The manuscript could not be created.`)
    } finally {
      setCaptionBusy(null)
    }
  }

  const saveCaptionDraft = async () => {
    setCaptionBusy('draft')
    try {
      await client.projects.downloadCaptionDraft(project.id)
      report('captions-draft', 'ok', t`The draft was downloaded as a .vtt file.`)
    } catch (reason) {
      report('captions-draft', 'error', reason instanceof Error ? reason.message : t`The draft could not be fetched.`)
    } finally {
      setCaptionBusy(null)
    }
  }

  const noChapters = exports !== null && exports.count === 0
  const chapterRowAvailability: Availability = chapterError
    ? { enabled: false, reason: chapterError }
    : !chaptersAvailability.enabled
      ? chaptersAvailability
      : !exports
        ? { enabled: false, reason: t`Reading the chapters…` }
        : noChapters
          ? { enabled: false, reason: t`There are no chapters to export.` }
          : { enabled: true }

  const openProject = onOpenProject && (
    <button class="btn btn-sm" type="button" onClick={() => { onOpenProject(); onClose() }}>{t`Open the project`}</button>
  )
  const leave = (action: () => void) => () => { onClose(); action() }

  return (
    <Modal
      title={t`Export and import`}
      subtitle={project.name}
      wide
      className="ei-dialog"
      closeDisabled={uploadBusy}
      onClose={onClose}
      footer={<button class="btn" type="button" disabled={uploadBusy} title={uploadBusy ? t`Wait until the transfer is done` : undefined} onClick={onClose}>{t`Close`}</button>}
    >
      <Tabs tabs={modeTabs()} active={mode} onChange={(id) => setMode(id as Mode)} label={t`Export and import`} idPrefix="eid" />

      <div class="ei-panel" role="tabpanel" id={`eid-panel-${mode}`} aria-labelledby={`eid-tab-${mode}`}>
        {mode === 'export' ? (
          <>
            <Tabs tabs={categoryTabs()} active={category} onChange={(id) => setCategory(id as Category)} label={t`What do you want to export`} idPrefix="eis" />
            <div class="ei-subpanel" role="tabpanel" id={`eis-panel-${category}`} aria-labelledby={`eis-tab-${category}`}>
            {category === 'chapters' && (
            <section class="ei-group" aria-label={t`Chapters`}>
              <p class="ei-help">{t`The times are counted from the start of the published video.`}</p>
              {chaptersAvailability.enabled && (
                <label class="ps-switch ei-option">
                  <input type="checkbox" checked={includeSpeakers} onChange={(event) => setIncludeSpeakers((event.target as HTMLInputElement).checked)} />
                  <span>{t`Include speakers as chapters of their own (YouTube and WebVTT)`}</span>
                </label>
              )}
              <ul class="ei-list">
                <Row title={t`YouTube chapters`} description={t`Text to paste into the video's description on YouTube.`} availability={chapterRowAvailability} status={statuses.youtube}>
                  {exports && (
                    <>
                      <details class="ei-preview">
                        <summary>{t`Show the text`}</summary>
                        <pre class="ei-text" aria-label={t`YouTube chapters`}>{exports.youtube.text}</pre>
                      </details>
                      <button class="btn btn-sm" type="button" onClick={() => void copyYoutube()}>{copied ? t`Copied ✓` : t`Copy`}</button>
                      <button class="btn btn-sm" type="button" onClick={() => saveText('youtube', t`chapters youtube`, 'txt', exports.youtube.text + '\n', 'text/plain;charset=utf-8')}>{t`Download .txt`}</button>
                      {exports.youtube.notes.length > 0 && (
                        <ul class="ei-notes">{exports.youtube.notes.map((note) => <li key={note}>{note}</li>)}</ul>
                      )}
                    </>
                  )}
                </Row>
                <Row title={t`WebVTT chapters (.vtt)`} description={t`Chapters as time ranges, for players and platforms that read WebVTT chapters.`} availability={chapterRowAvailability} status={statuses.vtt}>
                  <button class="btn btn-sm" type="button" onClick={() => exports && saveText('vtt', t`chapters`, 'vtt', exports.vtt, 'text/vtt;charset=utf-8')}>{t`Download`}</button>
                </Row>
                <Row title={t`ungap Chapters (.json)`} description={t`Presenter's own format with all chapters and speakers, for backup and moving.`} availability={chapterRowAvailability} status={statuses.json}>
                  <button class="btn btn-sm" type="button" onClick={() => exports && saveText('json', t`chapters`, 'json', exports.json, 'application/json;charset=utf-8')}>{t`Download`}</button>
                </Row>
                <Row title={t`Chapters for archiving (Word)`} description={t`Document with items and start times, speakers, attachment names and breaks.`} availability={chapterRowAvailability} status={statuses.word}>
                  <button class="btn btn-sm" type="button" disabled={wordBusy} onClick={() => void saveWord()}>{wordBusy ? t`Creating the document…` : t`Download`}</button>
                </Row>
              </ul>
            </section>
            )}

            {category === 'captions' && (
            <section class="ei-group" aria-label={t`Captions`}>
              <p class="ei-help">{t`The published captions are in the published video's time.`}</p>
              <ul class="ei-list">
                <Row title={t`Captions (.vtt)`} description={t`WebVTT, which the player and most video platforms read.`} availability={publishedCaptions} status={statuses['captions-vtt']}>
                  <button class="btn btn-sm" type="button" disabled={captionBusy !== null} onClick={() => void saveCaptions('vtt')}>{captionBusy === 'vtt' ? t`Fetching…` : t`Download`}</button>
                </Row>
                <Row title={t`Captions (.srt)`} description={t`SRT, for editing software and platforms that do not read WebVTT.`} availability={publishedCaptions} status={statuses['captions-srt']}>
                  <button class="btn btn-sm" type="button" disabled={captionBusy !== null} onClick={() => void saveCaptions('srt')}>{captionBusy === 'srt' ? t`Fetching…` : t`Download`}</button>
                </Row>
                <Row title={t`Manuscript (Word)`} description={t`The whole transcription as running text under agenda items and speakers, without timestamps. The document says whether the text is an unreviewed draft or approved.`} availability={draftCaptions} status={statuses['captions-manuscript']}>
                  <button class="btn btn-sm" type="button" disabled={captionBusy !== null} onClick={() => void requestManuscript('published')}>{captionBusy === 'manuscript-published' ? t`Creating…` : t`Published part`}</button>
                  <button class="btn btn-sm" type="button" disabled={captionBusy !== null} onClick={() => void requestManuscript('whole')}>{captionBusy === 'manuscript-whole' ? t`Creating…` : t`The whole recording`}</button>
                </Row>
                <Row title={t`Draft for editing (.vtt)`} description={t`The whole draft, with any unpublished changes, in the original recording's time.`} availability={draftCaptions} status={statuses['captions-draft']}>
                  <button class="btn btn-sm" type="button" disabled={captionBusy !== null} onClick={() => void saveCaptionDraft()}>{captionBusy === 'draft' ? t`Fetching…` : t`Download`}</button>
                </Row>
              </ul>
            </section>
            )}

            {category === 'video' && (
            <section class="ei-group" aria-label={t`Video`}>
              <ul class="ei-list">
                <Row
                  title={t`Video (MP4)`}
                  description={t`Prepared as a file to download. The file is kept for 7 days.`}
                  availability={videoAvailability.enabled && !videoIds ? { enabled: false, reason: t`Reading the video…` } : videoAvailability}
                >
                  {videoIds?.sourceId && (
                    <DownloadButton
                      label={t`Download original recording`}
                      fileName={originalFileName(project.name)}
                      download={downloads[videoIds.sourceId]}
                      onDownload={() => void startDownload(videoIds.sourceId!)}
                      onShare={() => setShareRecordingId(videoIds.sourceId!)}
                    />
                  )}
                  {videoIds?.trimmedId && (
                    <DownloadButton
                      label={t`Download trimmed version`}
                      fileName={trimmedFileName(project.name)}
                      download={downloads[videoIds.trimmedId]}
                      onDownload={() => void startDownload(videoIds.trimmedId!)}
                      onShare={() => setShareRecordingId(videoIds.trimmedId!)}
                    />
                  )}
                </Row>
              </ul>
            </section>
            )}
            </div>
          </>
        ) : (
          <>
            <Tabs tabs={categoryTabs()} active={category} onChange={(id) => setCategory(id as Category)} label={t`What do you want to import`} idPrefix="eii" />
            <div class="ei-subpanel" role="tabpanel" id={`eii-panel-${category}`} aria-labelledby={`eii-tab-${category}`}>
            {/* Alla tre ligger kvar (dolda), så att en pågående videouppladdning inte avbryts av ett kategoribyte. */}
            <section class="ei-group" aria-label={t`Chapters`} hidden={category !== 'chapters'}>
              <ul class="ei-list">
                <Row title={t`Chapters`} description={t`From the agenda, a name list or a pasted list with times.`} availability={imports.chapters} fallbackAction={openProject}>
                  <button class="btn btn-sm" type="button" onClick={leave(() => onImportChapters?.())}>{t`Import chapters…`}</button>
                </Row>
              </ul>
            </section>
            <section class="ei-group" aria-label={t`Captions`} hidden={category !== 'captions'}>
              <ul class="ei-list">
                <Row title={t`Captions`} description={t`In the editor: import your own VTT file (the ⋯ menu) or create captions automatically. Published with Publish changes.`} availability={imports.captions} fallbackAction={openProject}>
                  <button class="btn btn-sm" type="button" onClick={leave(() => onOpenCaptions?.())}>{t`Open the editor…`}</button>
                </Row>
              </ul>
            </section>
            <section class="ei-group" aria-label={t`Video`} hidden={category !== 'video'}>
              <ul class="ei-list">
                <Row title={t`Video`} description={t`Upload a file or enter an HLS address.`} availability={imports.upload} fallbackAction={upload ? undefined : openProject}>
                  {upload && (
                    <div class="ei-upload">
                      <UploadPanel
                        projectId={project.id}
                        projectName={project.name}
                        replacing={upload.replacing}
                        failed={false}
                        onBusyChange={setUploadBusy}
                        onUploaded={() => {
                          upload.onUploaded()
                          onClose()
                        }}
                      />
                    </div>
                  )}
                </Row>
              </ul>
            </section>
            </div>
          </>
        )}
      </div>
      {shareRecordingId && <ShareDialog initialRecordingIds={[shareRecordingId]} onClose={() => setShareRecordingId(null)} />}
      {speakersWarning && (
        <ManuscriptSpeakersWarning
          projectId={project.id}
          gap={speakersWarning.gap}
          onClose={() => setSpeakersWarning(null)}
          onExport={() => void saveManuscript(speakersWarning.scope)}
        />
      )}
    </Modal>
  )
}
