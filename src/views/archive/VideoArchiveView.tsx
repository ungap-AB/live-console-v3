import { useEffect, useState } from 'preact/hooks'
import { client } from '../../data'
import type { Chapter, CueKind, Recording } from '../../data/types'
import { useResource } from '../../app/useResource'
import { SplitPane } from '../../components/SplitPane'
import { StatusChip } from '../../components/StatusChip'
import { CopyField } from '../../components/CopyField'
import { OverflowMenu } from '../../components/OverflowMenu'
import { ConfirmModal } from '../../components/ConfirmModal'
import { RenameModal } from '../../components/RenameModal'
import { Toast } from '../../components/Toast'
import { EditIcon } from '../../components/icons'
import { formatDateTime, formatGb, formatHms } from '../../app/time'
import './VideoArchiveView.css'

function kindLabel(kind: CueKind): string {
  if (kind === 'agendaItem') return 'Ärende'
  if (kind === 'person') return 'Talare'
  return 'Utrop'
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

  useEffect(() => {
    if (resource.data) setRecordings(resource.data)
  }, [resource.data])

  useEffect(() => {
    if (!selectedId && recordings.length > 0) setSelectedId(recordings[0].id)
  }, [recordings, selectedId])

  const originals = recordings.filter((r) => r.kind === 'original')
  const childrenOf = (id: string) => recordings.filter((r) => r.kind === 'trimmed' && r.parentId === id)
  const rows = originals.flatMap((o) => [{ recording: o, child: false }, ...childrenOf(o.id).map((k) => ({ recording: k, child: true }))])

  // Listan är medvetet lätt (inga kapitel) — full detalj, och vid trimmad
  // version även originalets kapitel, hämtas separat när något väljs. Se
  // PLAN-live-server-v3.md Steg 2. Kollar lokal state FÖRST (inte bara vid
  // client-miss) — en nyss skapad videoresurs (se createRecording) finns
  // bara lokalt tills skapandet är kopplat mot en riktig backend.
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

  // Skapandet av en riktig videoresurs (uppladdning, referens till en
  // existerande IVS-inspelning, m.m.) är inte byggt än — den här vyn är en
  // mock. "+ Ny" skapar därför bara en tom lokal platshållare (aldrig
  // sparad hos client/backend) och visar den, sedan stannar flödet där.
  function createRecording(name: string) {
    const draft: Recording = {
      id: `local-${Date.now()}`,
      kind: 'original',
      name,
      createdAt: new Date().toISOString(),
      durationSeconds: 0,
      sizeBytes: 0,
      resolution: '–',
      source: 'Manuellt tillagd',
      hlsUrl: '',
      project: null,
      segments: [],
      chapters: [],
    }
    setRecordings((prev) => [draft, ...prev])
    setSelectedId(draft.id)
    setCreating(false)
  }

  // Draften från createRecording (id "local-…") finns bara i lokal state,
  // aldrig hos client/backend — försök inte spara den dit.
  async function renameRecording(recording: Recording, name: string) {
    const updated = recording.id.startsWith('local-')
      ? { ...recording, name }
      : await client.recordings.rename(recording.id, name)
    setRecordings((prev) => prev.map((r) => (r.id === updated.id ? updated : r)))
    setDetail((prev) => (prev && prev.recording.id === updated.id ? { ...prev, recording: updated } : prev))
    setRenaming(null)
  }

  async function trash(recording: Recording) {
    await client.recordings.trash(recording.id)
    setRecordings((prev) => prev.filter((r) => r !== recording && r.parentId !== recording.id))
    setSelectedId(null)
    setConfirmTrash(null)
  }

  return (
    <div class="view">
      <header>
        <div class="header-list-zone">
          <h1>Videoarkiv</h1>
          <span class="spacer" />
          <button class="btn btn-sm" type="button" onClick={() => setCreating(true)}>
            + Ny
          </button>
        </div>
      </header>

      <div class="content">
        <SplitPane
          listLabel="Inspelningar"
          detailLabel="Vald inspelning"
          list={
            <>
              <ul>
                {resource.loading && recordings.length === 0 && <li class="none">Laddar…</li>}
                {!resource.loading && rows.length === 0 && <li class="none">Ingen inspelning ännu.</li>}
                {rows.map(({ recording: r, child }) => (
                  <li key={r.id} class={`${r.id === selectedId ? 'sel' : ''} ${child ? 'child' : ''}`}>
                    <button class="row" type="button" onClick={() => setSelectedId(r.id)}>
                      <span class="rowtop">
                        <span class="nm">{r.name}</span>
                      </span>
                      <span class="meta-row">
                        {r.kind === 'trimmed' && (
                          <>
                            <StatusChip tone="accent">Trimmad</StatusChip>
                            {r.published && <StatusChip tone="live">Publicerad</StatusChip>}
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
              <div class="docnone">Välj en inspelning i listan.</div>
            ) : !selected ? (
              <div class="docnone">Laddar…</div>
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
                onDownload={() => setToast(`Laddar ner ${selected.name}`)}
                onOpenProject={() => selected.project && onOpenProject(selected.project.id)}
              />
            )
          }
        />
      </div>

      {confirmTrash && (
        <ConfirmModal
          title="Flytta till papperskorgen?"
          confirmLabel="Flytta till papperskorgen"
          danger
          onCancel={() => setConfirmTrash(null)}
          onConfirm={() => trash(confirmTrash)}
        >
          <p>
            {confirmTrash.name} har {childrenOf(confirmTrash.id).length} trimmad version. Flytta
            originalet och dess versioner till papperskorgen?
          </p>
        </ConfirmModal>
      )}

      {creating && (
        <RenameModal
          title="Ny videoresurs"
          initialValue=""
          onCancel={() => setCreating(false)}
          onSave={createRecording}
        />
      )}

      {renaming && (
        <RenameModal
          title="Byt namn på inspelningen"
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
  onOpenProject: () => void
}

function ArchiveDetail({ recording: r, chapters, onTrash, onRename, onDownload, onOpenProject }: ArchiveDetailProps) {
  const isOriginal = r.kind === 'original'
  const visibleChapterCount = chapters.filter((c) => isInRange(r, c)).length

  return (
    <>
      <div class="head">
        <h2>
          {r.name}
          <button class="ib" type="button" title="Byt namn på inspelningen" aria-label="Byt namn på inspelningen" onClick={onRename}>
            <EditIcon />
          </button>
          {!isOriginal && (
            <>
              <StatusChip tone="accent">Trimmad</StatusChip>
              {r.published && <StatusChip tone="live">Publicerad</StatusChip>}
            </>
          )}
          {isOriginal && r.segments.length > 1 && (
            <StatusChip tone="warn">{r.segments.length - 1} glapp</StatusChip>
          )}
          <span class="head-actions">
            <OverflowMenu
              items={[{
                label: 'Flytta till papperskorgen',
                danger: true,
                disabled: !!r.project,
                title: r.project ? 'Inspelningar kopplade till ett projekt kan bara tas bort där.' : undefined,
                onClick: onTrash,
              }]}
            />
          </span>
        </h2>
        <div class="facts">
          <span>{formatDateTime(r.createdAt)}</span>
          <span>{r.source}</span>
          {!isOriginal && r.trimRange && (
            <span>
              Klippt {formatHms(r.trimRange.startOffsetSeconds)}–{formatHms(r.trimRange.endOffsetSeconds)} ur
              originalet
            </span>
          )}
        </div>
        <div class="tools">
          <button class="btn btn-sm" type="button" onClick={onDownload}>
            Ladda ner
          </button>
          {r.project && (
            <button class="btn btn-sm" type="button" onClick={onOpenProject}>
              Gå till projekt
            </button>
          )}
        </div>
      </div>

      <div class="body">
        <div class="grid">
          <div>
            <div class="k">Längd</div>
            <div class="v">{formatHms(r.durationSeconds)}</div>
          </div>
          <div>
            <div class="k">Upplösning</div>
            <div class="v">{r.resolution}</div>
          </div>
          <div>
            <div class="k">Storlek</div>
            <div class="v">{formatGb(r.sizeBytes)}</div>
          </div>
          <div>
            <div class="k">Kapitel</div>
            <div class="v">{visibleChapterCount || '–'}</div>
          </div>
        </div>

        <div class="block">
          <h3>HLS-länk</h3>
          <CopyField value={r.hlsUrl} monospace />
        </div>

        {chapters.length > 0 && (
          <div class="block">
            <h3>Kapitel{!isOriginal ? ' (offset räknat från trimstart)' : ''}</h3>
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
                    {!inside && <span class="flag">utanför klippet</span>}
                  </li>
                )
              })}
            </ul>
          </div>
        )}

        {isOriginal && r.segments.length > 1 && (
          <p class="note warn">
            Inspelningen består av {r.segments.length} segment — enkodern tappade anslutningen under
            sändningen. Kontrollera kapitlens offset efter trimning.
          </p>
        )}
        {isOriginal ? (
          <p class="note">
            Originalet publiceras aldrig direkt. Trimma det för att skapa en version som kan granskas
            och publiceras.
          </p>
        ) : r.published ? (
          <p class="note">
            Den här versionen är publicerad. Kapitellistan är fryst och följer inte längre projektets
            dagordning.
          </p>
        ) : (
          <p class="note">Trimmad men inte publicerad. Publicering sker i projektets ondemand-flik.</p>
        )}
      </div>
    </>
  )
}
