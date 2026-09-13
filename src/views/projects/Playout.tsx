import { useState } from 'preact/hooks'
import { client } from '../../data'
import type { CueKind, Project, TimelineEvent } from '../../data/types'
import { useResource } from '../../app/useResource'
import { StatusChip } from '../../components/StatusChip'
import { PickerModal } from '../../components/PickerModal'
import type { ProjectActions } from './actions'
import { formatDateTime, formatHms } from '../../app/time'
import { useTick } from './useTick'
import { CheckIcon, PlayIcon } from '../../components/icons'
import './Playout.css'

function lastEventOfKind(timeline: TimelineEvent[], kind: CueKind): TimelineEvent | null {
  for (let i = timeline.length - 1; i >= 0; i--) {
    if (timeline[i].kind === kind) return timeline[i]
  }
  return null
}

interface PlayoutProps {
  project: Project
  onClose: () => void
  actions: ProjectActions
}

export function Playout({ project: p, onClose, actions }: PlayoutProps) {
  useTick(p.channel?.state === 'live')
  const [picking, setPicking] = useState<'agenda' | 'namelist' | null>(null)

  const agendaResource = useResource(
    () => (p.agendaId ? client.agendas.get(p.agendaId) : Promise.resolve(undefined)),
    [p.agendaId],
  )
  const nameListResource = useResource(
    () => (p.namelistId ? client.namelists.get(p.namelistId) : Promise.resolve(undefined)),
    [p.namelistId],
  )
  const allAgendasResource = useResource(() => client.agendas.list(), [])
  const allNameListsResource = useResource(() => client.namelists.list(), [])

  const live = p.channel?.state === 'live'
  const frozen = p.publication.state === 'published'
  // Utspelning ska fungera även offline — mötet måste dokumenteras trots
  // enkoderstrul. Tidslinjen kan synkas mot en uppladdad film senare.
  const canPlay = !frozen

  const subtitle = live
    ? `Playout · sänder sedan ${p.sim.recordingStartedAt ? formatDateTime(p.sim.recordingStartedAt) : ''}`
    : 'Playout'

  const statusTone = live ? 'live' : p.publication.state === 'published' ? 'accent' : p.channel ? 'danger' : 'neutral'
  const statusLabel = live ? 'Sänder' : p.publication.state === 'published' ? 'Publicerad' : p.channel ? 'Offline' : 'Ingen resurs'

  const agenda = agendaResource.data
  const nameList = nameListResource.data

  const nowItem = agenda?.items.find((it) => it.id === p.playout.currentAgendaItemId)?.title ?? null
  const nowSpeaker = nameList?.people.find((pe) => pe.id === p.playout.currentPersonId)?.name ?? null
  const lastAgendaEvent = lastEventOfKind(p.playout.timeline, 'agendaItem')
  const lastPersonEvent = lastEventOfKind(p.playout.timeline, 'person')

  function lastPlayedOffset(itemId: string): number | null {
    const events = p.playout.timeline.filter((e) => e.kind === 'agendaItem' && e.refId === itemId)
    if (events.length === 0) return null
    return events[events.length - 1].offsetSeconds
  }

  let playNote = ''
  if (frozen) playNote = 'Sändningen är publicerad. Utspelning är avstängd.'
  else if (!live)
    playNote = 'Ingen aktiv sändning just nu — utspelning loggas ändå och kan synkas mot filmen senare.'

  return (
    <>
      <div class="panel-head">
        <div class="title">
          {p.name}
          <span>{subtitle}</span>
        </div>
        <div class="panel-head-row">
          <StatusChip tone={statusTone} dot>
            {statusLabel}
          </StatusChip>
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
          <button class="btn" type="button" onClick={onClose}>
            Stäng playout
          </button>
        </div>
      </div>

      <div class="now">
        <div>
          <div class="k">Ärende i bild</div>
          <div class={`v now-value ${nowItem ? '' : 'empty'}`}>
            <span>{nowItem ?? '–'}</span>
            {nowItem && lastAgendaEvent && (
              <button
                class="ib now-clear"
                type="button"
                title="Ta bort senaste utspelning"
                aria-label="Ta bort senaste utspelning"
                onClick={() => actions.removeTimelineEvent(lastAgendaEvent.id)}
              >
                ✕
              </button>
            )}
          </div>
        </div>
        <div>
          <div class="k">Talare i bild</div>
          <div class={`v now-value ${nowSpeaker ? '' : 'empty'}`}>
            <span>{nowSpeaker ?? '–'}</span>
            {nowSpeaker && lastPersonEvent && (
              <button
                class="ib now-clear"
                type="button"
                title="Ta bort senaste utspelning"
                aria-label="Ta bort senaste utspelning"
                onClick={() => actions.removeTimelineEvent(lastPersonEvent.id)}
              >
                ✕
              </button>
            )}
          </div>
        </div>
      </div>

      <div class={`cols ${live ? 'two' : ''}`}>
        <div class="col">
          <h3>
            Dagordning
            <button class="btn btn-sm" type="button" onClick={() => setPicking('agenda')}>
              Byt
            </button>
          </h3>
          <div class="col-body">
            {!agenda ? (
              <p class="muted-empty">{p.agendaId ? 'Laddar…' : 'Ingen dagordning kopplad till projektet.'}</p>
            ) : (
              <ul class="list">
                {agenda.items.map((it) => {
                  const offset = lastPlayedOffset(it.id)
                  const done = offset != null
                  return (
                    <li key={it.id} class={p.playout.currentAgendaItemId === it.id ? 'active' : ''}>
                      <span class="grip" aria-hidden="true">
                        ⠿
                      </span>
                      <span class="label">{it.title}</span>
                      {done && <span class="time">{formatHms(offset)}</span>}
                      <button
                        class={`play ${done ? 'done' : ''}`}
                        type="button"
                        disabled={!canPlay}
                        title={done ? 'Spela ut igen' : 'Spela ut'}
                        onClick={() => actions.cue('agendaItem', it.id, it.title)}
                      >
                        {done ? <CheckIcon /> : <PlayIcon />}
                      </button>
                    </li>
                  )
                })}
              </ul>
            )}
          </div>
        </div>

        <div class="col">
          <h3>
            Namnlista
            <button class="btn btn-sm" type="button" onClick={() => setPicking('namelist')}>
              Byt
            </button>
          </h3>
          <div class="col-body">
            {!nameList ? (
              <p class="muted-empty">{p.namelistId ? 'Laddar…' : 'Ingen namnlista kopplad till projektet.'}</p>
            ) : (
              <ul class="list">
                {nameList.people.map((person) => (
                  <li key={person.id} class={p.playout.currentPersonId === person.id ? 'active' : ''}>
                    <span class="label">{person.name}</span>
                    <button
                      class="play"
                      type="button"
                      disabled={!canPlay}
                      title="Spela ut"
                      onClick={() => actions.cue('person', person.id, person.name)}
                    >
                      <PlayIcon />
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>

        {!live && (
          <div class="col">
            <h3>
              Tidslinje
              {frozen && <StatusChip tone="accent">Fryst</StatusChip>}
            </h3>
            <div class="col-body">
              {p.playout.timeline.length === 0 ? (
                <p class="muted-empty">Inget utspelat ännu.</p>
              ) : (
                <ul class="tl">
                  {p.playout.timeline.map((e) => (
                    <li key={e.id}>
                      <span class="t">{formatHms(e.offsetSeconds ?? 0)}</span>
                      <span class="what">
                        {e.label}
                        <em>{e.kind === 'agendaItem' ? 'Ärende' : 'Talare'}</em>
                      </span>
                    </li>
                  ))}
                </ul>
              )}
              <p class="tl-foot">
                {frozen
                  ? 'Kapitellistan är fryst vid publicering och följer inte längre originaldagordningen.'
                  : 'Varje utspelning loggas här. Tidslinjen fryses som kapitellista när sändningen publiceras.'}
              </p>
            </div>
          </div>
        )}
      </div>

      {playNote && (
        <div class="playout-note">
          <div class="note">{playNote}</div>
        </div>
      )}

      {picking === 'agenda' && (
        <PickerModal
          title="Byt dagordning"
          items={(allAgendasResource.data ?? []).map((a) => ({ id: a.id, name: a.name }))}
          selectedId={p.agendaId}
          onPick={(id) => {
            actions.setAgenda(id)
            setPicking(null)
          }}
          onCancel={() => setPicking(null)}
        />
      )}

      {picking === 'namelist' && (
        <PickerModal
          title="Byt namnlista"
          items={(allNameListsResource.data ?? []).map((n) => ({ id: n.id, name: n.name }))}
          selectedId={p.namelistId}
          onPick={(id) => {
            actions.setNameList(id)
            setPicking(null)
          }}
          onCancel={() => setPicking(null)}
        />
      )}
    </>
  )
}
