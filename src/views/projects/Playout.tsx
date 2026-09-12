import { client } from '../../data'
import type { Project } from '../../data/types'
import { useResource } from '../../app/useResource'
import { StatusChip } from '../../components/StatusChip'
import type { ProjectActions } from './actions'
import { formatDateTime, formatHms } from '../../app/time'
import { useTick } from './useTick'
import { CheckIcon, PlayIcon } from '../../components/icons'
import './Playout.css'

interface PlayoutProps {
  project: Project
  onClose: () => void
  actions: ProjectActions
}

export function Playout({ project: p, onClose, actions }: PlayoutProps) {
  useTick(p.channel?.state === 'live')

  const agendaResource = useResource(
    () => (p.agendaId ? client.agendas.get(p.agendaId) : Promise.resolve(undefined)),
    [p.agendaId],
  )
  const nameListResource = useResource(
    () => (p.namelistId ? client.namelists.get(p.namelistId) : Promise.resolve(undefined)),
    [p.namelistId],
  )

  const live = p.channel?.state === 'live'
  const frozen = p.publication.state === 'published'
  const canPlay = live && !frozen

  const subtitle = live
    ? `Playout · sänder sedan ${p.sim.recordingStartedAt ? formatDateTime(p.sim.recordingStartedAt) : ''}`
    : 'Playout'

  const statusTone = live ? 'live' : p.publication.state === 'published' ? 'accent' : p.channel ? 'danger' : 'neutral'
  const statusLabel = live ? 'Sänder' : p.publication.state === 'published' ? 'Publicerad' : p.channel ? 'Offline' : 'Ingen resurs'

  const agenda = agendaResource.data
  const nameList = nameListResource.data

  const nowItem = agenda?.items.find((it) => it.id === p.playout.currentAgendaItemId)?.title ?? null
  const nowSpeaker = nameList?.people.find((pe) => pe.id === p.playout.currentPersonId)?.name ?? null

  function lastPlayedOffset(itemId: string): number | null {
    const events = p.playout.timeline.filter((e) => e.kind === 'agendaItem' && e.refId === itemId)
    if (events.length === 0) return null
    return events[events.length - 1].offsetSeconds
  }

  let playNote = ''
  if (frozen) playNote = 'Sändningen är publicerad. Utspelning är avstängd.'
  else if (!live) playNote = 'Utspelning kräver aktiv sändning — timed metadata kan bara skickas i en pågående ström.'

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
          <div class={`v ${nowItem ? '' : 'empty'}`}>{nowItem ?? '–'}</div>
        </div>
        <div>
          <div class="k">Talare i bild</div>
          <div class={`v ${nowSpeaker ? '' : 'empty'}`}>{nowSpeaker ?? '–'}</div>
        </div>
      </div>

      <div class="cols">
        <div class="col">
          <h3>Dagordning</h3>
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
          <h3>Namnlista</h3>
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
      </div>

      {playNote && (
        <div class="playout-note">
          <div class="note">{playNote}</div>
        </div>
      )}
    </>
  )
}
