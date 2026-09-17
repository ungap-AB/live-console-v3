import { useEffect, useState } from 'preact/hooks'
import { client } from '../../data'
import type { Chapter, CueKind, Recording } from '../../data/types'
import { useResource } from '../../app/useResource'
import { SplitPane } from '../../components/SplitPane'
import { StatusChip } from '../../components/StatusChip'
import { CopyField } from '../../components/CopyField'
import { OverflowMenu } from '../../components/OverflowMenu'
import { ConfirmModal } from '../../components/ConfirmModal'
import { Toast } from '../../components/Toast'
import { SearchIcon } from '../../components/icons'
import { TrimDialog } from './TrimDialog'
import { formatDateTime, formatGb, formatHms } from '../../app/time'
import './VideoArchiveView.css'

function kindLabel(kind: CueKind): string {
  return kind === 'agendaItem' ? 'Ärende' : 'Talare'
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
  const [query, setQuery] = useState('')
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [trimming, setTrimming] = useState<Recording | null>(null)
  const [confirmTrash, setConfirmTrash] = useState<Recording | null>(null)
  const [toast, setToast] = useState<string | null>(null)

  useEffect(() => {
    if (resource.data) setRecordings(resource.data)
  }, [resource.data])

  useEffect(() => {
    if (!selectedId && recordings.length > 0) setSelectedId(recordings[0].id)
  }, [recordings, selectedId])

  const q = query.trim().toLowerCase()
  const originals = recordings.filter((r) => r.kind === 'original')
  const childrenOf = (id: string) => recordings.filter((r) => r.kind === 'trimmed' && r.parentId === id)
  const rows = originals.flatMap((o) => {
    const kids = childrenOf(o.id)
    const hit = !q || o.name.toLowerCase().includes(q) || kids.some((k) => k.name.toLowerCase().includes(q))
    return hit ? [{ recording: o, child: false }, ...kids.map((k) => ({ recording: k, child: true }))] : []
  })

  // Listan är medvetet lätt (inga kapitel) — full detalj, och vid trimmad
  // version även originalets kapitel, hämtas separat när något väljs. Se
  // PLAN-live-server-v3.md Steg 2.
  const detailResource = useResource(async () => {
    if (!selectedId) return null
    const recording = await client.recordings.get(selectedId)
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

  async function trash(recording: Recording) {
    await client.recordings.trash(recording.id)
    setRecordings((prev) => prev.filter((r) => r !== recording && r.parentId !== recording.id))
    setSelectedId(null)
    setConfirmTrash(null)
  }

  async function saveTrim(range: { startOffsetSeconds: number; endOffsetSeconds: number }) {
    if (!trimming) return
    const trimmed = await client.recordings.trim(trimming.id, range)
    setRecordings((prev) => {
      const exists = prev.some((r) => r.id === trimmed.id)
      if (exists) return prev.map((r) => (r.id === trimmed.id ? trimmed : r))
      const idx = prev.findIndex((r) => r.id === trimming.id)
      return [...prev.slice(0, idx + 1), trimmed, ...prev.slice(idx + 1)]
    })
    setSelectedId(trimmed.id)
    setTrimming(null)
  }

  return (
    <div class="view">
      <header>
        <div>
          <h1>Videoarkiv</h1>
          <div class="sub">Originalinspelningar och trimmade versioner</div>
        </div>
      </header>

      <div class="content">
        <SplitPane
          listLabel="Inspelningar"
          detailLabel="Vald inspelning"
          list={
            <>
              <div class="top">
                <div class="search">
                  <SearchIcon />
                  <input
                    type="search"
                    placeholder="Sök inspelning"
                    aria-label="Sök inspelning"
                    value={query}
                    onInput={(e) => setQuery(e.currentTarget.value)}
                  />
                </div>
                <button
                  class="btn btn-sm"
                  type="button"
                  onClick={() => setToast('Uppladdning är inte kopplad i mockupen ännu.')}
                >
                  Ladda upp
                </button>
              </div>
              <ul>
                {resource.loading && recordings.length === 0 && <li class="none">Laddar…</li>}
                {!resource.loading && rows.length === 0 && (
                  <li class="none">Ingen inspelning matchar sökningen.</li>
                )}
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
                onTrim={() => setTrimming(selected)}
                onTrash={() =>
                  selected.kind === 'original' && childrenOf(selected.id).length > 0
                    ? setConfirmTrash(selected)
                    : trash(selected)
                }
                onDownload={() => setToast(`Laddar ner ${selected.name}`)}
                onOpenProject={() => selected.project && onOpenProject(selected.project.id)}
              />
            )
          }
        />
      </div>

      {trimming && (
        <TrimDialog
          recording={detail?.recording.id === trimming.id ? detail.original ?? trimming : trimming}
          initialRange={trimming.trimRange ?? childrenOf(trimming.id)[0]?.trimRange}
          onCancel={() => setTrimming(null)}
          onSave={saveTrim}
        />
      )}

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

      {toast && <Toast message={toast} onDismiss={() => setToast(null)} />}
    </div>
  )
}

interface ArchiveDetailProps {
  recording: Recording
  chapters: Chapter[]
  onTrim: () => void
  onTrash: () => void
  onDownload: () => void
  onOpenProject: () => void
}

function ArchiveDetail({ recording: r, chapters, onTrim, onTrash, onDownload, onOpenProject }: ArchiveDetailProps) {
  const isOriginal = r.kind === 'original'
  const visibleChapterCount = chapters.filter((c) => isInRange(r, c)).length

  return (
    <>
      <div class="head">
        <h2>
          {r.name}
          {!isOriginal && (
            <>
              <StatusChip tone="accent">Trimmad</StatusChip>
              {r.published && <StatusChip tone="live">Publicerad</StatusChip>}
            </>
          )}
          {isOriginal && r.segments.length > 1 && (
            <StatusChip tone="warn">{r.segments.length - 1} glapp</StatusChip>
          )}
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
          {isOriginal && (
            <button class="btn btn-sm btn-primary" type="button" onClick={onTrim}>
              Trimma inspelning
            </button>
          )}
          <span class="spacer" />
          <OverflowMenu items={[{ label: 'Flytta till papperskorgen', danger: true, onClick: onTrash }]} />
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
