import { t } from '@lingui/core/macro'
import { useEffect, useMemo, useState } from 'preact/hooks'
import { client } from '../../data'
import type { CueKind, PreviewLink, PreviewPlayout, Project } from '../../data/types'
import { errorMessage } from '../../app/optimistic'
import type { ProjectActions } from './actions'
import { PlayoutColumns } from './PlayoutColumns'
import { PlayoutOverlay } from './PlayoutOverlay'
import { previewPlayerUrl } from './PlayerPreview'
import './PreviewOverlay.css'

type ShowAs = 'before' | 'live'
/** Before: testutspelning och visa som Före/Under. Live: det tittarna ser nu. Draft (After/Ondemand): det sparade utkastet. */
export type PreviewKind = 'before' | 'live' | 'draft'

const EMPTY_PLAYOUT: PreviewPlayout = { currentAgendaItemId: null, currentPersonId: null }
// Länken gäller i 4 timmar (UNG-253); förnyas i god tid så att en vy som står öppen länge inte tappar spelaren.
const RENEW_LINK_MS = 3 * 60 * 60 * 1000

interface PreviewOverlayProps {
  project: Project
  actions: ProjectActions
  kind: PreviewKind
  onClose: () => void
}

// UNG-255: Förhandsvisa i Before och Live. Den riktiga spelaren i förhandsvisningsläge (märkt, inte publik) med dagordning, namnlista
// och spelarinställningar. I Before kan operatören visa den som Live och spela ut punkter och namn som bara syns här (testutspelning i
// servern, inte i projektets tidslinje eller det tittarna ser), ändra inställningar och se resultatet utan att gå live.
// UNG-270: i After/Ondemand visas utkastet (sparad trim, kapitel och undertexter) före publicering.
// Dold sedan UNG-270 (ersatt av växlingen på översiktens spelare); ligger kvar för att kunna plockas fram om behovet uppstår.
export function PreviewOverlay({ project: p, actions, kind, onClose }: PreviewOverlayProps) {
  const beforeBroadcast = kind === 'before'
  const [showAs, setShowAs] = useState<ShowAs>('live')
  const [link, setLink] = useState<PreviewLink | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [renewal, setRenewal] = useState(0)
  const [playout, setPlayout] = useState<PreviewPlayout>(EMPTY_PLAYOUT)
  const mode = beforeBroadcast ? showAs : undefined

  useEffect(() => {
    let cancelled = false
    setLink(null)
    setError(null)
    client.projects.createPreviewLink(p.id, { variant: kind === 'draft' ? 'draft' : 'published', mode }).then(
      (next) => { if (!cancelled) setLink(next) },
      (reason) => { if (!cancelled) setError(errorMessage(reason)) },
    )
    return () => { cancelled = true }
  }, [p.id, kind, mode, renewal])

  useEffect(() => {
    const id = window.setInterval(() => setRenewal((value) => value + 1), RENEW_LINK_MS)
    return () => window.clearInterval(id)
  }, [])

  useEffect(() => {
    if (!beforeBroadcast) return
    client.projects.getPreviewPlayout(p.id).then(setPlayout, (reason) => setError(errorMessage(reason)))
  }, [p.id, beforeBroadcast])

  function testCue(kind: CueKind, refId: string | null) {
    if (kind !== 'agendaItem' && kind !== 'person') return
    client.projects.previewCue(p.id, kind, refId).then(setPlayout, (reason) => setError(errorMessage(reason)))
  }

  function resetPlayout() {
    client.projects.resetPreviewPlayout(p.id).then(() => setPlayout(EMPTY_PLAYOUT), (reason) => setError(errorMessage(reason)))
  }

  // Listorna visar testutspelningen som "i bild" och skickar sina cuer dit; redigering av dagordning och namnlista är den vanliga.
  const testProject = useMemo<Project>(() => ({
    ...p,
    playout: { ...playout, timeline: [], currentAgendaItem: null, currentPerson: null, currentExclamation: null, currentPause: null },
  }), [p, playout])
  const testActions = useMemo<ProjectActions>(() => ({
    ...actions,
    cue: (kind, refId) => testCue(kind, refId),
    clear: (kind) => testCue(kind, null),
  }), [actions, p.id])

  const player = (
    <section class="pvo-player" aria-label={t`The player in preview`}>
      {error && <p class="pvo-error" role="alert">{error}</p>}
      {link && p.playerUrl ? (
        <div class="pvo-frame">
          <iframe key={link.token} src={previewPlayerUrl(p.playerUrl, link.token)} title={t`Preview of the player`} allow="autoplay; fullscreen" allowFullScreen />
        </div>
      ) : !error && <p class="pvo-note">{t`The preview is loading…`}</p>}
    </section>
  )

  return (
    <PlayoutOverlay
      title={t`Preview`}
      label={t`Preview of the player`}
      projectName={p.name}
      onClose={onClose}
      bar={beforeBroadcast && (
        <div class="pvo-showas" role="group" aria-label={t`Show the player as`}>
          <button type="button" class={showAs === 'before' ? 'is-active' : ''} aria-pressed={showAs === 'before'} onClick={() => setShowAs('before')}>
            {t`Before the broadcast`}
          </button>
          <button type="button" class={showAs === 'live' ? 'is-active' : ''} aria-pressed={showAs === 'live'} onClick={() => setShowAs('live')}>
            {t`During the broadcast`}
          </button>
        </div>
      )}
    >
      {beforeBroadcast ? (
        <div class="pvo">
          <div class="pvo-test">
            <div class="pvo-test-head">
              <p class="pvo-hint">{t`Test play-out: what you play out here is only visible in the preview, not to the viewers and not in the broadcast's history.`}</p>
              <button class="btn btn-sm" type="button" disabled={!playout.currentAgendaItemId && !playout.currentPersonId} onClick={resetPlayout}>
                {t`Clear the test play-out`}
              </button>
            </div>
            <PlayoutColumns project={testProject} actions={testActions} searchable />
          </div>
          {player}
        </div>
      ) : (
        <div class="pvo pvo-live">
          {player}
          <p class="pvo-hint">
            {kind === 'draft'
              ? t`The preview shows the saved draft: trim, chapters and captions as they will be when you publish. Unsaved changes are not shown.`
              : t`The preview shows what the viewers see now. Test play-out is only available before the broadcast.`}
          </p>
        </div>
      )}
    </PlayoutOverlay>
  )
}
