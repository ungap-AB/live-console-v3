import { useMemo, useState } from 'preact/hooks'
import { client } from '../../data'
import type { CaptionGeneration } from '../../data/types'
import { ConfirmModal } from '../../components/ConfirmModal'
import { Icon } from '../../components/Icon'
import { JobProgress } from '../../components/JobProgress'
import type { AutoCaptionsPhase } from './autoCaptionsLogic'
import { estimatedWaitText } from './autoCaptionsLogic'
import { studioView } from './captionEntryLogic'
import { CaptionEditor } from './CaptionEditor'
import './CaptionStudio.css'

interface CaptionStudioProps {
  projectId: string
  projectName: string
  videoDurationSeconds?: number
  posterUrl?: string | null
  generation: CaptionGeneration | null
  phase: AutoCaptionsPhase
  setGeneration: (next: CaptionGeneration) => void
  refresh: () => Promise<void>
  onChanged: () => void
  onClose: () => void
}

// UNG-165: undertextstudion. Finns ett utkast öppnas redigeraren. Annars är skapandet en overlay över en dummy av redigeraren, så att man
// anar nästa steg: overlayen finns kvar så länge bearbetningen pågår och spärrar åtkomsten, och byts mot redigeraren när utkastet är klart.
export function CaptionStudio({ projectId, projectName, videoDurationSeconds, posterUrl, generation, phase, setGeneration, refresh, onChanged, onClose }: CaptionStudioProps) {
  const view = studioView(phase)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [notify, setNotify] = useState(false)
  const [confirmCancel, setConfirmCancel] = useState(false)

  if (view === 'editor') {
    return <CaptionEditor projectId={projectId} projectName={projectName} onClose={onClose} onSaved={() => { onChanged(); void refresh() }} />
  }

  async function start() {
    setBusy(true)
    setError('')
    try {
      setGeneration(await client.projects.generateCaptions(projectId, notify))
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Det gick inte att starta undertextningen.')
    } finally {
      setBusy(false)
    }
  }

  async function cancel() {
    setConfirmCancel(false)
    setBusy(true)
    setError('')
    try {
      if (generation?.job) await client.jobs.cancel(generation.job.id)
      await refresh()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Jobbet kunde inte avbrytas.')
    } finally {
      setBusy(false)
    }
  }

  const job = generation?.job
  const failed = phase === 'failed' && job
  const canGenerate = generation?.canGenerate ?? false

  return (
    <div class="cs-scrim" role="dialog" aria-modal="true" aria-label="Skapa undertexter">
      <header class="cs-head">
        <div>
          <h2>Undertexter</h2>
          <div class="cs-sub">{projectName}</div>
        </div>
        <button class="ib" type="button" aria-label="Stäng" title="Stäng" onClick={onClose}>✕</button>
      </header>

      <CaptionDummy posterUrl={posterUrl} />

      <div class="cs-overlay">
        <div class="cs-card">
          {view === 'progress' && job ? (
            <>
              <h3>Undertexterna skapas</h3>
              <JobProgress progress={job.progress} phase={job.phase} />
              <p class="cs-text">Ljudet tas fram, skrivs ut och delas upp i repliker. Sedan kan du redigera dem här. Du kan stänga fönstret: jobbet fortsätter, och du följer det på knappen ovanför videon.</p>
              <div class="cs-actions">
                <button class="btn btn-sm" type="button" disabled={busy} onClick={() => setConfirmCancel(true)}>Avbryt</button>
                <button class="btn btn-sm" type="button" onClick={onClose}>Stäng, fortsätt i bakgrunden</button>
              </div>
            </>
          ) : (
            <>
              <h3>Skapa undertexter automatiskt</h3>
              {failed && <p class="cs-error" role="alert">Undertexterna kunde inte skapas: {job?.errorMessage ?? 'okänt fel.'}</p>}
              <p class="cs-text">
                Tar {estimatedWaitText(videoDurationSeconds)}. Du får ett utkast att redigera, med video, vågform och en ruta för varje replik.
                Utkastet syns inte för tittarna förrän du godkänner det.
              </p>
              <label class="cs-notify">
                <input type="checkbox" checked={notify} onChange={(event) => setNotify(event.currentTarget.checked)} />
                Mejla mig när det är klart
              </label>
              {!canGenerate && <p class="cs-error">Undertexter går inte att skapa automatiskt för den här videon.</p>}
              <div class="cs-actions">
                <button class="btn btn-sm btn-primary" type="button" disabled={busy || !canGenerate} onClick={() => void start()}>
                  {busy ? 'Startar…' : failed ? 'Försök igen' : 'Skapa undertexter'}
                </button>
                <button class="btn btn-sm" type="button" onClick={onClose}>Stäng</button>
              </div>
            </>
          )}
          {error && <p class="cs-error" role="alert">{error}</p>}
        </div>
      </div>

      {confirmCancel && (
        <ConfirmModal title="Avbryta?" confirmLabel="Avbryt jobbet" danger onCancel={() => setConfirmCancel(false)} onConfirm={() => void cancel()}>
          <p>Skapandet stoppas och inget utkast sparas. Du kan starta det igen när som helst.</p>
        </ConfirmModal>
      )}
    </div>
  )
}

const SAMPLE_TEXTS = [
  'Jag yrkar bifall till förslaget\nfrån kommunstyrelsen.',
  'Då går vi till votering.',
  'Finns det några fler som önskar ordet?',
  'Ordförande, jag har en fråga\nom budgeten för nästa år.',
  'Tack för det. Då ställer jag\nproposition på förslaget.',
  'Mötet är avslutat. Tack för i dag.',
]
const ROW = 84
const ACTIVE = 2

// Ett deterministiskt pseudoslumptal, så att dummyns vågform är densamma varje gång.
function seeded(seed: number): () => number {
  let state = seed
  return () => {
    state = (state * 1664525 + 1013904223) % 4294967296
    return state / 4294967296
  }
}

// En påhittad förhandsvisning av redigeraren (video, vågform, kopplingslinjer och textrutor) bakom overlayen.
function CaptionDummy({ posterUrl }: { posterUrl?: string | null }) {
  const height = SAMPLE_TEXTS.length * ROW
  const wave = useMemo(() => {
    const random = seeded(7)
    let path = ''
    for (let y = 2; y < height; y += 3) {
      const envelope = Math.max(0, Math.sin(y / 41) + 0.7 * Math.sin(y / 13 + 1) + 0.15)
      const amplitude = Math.min(36, envelope * 20 * (0.55 + random() * 0.6))
      if (amplitude > 1) path += `M${42 - amplitude} ${y}H${42 + amplitude}`
    }
    return path
  }, [height])
  const fan = useMemo(() => SAMPLE_TEXTS.map((_, index) => ({ band: index * ROW * 0.86 + 30, row: index * ROW })), [])

  return (
    <div class="cs-dummy" aria-hidden="true">
      <div class="cs-d-left">
        <div class="cs-d-video" style={posterUrl ? { backgroundImage: `url("${posterUrl}")` } : undefined}>
          <span class="cs-d-subtitle">Jag yrkar bifall till förslaget{'\n'}från kommunstyrelsen.</span>
        </div>
        <div class="cs-d-tools">
          <span class="cs-d-line" style={{ width: '38%' }} />
          <span class="cs-d-line" style={{ width: '62%' }} />
          <span class="cs-d-line" style={{ width: '48%' }} />
        </div>
      </div>
      <div class="cs-d-right">
        <svg class="cs-d-wave" width="140" height={height} viewBox={`0 0 140 ${height}`}>
          <rect x="0" y="0" width="84" height={height} class="cs-d-band" />
          <rect x="0" y={fan[ACTIVE].band} width="84" height={ROW * 0.86} class="cs-d-sel" />
          <path d={wave} class="cs-d-waveform" stroke-width="2" />
          {fan.map((line, index) => (
            <g key={index}>
              <line x1="0" x2="84" y1={line.band} y2={line.band} class={index === ACTIVE || index === ACTIVE + 1 ? 'cs-d-cut is-hot' : 'cs-d-cut'} />
              <line x1="84" x2="140" y1={line.band} y2={line.row} class={index === ACTIVE || index === ACTIVE + 1 ? 'cs-d-link is-hot' : 'cs-d-link'} />
            </g>
          ))}
          <line x1="0" x2="84" y1={fan[ACTIVE].band + 20} y2={fan[ACTIVE].band + 20} class="cs-d-playhead" />
        </svg>
        <div class="cs-d-rows">
          {SAMPLE_TEXTS.map((text, index) => (
            <div key={index} class={`cs-d-row${index === ACTIVE ? ' is-active' : ''}`} style={{ height: `${ROW}px` }}>
              <span class="cs-d-play">{index === ACTIVE && <Icon name="play_arrow" size={18} />}</span>
              <span class="cs-d-text">{text}</span>
              <span class="cs-d-num">{index + 1}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
