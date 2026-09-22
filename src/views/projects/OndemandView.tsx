import { useEffect, useState } from 'preact/hooks'
import { client } from '../../data'
import type { Chapter, CueKind, Project, Recording, RecordingState } from '../../data/types'
import { formatHms } from '../../app/time'
import { VideoLightbox } from '../../components/VideoLightbox'
import type { ProjectActions } from './actions'
import { ProjectHeader } from './ProjectHeader'
import { resolveOriginalRecordingForTrim } from './openTrimDialog'
import { TrimDialog } from '../archive/TrimDialog'
import { useModeChange } from './useModeChange'
import './OndemandView.css'

interface OndemandViewProps {
  project: Project
  actions: ProjectActions
  onBack: () => void
}

const RECORDING_LABEL: Record<RecordingState, string> = {
  none: 'Ingen inspelning',
  recording: 'Spelas in',
  processing: 'Bearbetas',
  recorded: 'Inspelad, inte trimmad',
  trimmed: 'Trimmad',
  published: 'Publicerad',
}

const CHAPTER_KIND: Record<CueKind, string> = {
  agendaItem: 'Ärende',
  person: 'Talare',
  exclamation: 'Utrop',
}

// En trimmad version läser kapitel från originalet, filtrerade på trimintervallet
// och räknade från trimmens start.
function chaptersFor(recording: Recording, original: Recording | null): Chapter[] {
  const source = recording.kind === 'trimmed' ? original : recording
  if (!source) return []
  const range = recording.kind === 'trimmed' ? recording.trimRange : undefined
  return source.chapters
    .filter((c) => !range || (c.offsetSeconds >= range.startOffsetSeconds && c.offsetSeconds <= range.endOffsetSeconds))
    .map((c) => ({ ...c, offsetSeconds: c.offsetSeconds - (range?.startOffsetSeconds ?? 0) }))
    .sort((a, b) => a.offsetSeconds - b.offsetSeconds)
}

// Ondemand: After är arbetsyta (meddelande, publicera, redigera inspelningen),
// Ondemand är förvaltningsyta (inspelningen är publicerad).
export function OndemandView({ project: p, actions, onBack }: OndemandViewProps) {
  const { selectMode, dialog } = useModeChange(p, actions)
  const [draft, setDraft] = useState(p.afterText)
  const [saving, setSaving] = useState(false)
  const [recording, setRecording] = useState<Recording | null>(null)
  const [original, setOriginal] = useState<Recording | null>(null)
  const [showVideo, setShowVideo] = useState(false)
  const [trimming, setTrimming] = useState<Recording | null>(null)
  const [mockTrimStart, setMockTrimStart] = useState(0)
  const [mockTrimEnd, setMockTrimEnd] = useState(0)

  useEffect(() => setDraft(p.afterText), [p.afterText])

  useEffect(() => {
    if (!recording) return
    setMockTrimStart(recording.trimRange?.startOffsetSeconds ?? 0)
    setMockTrimEnd(recording.trimRange?.endOffsetSeconds ?? recording.durationSeconds)
  }, [recording?.id, recording?.durationSeconds, recording?.trimRange?.startOffsetSeconds, recording?.trimRange?.endOffsetSeconds])

  const recordingId = p.recording?.id
  const recordingState = p.recording?.state
  useEffect(() => {
    let cancelled = false
    if (!recordingId || recordingState === 'recording' || recordingState === 'processing') {
      setRecording(null)
      setOriginal(null)
      return
    }
    client.recordings.get(recordingId).then(async (rec) => {
      if (!rec || cancelled) return
      const parent = rec.kind === 'trimmed' && rec.parentId ? ((await client.recordings.get(rec.parentId)) ?? null) : null
      if (cancelled) return
      setRecording(rec)
      setOriginal(parent)
    })
    return () => {
      cancelled = true
    }
  }, [recordingId, recordingState])

  // Before/Live hör till Livesändning; vyn byts av ProjectsView när läget ändrats.
  if (p.publicMode !== 'after' && p.publicMode !== 'ondemand') return null

  const isAfter = p.publicMode === 'after'
  const rec = p.recording?.state ?? 'none'
  const dirty = draft !== p.afterText
  const canTrim = isAfter && p.capabilities.trimRecording.status === 'allowed'
  const canPublish = isAfter && rec === 'trimmed' && p.capabilities.publishVod.status !== 'blocked'
  const publishHint = canPublish
    ? undefined
    : rec === 'trimmed'
      ? 'Det går inte att publicera just nu'
      : 'Trimma inspelningen innan du publicerar'
  const chapters = recording ? chaptersFor(recording, original) : []
  const source = original ?? recording
  const previewUrl = p.recording?.hlsUrl ?? recording?.hlsUrl ?? ''
  const mockTrimDuration = source?.durationSeconds ?? 0

  async function saveAfterText() {
    setSaving(true)
    try {
      await actions.rename(p.name, { afterText: draft })
    } finally {
      setSaving(false)
    }
  }

  async function openTrim() {
    if (!p.recording) return
    const originalRecording = await resolveOriginalRecordingForTrim(p.recording.id)
    if (originalRecording) setTrimming(originalRecording)
  }

  async function saveTrim(range: { startOffsetSeconds: number; endOffsetSeconds: number; sessionId?: string }): Promise<void> {
    if (await actions.trim(range)) {
      await actions.refreshProject()
      setTrimming(null)
    }
  }

  async function saveMockTrim() {
    if (!mockTrimDuration || mockTrimEnd <= mockTrimStart) return
    await saveTrim({ startOffsetSeconds: mockTrimStart, endOffsetSeconds: mockTrimEnd })
  }

  return (
    <div class="project-workspace doc">
      <ProjectHeader project={p} actions={actions} onBack={onBack} />
      <div class="od">
        {isAfter ? (
          <div class="od-top">
            <div class="od-message">
              <label for="od-after-text">After-meddelande – visas för publiken tills du publicerar ondemand</label>
              <div class="od-message-row">
                <textarea
                  id="od-after-text"
                  rows={2}
                  value={draft}
                  onInput={(e) => setDraft((e.target as HTMLTextAreaElement).value)}
                />
                <button class="btn" type="button" disabled={!dirty || saving} onClick={() => void saveAfterText()}>
                  Spara
                </button>
              </div>
            </div>
            <button class="btn btn-primary" type="button" disabled={!canPublish} title={publishHint} onClick={() => selectMode('ondemand')}>
              Publicera ondemand
            </button>
          </div>
        ) : (
          <div class="od-published" role="status">
            <span class="od-published-badge">PUBLICERAD</span>
            <span class="od-published-text">Ändringar du sparar syns direkt för publiken. Gör större ändringar i läget After.</span>
            <button class="btn" type="button" onClick={() => selectMode('after')}>
              Gå till After
            </button>
          </div>
        )}

        <div class="od-cols">
          <section class="od-col" aria-labelledby="od-recording-title">
            <h2 id="od-recording-title">Inspelning</h2>
            <dl class="od-facts">
              <dt>Status</dt>
              <dd>{RECORDING_LABEL[rec]}</dd>
              {source && (
                <>
                  <dt>Längd</dt>
                  <dd>{formatHms(source.durationSeconds)}</dd>
                </>
              )}
              {recording?.kind === 'trimmed' && recording.trimRange && (
                <>
                  <dt>Trimmad</dt>
                  <dd>
                    {formatHms(recording.trimRange.startOffsetSeconds)} – {formatHms(recording.trimRange.endOffsetSeconds)}
                  </dd>
                </>
              )}
            </dl>
            <div class="od-actions">
              <button class="btn" type="button" disabled={!previewUrl} onClick={() => setShowVideo(true)}>
                Förhandsgranska
              </button>
              <button
                class="btn"
                type="button"
                disabled={!canTrim}
                title={isAfter ? undefined : 'Gå till After för att trimma inspelningen'}
                onClick={() => void openTrim()}
              >
                Trimma inspelning
              </button>
            </div>
            {canTrim && source && (
              <div class="od-mock-trim" aria-label="Mockad trimning">
                <div class="od-mock-trim-head">
                  <span>Trimning</span>
                  <span>{formatHms(mockTrimStart)} – {formatHms(mockTrimEnd)}</span>
                </div>
                <div class="od-mock-trim-track">
                  <input
                    aria-label="Trimningens start"
                    type="range"
                    min="0"
                    max={Math.max(1, mockTrimDuration - 1)}
                    value={mockTrimStart}
                    onInput={(e) => setMockTrimStart(Math.min(Number(e.currentTarget.value), mockTrimEnd - 1))}
                  />
                  <input
                    aria-label="Trimningens slut"
                    type="range"
                    min="1"
                    max={mockTrimDuration}
                    value={mockTrimEnd}
                    onInput={(e) => setMockTrimEnd(Math.max(Number(e.currentTarget.value), mockTrimStart + 1))}
                  />
                </div>
                <div class="od-mock-trim-actions">
                  <button class="btn" type="button" onClick={() => setMockTrimStart(Math.min(Math.round(mockTrimDuration * 0.1), mockTrimEnd - 1))}>
                    Sätt start här
                  </button>
                  <button class="btn" type="button" onClick={() => setMockTrimEnd(Math.max(Math.round(mockTrimDuration * 0.9), mockTrimStart + 1))}>
                    Sätt slut här
                  </button>
                  <button class="btn btn-primary" type="button" disabled={mockTrimEnd <= mockTrimStart} onClick={() => void saveMockTrim()}>
                    Spara trimning
                  </button>
                </div>
              </div>
            )}
            <p class="od-todo">
              Tidslinjen är mockad i utvecklingsläget. Den använder samma inspelningsdata som den riktiga trimdialogen.
            </p>
          </section>

          <section class="od-col" aria-labelledby="od-chapters-title">
            <div class="od-col-head">
              <h2 id="od-chapters-title">Kapitel och talare</h2>
              <span class="od-sub">från livesändningen</span>
            </div>
            {chapters.length === 0 ? (
              <p class="od-empty">Inga kapitel än. De skapas från det som spelades ut under sändningen.</p>
            ) : (
              <ul class="od-chapters">
                {chapters.map((c, i) => (
                  <li key={`${c.offsetSeconds}-${i}`}>
                    <span class="od-time">{formatHms(c.offsetSeconds)}</span>
                    <span class="od-chapter-label">{c.label}</span>
                    <span class="od-chapter-kind">{CHAPTER_KIND[c.kind]}</span>
                  </li>
                ))}
              </ul>
            )}
            <p class="od-todo">Ej implementerat: redigering av kapitel och talare.</p>
          </section>
        </div>
      </div>

      {dialog}
      {showVideo && <VideoLightbox title={p.name} src={previewUrl} onClose={() => setShowVideo(false)} />}
      {trimming && <TrimDialog recording={trimming} onCancel={() => setTrimming(null)} onSave={saveTrim} />}
    </div>
  )
}
