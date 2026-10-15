import { t } from '@lingui/core/macro'
import { useEffect, useRef, useState } from 'preact/hooks'
import { holdActivity, markActivity } from '../../app/activity'
import { Clock } from '../../components/Clock'
import { formatLocalTime } from '../../app/time'
import { inactivityText, stayLoggedInLabel } from '../../app/InactivityWarning'
import { EncoderStatusChip, ViewersChip } from '../projects/LiveStatusBadges'
import { encoderStatusOf, viewerCountOf } from '../projects/liveStatus'
import { NowPanels } from '../projects/PlayoutWorkOverlay'
import { signalSince } from '../projects/ProjectHeader'
import { MODE_LABEL } from '../projects/projectMode'
import { pauseDurationText } from '../projects/pauseLogic'
import type { TimelineEvent } from '../../data/types'
import { statusStripView } from './statusStripLogic'
import { useStatusProject } from './useStatusProject'
import '../projects/ProjectHeader.css'
import '../projects/LiveWorkspace.css'
import './StatusStrip.css'

interface StatusStripProps {
  auth: 'loading' | 'anon' | 'authed'
  /** The project open in the console's Projects surface, or null. */
  projectId: string | null
  /** Shortly before the logout for inactivity (UNG-312): the warning, inline; a dialog does not fit in the strip. */
  inactivityRemainingMs: number | null
}

// UNG-322: the status strip, Presenter's surface at the top of Combined view in ungap Shell (fixed height, 128 px). It shows
// the project open in Projects: mode with break, signal, viewers, clock, and what is on screen now with ✕ to clear it.
// Everything else (cueing, starting a break, changing mode) is done in Projects; a dialog would not fit in the strip.
export function StatusStrip({ auth, projectId, inactivityRemainingMs }: StatusStripProps) {
  const view = statusStripView(auth, projectId)
  if (inactivityRemainingMs !== null && auth === 'authed') return <InactivityNote remainingMs={inactivityRemainingMs} />
  if (view === 'loading') return <div class="ss-strip ss-note">{t`Loading…`}</div>
  if (view === 'signIn') return <div class="ss-strip ss-note">{t`Log in to ungap Presenter under Projects to see the broadcast status here.`}</div>
  if (view === 'noProject') return <div class="ss-strip ss-note">{t`Open a project under Projects to see its broadcast status here.`}</div>
  return <ProjectStatus projectId={projectId!} />
}

function ProjectStatus({ projectId }: { projectId: string }) {
  const { project: p, health, missing, error, clear, resume } = useStatusProject(projectId)
  // UNG-312, as in Livesandning: the open project's broadcast counts as activity, so an operator watching Combined view is not
  // logged out for inactivity in the middle of it. Live with a signal, and new chapters from Meeting or the playout.
  const broadcasting = p !== null && signalSince(p, health) !== null
  useEffect(() => (broadcasting ? holdActivity() : undefined), [broadcasting])
  const latestChapterAt = (p?.playout?.timeline ?? []).reduce<string | null>((latest, event) => (latest === null || event.occurredAt > latest ? event.occurredAt : latest), null)
  const seenChapterAt = useRef(latestChapterAt)
  useEffect(() => {
    if (latestChapterAt === seenChapterAt.current) return
    seenChapterAt.current = latestChapterAt
    if (latestChapterAt) markActivity()
  }, [latestChapterAt])

  if (missing) return <div class="ss-strip ss-note">{t`The project is no longer available. Open a project under Projects.`}</div>
  if (!p) return <div class="ss-strip ss-note">{t`Loading…`}</div>

  const encoderStatus = encoderStatusOf({ hasChannel: Boolean(p.channel), publicMode: p.publicMode, livePhase: health?.livePhase, healthState: health?.state })
  const viewerCount = viewerCountOf(health)
  const pause = p.playout.currentPause ?? null

  return (
    <div class="ss-strip">
      <div class="ss-status">
        <div class="ss-row">
          <span class={`ss-mode is-${p.publicMode}`}>{MODE_LABEL[p.publicMode]}</span>
          <h1 class="ss-title" title={p.name}>{p.name}</h1>
          <span class="pv-clock"><Clock since={signalSince(p, health)} /></span>
        </div>
        <div class="ss-row">
          <EncoderStatusChip status={encoderStatus} />
          {viewerCount !== null && <ViewersChip count={viewerCount} />}
        </div>
        {pause ? <PauseStatus pause={pause} onResume={resume} /> : error && <div class="ss-error" role="alert">{error}</div>}
      </div>
      <div class="ss-now">
        <NowPanels project={p} actions={{ clear }} showTime={false} />
      </div>
    </div>
  )
}

function pausedText(since: string, duration: string): string {
  return t`Break since ${since} (${duration})`
}

function PauseStatus({ pause, onResume }: { pause: TimelineEvent; onResume: () => void }) {
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    setNow(Date.now())
    const timer = window.setInterval(() => setNow(Date.now()), 30_000)
    return () => window.clearInterval(timer)
  }, [pause.id])

  return (
    <div class="ss-row ss-pause" role="status">
      <span class="ss-pause-text" title={pause.label}>{pausedText(formatLocalTime(pause.occurredAt), pauseDurationText(pause.occurredAt, now))}</span>
      <button class="btn btn-sm" type="button" onClick={onResume}>{t`End break`}</button>
    </div>
  )
}

// Same texts as the console's dialog (InactivityWarning).
function InactivityNote({ remainingMs }: { remainingMs: number }) {
  return (
    <div class="ss-strip ss-note" role="alert">
      <span>{inactivityText(remainingMs)}</span>
      <button class="btn btn-sm btn-primary" type="button" onClick={() => markActivity()}>{stayLoggedInLabel()}</button>
    </div>
  )
}
