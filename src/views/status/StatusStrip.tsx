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
import { meetingLinkStatus, statusStripView, type MeetingLinkStatus } from './statusStripLogic'
import { client } from '../../data'
import { openCombined } from '../../app/embed'
import type { ShellMeeting } from '../../app/shellProtocol'
import { useStatusProject } from './useStatusProject'
import '../projects/ProjectHeader.css'
import '../projects/LiveWorkspace.css'
import './StatusStrip.css'

interface StatusStripProps {
  auth: 'loading' | 'anon' | 'authed'
  /** The project open in the console's Projects surface, or null. */
  projectId: string | null
  /** UNG-332: the meeting open in Meeting's frame below (from the shell), or null. */
  meeting: ShellMeeting | null
  /** Shortly before the logout for inactivity (UNG-312): the warning, inline; a dialog does not fit in the strip. */
  inactivityRemainingMs: number | null
}

// UNG-322: the status strip, Presenter's surface at the top of Combined view in ungap Shell (fixed height, 128 px). It shows
// the project open in Projects: mode with break, signal, viewers, clock, and what is on screen now with ✕ to clear it.
// Everything else (cueing, starting a break, changing mode) is done in Projects; a dialog would not fit in the strip.
export function StatusStrip({ auth, projectId, meeting, inactivityRemainingMs }: StatusStripProps) {
  const view = statusStripView(auth, projectId)
  if (inactivityRemainingMs !== null && auth === 'authed') return <InactivityNote remainingMs={inactivityRemainingMs} />
  if (view === 'loading') return <div class="ss-strip ss-note">{t`Loading…`}</div>
  if (view === 'signIn') return <div class="ss-strip ss-note">{t`Log in to ungap Presenter under Projects to see the broadcast status here.`}</div>
  if (view === 'noProject') return <div class="ss-strip ss-note">{t`Open a project under Projects to see its broadcast status here.`}</div>
  return <ProjectStatus projectId={projectId!} meeting={meeting} />
}

const LINK_POLL_MS = 10_000

/** The project's meeting link (UNG-338), polled: it is set in Before, possibly in another tab while the strip shows. */
function useMeetingLink(projectId: string): { available: boolean; meetingId: string | null } | null {
  const [link, setLink] = useState<{ available: boolean; meetingId: string | null } | null>(null)
  useEffect(() => {
    setLink(null)
    let cancelled = false
    const load = () =>
      client.projects.getMeetingLink(projectId).then(
        (state) => {
          if (!cancelled) setLink({ available: state.available, meetingId: state.link?.meetingId ?? null })
        },
        () => {
          // Keep what was shown; the next poll tries again.
        },
      )
    void load()
    const timer = window.setInterval(() => void load(), LINK_POLL_MS)
    return () => {
      cancelled = true
      window.clearInterval(timer)
    }
  }, [projectId])
  return link
}

function ProjectStatus({ projectId, meeting }: { projectId: string; meeting: ShellMeeting | null }) {
  const link = useMeetingLink(projectId)
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
  // UNG-332: on the third row, which has the column's full width; a break or an error takes that row, then it shares the chips' row.
  const meetingNote = <MeetingLinkNote status={meetingLinkStatus(link, meeting?.id ?? null)} meeting={meeting} projectName={p.name} linkedMeetingId={link?.meetingId ?? null} />

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
          {(pause || error) && meetingNote}
        </div>
        {pause ? <PauseStatus pause={pause} onResume={resume} /> : error ? <div class="ss-error" role="alert">{error}</div> : meetingNote}
      </div>
      <div class="ss-now">
        <NowPanels project={p} actions={{ clear }} showTime={false} />
      </div>
    </div>
  )
}

// UNG-332: one line in the strip on whether the meeting below drives this project's graphics. The verdict comes first and
// short (the strip is narrow and the meeting's title is shown large right below); the full sentence is the tooltip. Warnings
// in the warning colour; the linked meeting can be opened below from here.
function MeetingLinkNote({ status, meeting, projectName, linkedMeetingId }: { status: MeetingLinkStatus; meeting: ShellMeeting | null; projectName: string; linkedMeetingId: string | null }) {
  if (status === 'unknown') return null
  const title = meeting?.title ?? ''
  const openLinked = (
    <button class="btn btn-sm" type="button" onClick={() => openCombined(linkedMeetingId)}>
      {t`Open linked meeting`}
    </button>
  )
  const note = (tone: '' | ' is-ok' | ' is-warn', text: string, detail: string, action: preact.ComponentChildren = null) => (
    <span class={`ss-meeting${tone}`} role={tone === ' is-warn' ? 'alert' : undefined} title={detail}>
      <span class="ss-meeting-text">{text}</span>
      {action}
    </span>
  )
  if (status === 'drives') return note(' is-ok', t`The meeting below drives the graphics`, t`The meeting “${title}” drives the graphics in ${projectName}.`)
  if (status === 'notOpen') return note('', t`No meeting open`, t`Open the linked meeting to drive the graphics in ${projectName}.`, openLinked)
  if (status === 'other') return note(' is-warn', t`The meeting below does not drive the graphics`, t`The meeting “${title}” does not drive the graphics in ${projectName}. Only the linked meeting does.`, openLinked)
  if (status === 'unavailable') return note(meeting ? ' is-warn' : '', t`ungap Meeting is not connected`, t`ungap Meeting is not connected to your organisation. Meetings do not drive the graphics in ${projectName}.`)
  return note(
    meeting ? ' is-warn' : '',
    meeting ? t`The meeting below does not drive the graphics: the project is not linked` : t`The project is not linked to a meeting`,
    meeting
      ? t`The meeting “${title}” does not drive the graphics in ${projectName}: the project is not linked to a meeting. Link it in Before.`
      : t`Link the project to a meeting in Before to let the meeting drive the graphics in ${projectName}.`,
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
