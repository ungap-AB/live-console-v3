import type { Project } from '../../data/types'
import type { ProjectActions } from './actions'
import { formatHms } from '../../app/time'
import { useTick } from './useTick'
import './StateControlPanel.css'

interface StateControlPanelProps {
  project: Project
  collapsed: boolean
  onToggleCollapsed: () => void
  actions: ProjectActions
}

const REC_LABEL: Record<string, string> = {
  none: 'ingen',
  recording: 'pågår',
  recorded: 'klar',
  trimmed: 'trimmad',
  published: 'publicerad',
}

function recordedSeconds(project: Project): number {
  const base = project.sim.accumulatedSeconds
  if (!project.sim.recordingStartedAt) return base
  return base + (Date.now() - new Date(project.sim.recordingStartedAt).getTime()) / 1000
}

function playerShows(p: Project): string {
  if (p.visibility === 'closed') return 'Stängd'
  if (p.channel?.state === 'live') return 'Livesändning'
  if (p.publication.state === 'published') return 'Ondemand'
  return 'Inget'
}

export function StateControlPanel({ project: p, collapsed, onToggleCollapsed, actions }: StateControlPanelProps) {
  useTick(p.channel?.state === 'live')

  const hasIngest = !!p.channel
  const live = p.channel?.state === 'live'
  const rec = p.recording?.state ?? 'none'

  return (
    <aside class={`ctl ${collapsed ? 'collapsed' : ''}`}>
      <header>
        <h2>
          Tillstånd <span class="hint">mockup-styrning</span>
        </h2>
        <button type="button" title={collapsed ? 'Fäll ut' : 'Fäll ihop'} onClick={onToggleCollapsed}>
          {collapsed ? '+' : '–'}
        </button>
      </header>
      <div class="body">
        <div class="grp">
          <span>Live-resurs (IVS)</span>
          <div class="row">
            <button type="button" aria-pressed={!hasIngest} disabled={!hasIngest} onClick={actions.teardownChannel}>
              Ingen
            </button>
            <button type="button" aria-pressed={hasIngest} disabled={hasIngest} onClick={actions.createChannel}>
              Skapad
            </button>
          </div>
        </div>

        <div class="grp">
          <span>Enkoder</span>
          <div class="row">
            <button
              type="button"
              aria-pressed={hasIngest && !live}
              disabled={!hasIngest || !live}
              onClick={() => actions.setEncoderSending(false)}
            >
              Stoppad
            </button>
            <button
              type="button"
              aria-pressed={live}
              disabled={!hasIngest || live}
              onClick={() => actions.setEncoderSending(true)}
            >
              Sänder
            </button>
          </div>
        </div>

        <div class="grp">
          <span>Ondemand</span>
          <div class="row">
            <button
              type="button"
              disabled={!(rec === 'recorded' || rec === 'trimmed')}
              onClick={actions.trim}
            >
              Trimma
            </button>
            <button type="button" disabled={rec !== 'trimmed'} onClick={actions.publish}>
              Publicera
            </button>
          </div>
        </div>

        <div class="grp">
          <span>Synlighet för publik</span>
          <div class="row">
            <button
              type="button"
              aria-pressed={p.visibility === 'open'}
              onClick={() => actions.setVisibility('open')}
            >
              Öppen
            </button>
            <button
              type="button"
              aria-pressed={p.visibility === 'closed'}
              onClick={() => actions.setVisibility('closed')}
            >
              Stängd
            </button>
          </div>
        </div>

        <dl class="derived">
          <dt>Inspelning</dt>
          <dd>{REC_LABEL[rec]}</dd>
          <dt>Spelaren visar</dt>
          <dd>{playerShows(p)}</dd>
          <dt>Sändningstid</dt>
          <dd>{formatHms(recordedSeconds(p))}</dd>
        </dl>
        <button class="reset" type="button" onClick={actions.reset}>
          Återställ allt
        </button>
      </div>
    </aside>
  )
}
