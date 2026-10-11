import { useEffect, useMemo, useState } from 'preact/hooks'
import { client } from '../../data'
import type { CueKind, PreviewLink, PreviewPlayout, Project } from '../../data/types'
import { errorMessage } from '../../app/optimistic'
import type { ProjectActions } from './actions'
import { PlayoutColumns } from './PlayoutColumns'
import { PlayoutOverlay } from './PlayoutOverlay'
import './PreviewOverlay.css'

type ShowAs = 'before' | 'live'
/** Before: testutspelning och visa som Före/Under. Live: det tittarna ser nu. Draft (After/Ondemand): det sparade utkastet. */
export type PreviewKind = 'before' | 'live' | 'draft'

const EMPTY_PLAYOUT: PreviewPlayout = { currentAgendaItemId: null, currentPersonId: null }
// Länken gäller i 4 timmar (UNG-253); förnyas i god tid så att en vy som står öppen länge inte tappar spelaren.
const RENEW_LINK_MS = 3 * 60 * 60 * 1000
// Förhandsvisningen pollas tätt, så att testutspelning och ändrade inställningar syns inom ett par sekunder (bara operatören tittar).
const PREVIEW_POLL_MS = 2000

/** Spelarens adress för en förhandsvisningslänk: samma spelare som tittarna får, men med ?preview i stället för ?p. */
export function previewPlayerUrl(playerUrl: string, token: string): string {
  const url = new URL(playerUrl, window.location.href)
  url.searchParams.delete('p')
  url.searchParams.set('preview', token)
  url.searchParams.set('pollMs', String(PREVIEW_POLL_MS))
  return url.toString()
}

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
    <section class="pvo-player" aria-label="Spelaren i förhandsvisning">
      {error && <p class="pvo-error" role="alert">{error}</p>}
      {link && p.playerUrl ? (
        <div class="pvo-frame">
          <iframe key={link.token} src={previewPlayerUrl(p.playerUrl, link.token)} title="Förhandsvisning av spelaren" allow="autoplay; fullscreen" allowFullScreen />
        </div>
      ) : !error && <p class="pvo-note">Förhandsvisningen laddas…</p>}
    </section>
  )

  return (
    <PlayoutOverlay
      title="Förhandsvisning"
      label="Förhandsvisning av spelaren"
      projectName={p.name}
      onClose={onClose}
      bar={beforeBroadcast && (
        <div class="pvo-showas" role="group" aria-label="Visa spelaren som">
          <button type="button" class={showAs === 'before' ? 'is-active' : ''} aria-pressed={showAs === 'before'} onClick={() => setShowAs('before')}>
            Före sändningen
          </button>
          <button type="button" class={showAs === 'live' ? 'is-active' : ''} aria-pressed={showAs === 'live'} onClick={() => setShowAs('live')}>
            Under sändningen
          </button>
        </div>
      )}
    >
      {beforeBroadcast ? (
        <div class="pvo">
          <div class="pvo-test">
            <div class="pvo-test-head">
              <p class="pvo-hint">Testutspelning: det du spelar ut här syns bara i förhandsvisningen, inte för tittarna och inte i sändningens historik.</p>
              <button class="btn btn-sm" type="button" disabled={!playout.currentAgendaItemId && !playout.currentPersonId} onClick={resetPlayout}>
                Rensa testutspelningen
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
              ? 'Förhandsvisningen visar det sparade utkastet: trim, kapitel och undertexter som de blir när du publicerar. Ändringar som inte är sparade syns inte.'
              : 'Förhandsvisningen visar det tittarna ser nu. Testutspelning finns bara före sändningen.'}
          </p>
        </div>
      )}
    </PlayoutOverlay>
  )
}
