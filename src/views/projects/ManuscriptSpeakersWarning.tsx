import { useState } from 'preact/hooks'
import { notifyJobsChanged } from '../../app/jobsBus'
import { Modal } from '../../components/Modal'
import { client } from '../../data'
import './ManuscriptSpeakersWarning.css'

// UNG-296: talarbytena (för Word-manuset) analyseras i ett eget jobb, efter undertexterna eller när operatören ber om det här. Manuset
// går alltid att ta ut direkt, utan talare; analysen och mejlet är tillval som aldrig blockerar.

export type SpeakersGap = { state: 'analyzing' | 'none' | 'failed'; progress?: number }

/** Talarbytena saknas eller analyseras. Null = klara, inte tillgängliga i miljön, eller läget gick inte att läsa: manuset tas ut direkt. */
export async function speakersGap(projectId: string): Promise<SpeakersGap | null> {
  try {
    const generation = await client.projects.getCaptionGeneration(projectId)
    const speakers = generation.speakers
    if (!generation.speakersAvailable || !speakers || speakers.state === 'ready') return null
    return { state: speakers.state, progress: speakers.progress }
  } catch {
    return null
  }
}

interface ManuscriptSpeakersWarningProps {
  projectId: string
  gap: SpeakersGap
  onClose: () => void
  /** Ta ut manuset nu, utan talare. */
  onExport: () => void
}

export function ManuscriptSpeakersWarning({ projectId, gap, onClose, onExport }: ManuscriptSpeakersWarningProps) {
  const [notify, setNotify] = useState(false)
  const [started, setStarted] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const analyzing = gap.state === 'analyzing' || started

  // Startar analysen, eller (när den redan pågår) lägger bara mejlet på jobbet.
  async function analyze(notifyByEmail: boolean): Promise<boolean> {
    setBusy(true)
    setError('')
    try {
      await client.projects.analyzeSpeakers(projectId, notifyByEmail)
      notifyJobsChanged()
      return true
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Talarbytena kunde inte startas.')
      return false
    } finally {
      setBusy(false)
    }
  }

  async function startAnalysis() {
    if (await analyze(notify)) setStarted(true)
  }

  // I läget "analyseras" gäller kryssrutan det pågående jobbet, oavsett om man väntar eller tar ut manuset nu.
  async function leave(then: () => void) {
    if (gap.state === 'analyzing' && notify && !(await analyze(true))) return
    then()
  }

  const text = started
    ? 'Talarbytena analyseras nu. Jobbet finns under Jobb, där du laddar ner Word-manuset med talare när det är klart.'
    : gap.state === 'analyzing'
      ? `Talarbytena är inte klara än${gap.progress !== undefined ? ` (${gap.progress} %)` : ''}. Tar du ut manuset nu blir det utan talare. När jobbet är klart laddar du ner manuset med talare under Jobb.`
      : gap.state === 'failed'
        ? 'Talarbytena kunde inte analyseras förra gången. Manuset blir utan talare, men du kan försöka analysera dem igen. Det tar en stund.'
        : 'Talarbytena är inte analyserade. Manuset blir utan talare, men du kan analysera dem. Det tar en stund.'

  return (
    <Modal title={analyzing ? 'Talarbyten analyseras' : 'Manus utan talare'} onClose={onClose}>
      <p>{text}</p>
      {!started && (
        <label class="msw-option">
          <input type="checkbox" checked={notify} disabled={busy} onChange={(event) => setNotify(event.currentTarget.checked)} />
          Mejla mig när talarbytena är klara
        </label>
      )}
      {error && <p class="msw-error" role="alert">{error}</p>}
      <div class="modal-actions">
        {analyzing ? (
          <button class="btn btn-sm" type="button" disabled={busy} onClick={() => void leave(onClose)}>{started ? 'Stäng' : 'Vänta'}</button>
        ) : (
          <button class="btn btn-sm" type="button" disabled={busy} onClick={() => void startAnalysis()}>
            {busy ? 'Startar…' : 'Analysera talarbyten'}
          </button>
        )}
        <button class="btn btn-sm btn-primary" type="button" disabled={busy} onClick={() => void leave(onExport)}>Ta ut utan talare</button>
      </div>
    </Modal>
  )
}
