import { plural, t } from '@lingui/core/macro'
import { useEffect, useState } from 'preact/hooks'
import { client } from '../../data'
import type { Chapter, CueKind, Recording } from '../../data/types'
import { notifyJobsChanged, openJobsView } from '../../app/jobsBus'
import { readNotifyByEmail } from '../../app/notifyPreference'
import { useResource } from '../../app/useResource'
import { SplitPane } from '../../components/SplitPane'
import { NotifyCheckbox } from '../../components/NotifyCheckbox'
import { StatusChip } from '../../components/StatusChip'
import { CopyField } from '../../components/CopyField'
import { OverflowMenu } from '../../components/OverflowMenu'
import { ConfirmModal } from '../../components/ConfirmModal'
import { RenameModal } from '../../components/RenameModal'
import { Toast } from '../../components/Toast'
import { EditIcon } from '../../components/icons'
import { formatDateTime, formatGb, formatHms } from '../../app/time'
import './VideoArchiveView.css'
import { errorMessage, runOptimistic } from '../../app/optimistic'

function kindLabel(kind: CueKind): string {
  if (kind === 'agendaItem') return t`Agenda item`
  if (kind === 'person') return t`Speaker`
  if (kind === 'pauseIn') return t`Break`
  if (kind === 'pauseOut') return t`Break ends`
  return t`Announcement`
}

function clippedText(startSeconds: number, endSeconds: number): string {
  const start = formatHms(startSeconds)
  const end = formatHms(endSeconds)
  return t`Clipped ${start}–${end} from the original`
}

function isInRange(recording: Recording, chapter: Chapter): boolean {
  if (recording.kind === 'original' || !recording.trimRange) return true
  return (
    chapter.offsetSeconds >= recording.trimRange.startOffsetSeconds &&
    chapter.offsetSeconds <= recording.trimRange.endOffsetSeconds
  )
}

function displayOffset(recording: Recording, chapter: Chapter): number {
  if (recording.kind === 'trimmed' && recording.trimRange) {
    return chapter.offsetSeconds - recording.trimRange.startOffsetSeconds
  }
  return chapter.offsetSeconds
}

interface VideoArchiveViewProps {
  onOpenProject: (id: string) => void
}

export function VideoArchiveView({ onOpenProject }: VideoArchiveViewProps) {
  const resource = useResource(() => client.recordings.list(), [])
  const [recordings, setRecordings] = useState<Recording[]>([])
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [confirmTrash, setConfirmTrash] = useState<Recording | null>(null)
  const [creating, setCreating] = useState(false)
  const [renaming, setRenaming] = useState<Recording | null>(null)
  const [toast, setToast] = useState<string | null>(null)
  const [downloads, setDownloads] = useState<
    Record<string, { status: 'starting' | 'queued' | 'ready' | 'error'; url?: string; message?: string }>
  >({})

  useEffect(() => {
    if (resource.data) setRecordings(resource.data)
  }, [resource.data])

  useEffect(() => {
    if (!selectedId && recordings.length > 0) setSelectedId(recordings[0].id)
  }, [recordings, selectedId])

  const originals = recordings.filter((r) => r.kind === 'original')
  const childrenOf = (id: string) => recordings.filter((r) => r.kind === 'trimmed' && r.parentId === id)
  const rows = originals.flatMap((o) => [{ recording: o, child: false }, ...childrenOf(o.id).map((k) => ({ recording: k, child: true }))])

  // The list is deliberately light (no chapters) — full details, and for a trimmed
  // version also the original's chapters, are fetched separately when something is
  // selected. See PLAN-live-server-v3.md step 2. Checks local state FIRST (not only
  // on a client miss) — a just-created video resource (see createRecording) exists
  // only locally until creating is wired to a real backend.
  const detailResource = useResource(async () => {
    if (!selectedId) return null
    const recording = recordings.find((r) => r.id === selectedId) ?? (await client.recordings.get(selectedId))
    if (!recording) return null
    const original =
      recording.kind === 'trimmed' && recording.parentId ? await client.recordings.get(recording.parentId) : undefined
    return { recording, original: original ?? null }
  }, [selectedId])
  const [detail, setDetail] = useState<{ recording: Recording; original: Recording | null } | null>(null)

  useEffect(() => {
    setDetail(detailResource.data ?? null)
  }, [detailResource.data])

  const selected = detail?.recording ?? null
  const chapters = !detail ? [] : detail.recording.kind === 'original' ? detail.recording.chapters : detail.original?.chapters ?? []

  // Creating a real video resource (upload, reference to an existing IVS
  // recording, etc.) is not built yet — this view is a mock. "+ New" therefore
  // only creates an empty local placeholder (never saved to the client/backend)
  // and shows it; the flow stops there.
  function createRecording(name: string) {
    const draft: Recording = {
      id: `local-${Date.now()}`,
      kind: 'original',
      name,
      createdAt: new Date().toISOString(),
      durationSeconds: 0,
      sizeBytes: 0,
      resolution: '–',
      source: t`Added manually`,
      hlsUrl: '',
      project: null,
      segments: [],
      chapters: [],
    }
    setRecordings((prev) => [draft, ...prev])
    setSelectedId(draft.id)
    setCreating(false)
  }

  // The draft from createRecording (id "local-…") exists only in local state,
  // never in the client/backend — do not try to save it there.
  // UNG-105: the new name shows immediately; on failure it is restored and a toast shows the error.
  function patchRecordingName(id: string, name: string) {
    setRecordings((prev) => prev.map((r) => (r.id === id ? { ...r, name } : r)))
    setDetail((prev) => (prev && prev.recording.id === id ? { ...prev, recording: { ...prev.recording, name } } : prev))
  }

  function renameRecording(recording: Recording, name: string) {
    setRenaming(null)
    if (recording.id.startsWith('local-')) {
      patchRecordingName(recording.id, name)
      return
    }
    void runOptimistic({
      key: `recording:${recording.id}`,
      apply: () => {
        patchRecordingName(recording.id, name)
        return () => patchRecordingName(recording.id, recording.name)
      },
      request: () => client.recordings.rename(recording.id, name),
      onSuccess: (updated) => {
        setRecordings((prev) => prev.map((r) => (r.id === updated.id ? updated : r)))
        setDetail((prev) => (prev && prev.recording.id === updated.id ? { ...prev, recording: updated } : prev))
      },
      onError: (err) => setToast(errorMessage(err, t`Could not rename.`)),
    })
  }

  async function trash(recording: Recording) {
    await client.recordings.trash(recording.id)
    setRecordings((prev) => prev.filter((r) => r !== recording && r.parentId !== recording.id))
    setSelectedId(null)
    setConfirmTrash(null)
  }

  // The job (HLS → MP4 via MediaConvert, see UNG-58) can take several minutes for
  // a whole broadcast — client.recordings.download polls internally until done.
  // Renders a visible link instead of window.open(): a popup call this long after
  // the original click gesture is often silently blocked by the browser (it is no
  // longer a direct reaction to the user's click).
  async function downloadRecording(recording: Recording) {
    setDownloads((prev) => ({ ...prev, [recording.id]: { status: 'starting' } }))
    try {
      const job = await client.recordings.startDownload(recording.id, { notifyByEmail: readNotifyByEmail() })
      if (job.url) {
        setDownloads((prev) => ({ ...prev, [recording.id]: { status: 'ready', url: job.url } }))
      } else {
        // The server runs the job; progress shows in the jobs bar and a toast says when the file is ready.
        setDownloads((prev) => ({ ...prev, [recording.id]: { status: 'queued' } }))
        notifyJobsChanged()
      }
    } catch (error) {
      setDownloads((prev) => ({
        ...prev,
        [recording.id]: {
          status: 'error',
          message: error instanceof Error ? error.message : t`The download could not be prepared.`,
        },
      }))
    }
  }

  const trashName = confirmTrash?.name ?? ''
  const trashChildren = confirmTrash ? childrenOf(confirmTrash.id).length : 0

  return (
    <div class="view">
      <header>
        <div class="header-list-zone">
          <h1>{t`Video archive`}</h1>
          <span class="spacer" />
          <button class="btn btn-sm" type="button" onClick={() => setCreating(true)}>
            {t`+ New`}
          </button>
        </div>
      </header>

      <div class="content">
        <SplitPane
          listLabel={t`Recordings`}
          detailLabel={t`Selected recording`}
          list={
            <>
              <ul>
                {resource.loading && recordings.length === 0 && <li class="none">{t`Loading…`}</li>}
                {!resource.loading && rows.length === 0 && <li class="none">{t`No recording yet.`}</li>}
                {rows.map(({ recording: r, child }) => (
                  <li key={r.id} class={`${r.id === selectedId ? 'sel' : ''} ${child ? 'child' : ''}`}>
                    <button class="row" type="button" onClick={() => setSelectedId(r.id)}>
                      <span class="rowtop">
                        <span class="nm">{r.name}</span>
                      </span>
                      <span class="meta-row">
                        {r.kind === 'trimmed' && (
                          <>
                            <StatusChip tone="accent">{t`Trimmed`}</StatusChip>
                            {r.published && <StatusChip tone="live">{t`Published`}</StatusChip>}
                          </>
                        )}
                        <span class="meta meta-mono">{formatDateTime(r.createdAt)}</span>
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            </>
          }
          detail={
            !selectedId ? (
              <div class="docnone">{t`Select a recording in the list.`}</div>
            ) : !selected ? (
              <div class="docnone">{t`Loading…`}</div>
            ) : (
              <ArchiveDetail
                recording={selected}
                chapters={chapters}
                onTrash={() =>
                  selected.kind === 'original' && childrenOf(selected.id).length > 0
                    ? setConfirmTrash(selected)
                    : trash(selected)
                }
                onRename={() => setRenaming(selected)}
                onDownload={() => downloadRecording(selected)}
                download={downloads[selected.id]}
                onOpenProject={() => selected.project && onOpenProject(selected.project.id)}
              />
            )
          }
        />
      </div>

      {confirmTrash && (
        <ConfirmModal
          title={t`Move to trash?`}
          confirmLabel={t`Move to trash`}
          danger
          onCancel={() => setConfirmTrash(null)}
          onConfirm={() => trash(confirmTrash)}
        >
          <p>{plural(trashChildren, { one: `${trashName} has # trimmed version. Move the original and its versions to trash?`, other: `${trashName} has # trimmed versions. Move the original and its versions to trash?` })}</p>
        </ConfirmModal>
      )}

      {creating && (
        <RenameModal
          title={t`New video resource`}
          initialValue=""
          onCancel={() => setCreating(false)}
          onSave={createRecording}
        />
      )}

      {renaming && (
        <RenameModal
          title={t`Rename the recording`}
          initialValue={renaming.name}
          onCancel={() => setRenaming(null)}
          onSave={(name) => renameRecording(renaming, name)}
        />
      )}

      {toast && <Toast message={toast} onDismiss={() => setToast(null)} />}
    </div>
  )
}

interface ArchiveDetailProps {
  recording: Recording
  chapters: Chapter[]
  onTrash: () => void
  onRename: () => void
  onDownload: () => void
  download?: { status: 'starting' | 'queued' | 'ready' | 'error'; url?: string; message?: string }
  onOpenProject: () => void
}

function ArchiveDetail({ recording: r, chapters, onTrash, onRename, onDownload, download, onOpenProject }: ArchiveDetailProps) {
  const isOriginal = r.kind === 'original'
  const visibleChapterCount = chapters.filter((c) => isInRange(r, c)).length
  const fileName = `${r.name}.mp4`

  return (
    <>
      <div class="head">
        <h2>
          {r.name}
          <button class="ib" type="button" title={t`Rename the recording`} aria-label={t`Rename the recording`} onClick={onRename}>
            <EditIcon />
          </button>
          {!isOriginal && (
            <>
              <StatusChip tone="accent">{t`Trimmed`}</StatusChip>
              {r.published && <StatusChip tone="live">{t`Published`}</StatusChip>}
            </>
          )}
          {isOriginal && r.segments.length > 1 && (
            <StatusChip tone="warn">{plural(r.segments.length - 1, { one: '# gap', other: '# gaps' })}</StatusChip>
          )}
          <span class="head-actions">
            <OverflowMenu
              items={[{
                label: t`Move to trash`,
                danger: true,
                disabled: !!r.project,
                title: r.project ? t`Recordings linked to a project can only be removed there.` : undefined,
                onClick: onTrash,
              }]}
            />
          </span>
        </h2>
        <div class="facts">
          <span>{formatDateTime(r.createdAt)}</span>
          <span>{r.source}</span>
          {!isOriginal && r.trimRange && (
            <span>{clippedText(r.trimRange.startOffsetSeconds, r.trimRange.endOffsetSeconds)}</span>
          )}
        </div>
        <div class="tools">
          {download?.status === 'starting' ? (
            <button class="btn btn-sm" type="button" disabled>{t`Starting…`}</button>
          ) : download?.status === 'queued' ? (
            <span class="download-ready">
              <span>{t`The download is being prepared. You will be notified when it is ready.`}</span>
              <button class="btn btn-sm" type="button" onClick={openJobsView}>
                {t`Show jobs`}
              </button>
            </span>
          ) : download?.status === 'ready' && download.url ? (
            <span class="download-ready">
              <a class="btn btn-sm" href={download.url} download>
                {t`Download ${fileName}`}
              </a>
              <button class="btn btn-sm" type="button" onClick={onDownload}>
                {t`Prepare again`}
              </button>
            </span>
          ) : (
            <button
              class="btn btn-sm"
              type="button"
              onClick={onDownload}
              title={t`Prepares a downloadable file (can take a few minutes). The file is kept for 7 days.`}
            >
              {t`Download`}
            </button>
          )}
          {download?.status !== 'queued' && download?.status !== 'starting' && download?.status !== 'ready' && <NotifyCheckbox />}
          {download?.status === 'error' && <span class="download-error">{download.message}</span>}
          {r.project && (
            <button class="btn btn-sm" type="button" onClick={onOpenProject}>
              {t`Go to project`}
            </button>
          )}
        </div>
      </div>

      <div class="body">
        <div class="grid">
          <div>
            <div class="k">{t`Duration`}</div>
            <div class="v">{formatHms(r.durationSeconds)}</div>
          </div>
          <div>
            <div class="k">{t`Resolution`}</div>
            <div class="v">{r.resolution}</div>
          </div>
          <div>
            <div class="k">{t`Size`}</div>
            <div class="v">{formatGb(r.sizeBytes)}</div>
          </div>
          <div>
            <div class="k">{t`Chapters`}</div>
            <div class="v">{visibleChapterCount || '–'}</div>
          </div>
        </div>

        <div class="block">
          <h3>{t`HLS link`}</h3>
          <CopyField value={r.hlsUrl} monospace />
        </div>

        {chapters.length > 0 && (
          <div class="block">
            <h3>{isOriginal ? t`Chapters` : t`Chapters (offset counted from trim start)`}</h3>
            <ul class="chapters">
              {chapters.map((c) => {
                const inside = isInRange(r, c)
                return (
                  <li key={c.offsetSeconds + c.label} class={inside ? '' : 'out'}>
                    <span class="t">{formatHms(inside ? displayOffset(r, c) : c.offsetSeconds)}</span>
                    <span class="w">
                      {c.label}
                      <em>{kindLabel(c.kind)}</em>
                    </span>
                    {!inside && <span class="flag">{t`outside the clip`}</span>}
                  </li>
                )
              })}
            </ul>
          </div>
        )}

        {isOriginal && r.segments.length > 1 && (
          <p class="note warn">
            {plural(r.segments.length, { one: 'The recording consists of # segment — the encoder lost the connection during the broadcast. Check the chapter offsets after trimming.', other: 'The recording consists of # segments — the encoder lost the connection during the broadcast. Check the chapter offsets after trimming.' })}
          </p>
        )}
        {isOriginal ? (
          <p class="note">
            {t`The original is never published directly. Trim it to create a version that can be reviewed and published.`}
          </p>
        ) : r.published ? (
          <p class="note">
            {t`This version is published. The chapter list is frozen and no longer follows the project's agenda.`}
          </p>
        ) : (
          <p class="note">{t`Trimmed but not published. Publishing happens in the project's on-demand tab.`}</p>
        )}
      </div>
    </>
  )
}
