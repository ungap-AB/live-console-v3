import { client } from '../../data'
import type { Channel, ChannelHealth, Project } from '../../data/types'
import { useResource } from '../../app/useResource'
import type { ProjectActions } from './actions'
import { PlayoutColumns } from './PlayoutColumns'
import './LiveWorkspace.css'

interface LiveWorkspaceProps {
  project: Project
  actions: ProjectActions
  channel: Channel | null
  health: ChannelHealth | null
  streamKey: string | null
}

// Ren sändningskontroll för läget Live.
export function LiveWorkspace({ project: p, actions, health }: LiveWorkspaceProps) {
  const agendaResource = useResource(
    () => (p.agendaId ? client.agendas.get(p.agendaId) : Promise.resolve(undefined)),
    [p.agendaId],
  )
  const nameListResource = useResource(
    () => (p.namelistId ? client.namelists.get(p.namelistId) : Promise.resolve(undefined)),
    [p.namelistId],
  )
  const phase = health?.livePhase

  const nowItem =
    p.playout.currentAgendaItem?.label ??
    agendaResource.data?.items.find((it) => it.id === p.playout.currentAgendaItemId)?.title ??
    null
  const nowSpeaker =
    p.playout.currentPerson?.label ??
    nameListResource.data?.people.find((pe) => pe.id === p.playout.currentPersonId)?.name ??
    null
  const nowExclamation = p.playout.currentExclamation?.label ?? null

  const panels: { key: string; label: string; value: string | null; clearLabel: string; onClear: () => void }[] = [
    { key: 'item', label: '', value: nowItem, clearLabel: 'Rensa ärende i bild', onClear: () => actions.clear('agendaItem') },
    { key: 'person', label: '', value: nowSpeaker, clearLabel: 'Rensa talare i bild', onClear: () => actions.clear('person') },
  ]
  if (p.meetingBindingId) {
    panels.push({
      key: 'exclamation',
      label: 'Tillfällig talare',
      value: nowExclamation,
      clearLabel: 'Rensa tillfällig talare',
      onClear: () => actions.clear('exclamation'),
    })
  }

  return (
    <div class="lw">
      {phase === 'signalInterrupted' && (
        <div class="lw-interrupt" role="alert">
          <p>Signalavbrott — videosignalen har avbrutits medan spelaren är öppen.</p>
          <button class="btn btn-sm" type="button" onClick={() => void actions.interruptionDecision('wait_for_reconnect')}>
            Invänta återanslutning
          </button>
          <button class="btn btn-danger btn-sm" type="button" onClick={() => void actions.interruptionDecision('end')}>
            Stäng player och avsluta
          </button>
        </div>
      )}

      <div class="lw-now">
        {panels.map((panel) => (
          <div key={panel.key} class={`lw-now-panel${panel.value ? ' is-active' : ''}`}>
            {panel.label && <span class="lw-now-label">{panel.label}</span>}
            <span class="lw-now-value">
              <span>{panel.value ?? '–'}</span>
              {panel.value && (
                <button class="pv-icon-btn" type="button" aria-label={panel.clearLabel} title={panel.clearLabel} onClick={panel.onClear}>
                  ✕
                </button>
              )}
            </span>
          </div>
        ))}
      </div>

      <PlayoutColumns project={p} actions={actions} live />
    </div>
  )
}
