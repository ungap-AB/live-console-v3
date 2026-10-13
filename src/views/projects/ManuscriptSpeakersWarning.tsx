import { t } from '@lingui/core/macro'
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

function notReadyText(progress: number | undefined): string {
  return progress !== undefined
    ? t`The speaker changes are not ready yet (${progress} %). If you take out the manuscript now, it will be without speakers. When the job is done, you download the manuscript with speakers under Jobs.`
    : t`The speaker changes are not ready yet. If you take out the manuscript now, it will be without speakers. When the job is done, you download the manuscript with speakers under Jobs.`
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
      setError(reason instanceof Error ? reason.message : t`The speaker changes could not be started.`)
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
    ? t`The speaker changes are being analyzed now. The job is under Jobs, where you download the Word manuscript with speakers when it is done.`
    : gap.state === 'analyzing'
      ? notReadyText(gap.progress)
      : gap.state === 'failed'
        ? t`The speaker changes could not be analyzed last time. The manuscript will be without speakers, but you can try to analyze them again. It takes a while.`
        : t`The speaker changes are not analyzed. The manuscript will be without speakers, but you can analyze them. It takes a while.`

  return (
    <Modal title={analyzing ? t`Speaker changes are being analyzed` : t`Manuscript without speakers`} onClose={onClose}>
      <p>{text}</p>
      {!started && (
        <label class="msw-option">
          <input type="checkbox" checked={notify} disabled={busy} onChange={(event) => setNotify(event.currentTarget.checked)} />
          {t`Email me when the speaker changes are done`}
        </label>
      )}
      {error && <p class="msw-error" role="alert">{error}</p>}
      <div class="modal-actions">
        {analyzing ? (
          <button class="btn btn-sm" type="button" disabled={busy} onClick={() => void leave(onClose)}>{started ? t`Close` : t`Wait`}</button>
        ) : (
          <button class="btn btn-sm" type="button" disabled={busy} onClick={() => void startAnalysis()}>
            {busy ? t`Starting…` : t`Analyze speaker changes`}
          </button>
        )}
        <button class="btn btn-sm btn-primary" type="button" disabled={busy} onClick={() => void leave(onExport)}>{t`Take out without speakers`}</button>
      </div>
    </Modal>
  )
}
