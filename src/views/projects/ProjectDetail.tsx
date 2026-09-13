import { useState } from 'preact/hooks'
import type { Project, RecordingState } from '../../data/types'
import { StatusChip, type ChipTone } from '../../components/StatusChip'
import { CopyField } from '../../components/CopyField'
import type { ProjectActions } from './actions'
import { formatDateTime, formatHms } from '../../app/time'
import { useTick } from './useTick'
import './ProjectDetail.css'

interface ProjectDetailProps {
  project: Project
  onOpenPlayout: () => void
  actions: ProjectActions
}

function recordedSeconds(project: Project): number {
  const base = project.sim.accumulatedSeconds
  if (!project.sim.recordingStartedAt) return base
  return base + (Date.now() - new Date(project.sim.recordingStartedAt).getTime()) / 1000
}

const ODM_META: Record<RecordingState, { label: string; tone: ChipTone }> = {
  none: { label: 'Ingen inspelning', tone: 'neutral' },
  recording: { label: 'Spelas in', tone: 'neutral' },
  recorded: { label: 'Ej publicerad', tone: 'neutral' },
  trimmed: { label: 'Granskas', tone: 'warn' },
  published: { label: 'Publicerad', tone: 'accent' },
}

export function ProjectDetail({ project: p, onOpenPlayout, actions }: ProjectDetailProps) {
  useTick(p.channel?.state === 'live')
  const [tab, setTab] = useState<'live' | 'odm'>('live')

  const hasIngest = !!p.channel
  const live = p.channel?.state === 'live'
  const rec = p.recording?.state ?? 'none'
  const pub = p.visibility === 'open'
  const elapsed = recordedSeconds(p)

  const subtitle = live
    ? `Projekt · sänder sedan ${p.sim.recordingStartedAt ? formatDateTime(p.sim.recordingStartedAt) : ''}`
    : p.publication.state === 'published'
      ? 'Projekt · publicerad som ondemand'
      : `Projekt · skapad ${formatDateTime(p.createdAt)}`

  let liveNote = ''
  if (live) liveNote = 'Riv resurs är låst medan signal tas emot. Stoppa enkodern först.'
  else if (hasIngest && p.sim.everSent)
    liveNote =
      'Enkodern har slutat sända. Det kan vara en tillfällig störning — resursen ligger kvar tills du river den.'
  else if (hasIngest) liveNote = 'Resursen är allokerad och väntar på signal.'

  let odmNote = ''
  if (rec === 'recording') odmNote = 'Trimning blir tillgänglig när enkodern slutat sända.'
  else if (rec === 'none') odmNote = 'Ingen inspelning finns ännu.'
  else if (rec === 'recorded')
    odmNote = `Inspelningen är klar (${formatHms(elapsed)}). Trimma den innan du publicerar.`
  else if (rec === 'trimmed')
    odmNote = 'Trimmad. Dela granskningslänken för godkännande — materialet är ännu inte publikt.'
  else odmNote = pub ? 'Publicerad och öppen för publik. Kapitellistan är fryst.' : 'Publicerad men stängd för publik.'
  if (p.sim.segments > 1 && rec !== 'recording' && rec !== 'none') {
    odmNote += ` Inspelningen har ${p.sim.segments - 1} glapp — kontrollera kapitlens offset efter trimning.`
  }

  return (
    <>
      <div class="panel-head">
        <div class="title">
          {p.name}
          <span>{subtitle}</span>
        </div>
        <div class="panel-head-row">
          <div class="field field-grow">
            <label>Spelarlänk</label>
            <CopyField value={pub ? p.playerUrl : null} placeholder="Stängd för publik" monospace />
          </div>
          <div class="field">
            <label>Publik</label>
            <div class="seg">
              <button
                type="button"
                aria-pressed={p.visibility === 'open'}
                onClick={() => actions.setVisibility('open')}
              >
                Öppen
              </button>
              <button
                type="button"
                class="closed"
                aria-pressed={p.visibility === 'closed'}
                onClick={() => actions.setVisibility('closed')}
              >
                Stängd
              </button>
            </div>
          </div>
          <button class="btn btn-primary" type="button" onClick={onOpenPlayout}>
            Öppna playout
          </button>
        </div>
      </div>

      <div class="tabs" role="tablist">
        <button role="tab" type="button" aria-selected={tab === 'live'} onClick={() => setTab('live')}>
          Live
        </button>
        <button role="tab" type="button" aria-selected={tab === 'odm'} onClick={() => setTab('odm')}>
          Ondemand
        </button>
      </div>

      {tab === 'live' && (
        <div class="tabpanel">
          <div class="actions">
            <StatusChip tone={!hasIngest ? 'neutral' : live ? 'live' : 'danger'} dot>
              {!hasIngest ? 'Ingen resurs' : live ? 'Sänder' : 'Offline'}
            </StatusChip>
            <span class="sep" />
            <button class="btn" type="button" disabled={hasIngest} onClick={actions.createChannel}>
              Skapa ingest
            </button>
            <button
              class="btn btn-danger"
              type="button"
              disabled={!hasIngest || live}
              title={live ? 'Går inte att riva medan signal tas emot' : undefined}
              onClick={actions.teardownChannel}
            >
              Riv resurs
            </button>
          </div>
          <div class="resource">
            <div class="rowset">
              <div class="field">
                <label>Ingest-server</label>
                <CopyField
                  value={hasIngest ? 'rtmps://a1b2c3.global-contribute.live-video.net:443/app/' : null}
                  placeholder="Skapa ingest först"
                  monospace
                />
              </div>
              <div class="field">
                <label>Stream key</label>
                <CopyField value={hasIngest ? 'sk_eu-north-1_••••••••••••••••' : null} monospace />
              </div>
              <div class="field">
                <label>HLS-URL</label>
                <CopyField
                  value={hasIngest ? 'https://a1b2c3.eu-north-1.playback.live-video.net/…/master.m3u8' : null}
                  monospace
                />
              </div>
            </div>
            <div class="health">
              <h4>Inkommande signal</h4>
              {live ? (
                <dl>
                  <dt>Bitrate</dt>
                  <dd>5 980 kbps</dd>
                  <dt>Upplösning</dt>
                  <dd>1920×1080p50</dd>
                  <dt>Senaste bild</dt>
                  <dd>0,4 s sedan</dd>
                  <dt>Inspelat</dt>
                  <dd>{formatHms(elapsed)}</dd>
                </dl>
              ) : (
                <p>{hasIngest ? 'Ingen signal. Starta enkodern.' : 'Ingen live-resurs allokerad.'}</p>
              )}
            </div>
          </div>
          {liveNote && <div class={`note ${live ? 'warn' : ''}`}>{liveNote}</div>}

          <div class="debugbar">
            <span class="debugbar-label">Debug</span>
            <button
              class="btn btn-sm"
              type="button"
              disabled={!hasIngest || live}
              onClick={() => actions.setEncoderSending(true)}
            >
              Simulera signal start
            </button>
            <button
              class="btn btn-sm"
              type="button"
              disabled={!hasIngest || !live}
              onClick={() => actions.setEncoderSending(false)}
            >
              Simulera signal stopp
            </button>
            <span class="spacer" />
            <button class="btn btn-sm btn-danger" type="button" onClick={actions.reset}>
              Återställ allt
            </button>
          </div>
        </div>
      )}

      {tab === 'odm' && (
        <div class="tabpanel">
          <div class="actions">
            <StatusChip tone={ODM_META[rec].tone} dot>
              {rec === 'recording' ? 'Spelas in' : ODM_META[rec].label}
            </StatusChip>
            <span class="sep" />
            <button
              class="btn"
              type="button"
              disabled={!(rec === 'recorded' || rec === 'trimmed')}
              title={live ? 'Tillgänglig först när enkodern slutat sända' : undefined}
              onClick={actions.trim}
            >
              Trimma inspelning
            </button>
            <button
              class="btn"
              type="button"
              disabled={rec === 'none' || rec === 'recording'}
              onClick={actions.createReviewLink}
            >
              Skapa granskningslänk
            </button>
            <button
              class="btn btn-primary"
              type="button"
              disabled={rec !== 'trimmed'}
              title={rec !== 'trimmed' ? 'Trimma inspelningen först' : undefined}
              onClick={actions.publish}
            >
              Publicera
            </button>
          </div>
          <div class="rowset" style={{ maxWidth: '660px' }}>
            <div class="field">
              <label>Granskningslänk</label>
              <CopyField
                value={p.publication.state !== 'none' ? 'https://play.ungap.se/review/9f3a-kf2409' : null}
                placeholder="Skapas när inspelningen är trimmad"
                monospace
              />
            </div>
            <div class="field">
              <label>HLS-URL</label>
              <CopyField
                value={p.publication.state === 'published' ? `https://cdn.ungap.se/vod/${p.id}/master.m3u8` : null}
                placeholder="Tillgänglig efter publicering"
                monospace
              />
            </div>
          </div>
          {odmNote && (
            <div class={`note ${p.sim.segments > 1 || rec === 'trimmed' ? 'warn' : ''}`}>{odmNote}</div>
          )}
        </div>
      )}
    </>
  )
}
