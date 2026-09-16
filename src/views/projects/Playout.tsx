import { useEffect, useState } from 'preact/hooks'
import { client } from '../../data'
import type { Agenda, NameList, Project } from '../../data/types'
import { useResource } from '../../app/useResource'
import { StatusChip, type ChipTone } from '../../components/StatusChip'
import { PickerModal } from '../../components/PickerModal'
import { EditableItemList } from '../../components/EditableItemList'
import type { ProjectActions } from './actions'
import { formatDateTime, formatHms } from '../../app/time'
import { useTick } from './useTick'
import { useLiveChannel } from './useLiveChannel'
import { phaseMeta } from './livePhase'
import { CheckIcon, PlayIcon } from '../../components/icons'
import { Icon } from '../../components/Icon'
import './Playout.css'

interface PlayoutProps {
  project: Project
  onClose: () => void
  actions: ProjectActions
}

export function Playout({ project: p, onClose, actions }: PlayoutProps) {
  const { health } = useLiveChannel(p.channel?.id ?? null)
  const phase = health?.livePhase
  const live = phase === 'live'
  useTick(live)
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

  // Lokal, muterbar kopia (samma mönster som AgendasView/NameListsViews
  // "selected") — så redigering av dagordningen/namnlistan direkt här i
  // Playout kan uppdatera UI:t omedelbart utan en full omhämtning.
  const [agenda, setAgenda] = useState<Agenda | null>(null)
  const [nameList, setNameList] = useState<NameList | null>(null)
  useEffect(() => setAgenda(agendaResource.data ?? null), [agendaResource.data])
  useEffect(() => setNameList(nameListResource.data ?? null), [nameListResource.data])

  const frozen = p.publication.state === 'published'
  // Utspelning ska fungera även offline — mötet måste dokumenteras trots
  // enkoderstrul. Tidslinjen kan synkas mot en uppladdad film senare.
  const canPlay = !frozen

  const subtitle = live
    ? `Playout · sänder sedan ${health?.streamStartedAt ? formatDateTime(health.streamStartedAt) : ''}`
    : 'Playout'

  const status: { label: string; tone: ChipTone } = frozen
    ? { label: 'Publicerad', tone: 'accent' }
    : p.channel
      ? phaseMeta(phase)
      : { label: 'Ingen resurs', tone: 'neutral' }
  const statusTone = status.tone
  const statusLabel = status.label

  const nowItem = agenda?.items.find((it) => it.id === p.playout.currentAgendaItemId)?.title ?? null
  const nowSpeaker = nameList?.people.find((pe) => pe.id === p.playout.currentPersonId)?.name ?? null

  function lastPlayedOffset(itemId: string): number | null {
    const events = p.playout.timeline.filter((e) => e.kind === 'agendaItem' && e.refId === itemId)
    if (events.length === 0) return null
    return events[events.length - 1].offsetSeconds
  }

  // Samma redigeringsanrop som AgendasView/NameListsView gör mot samma
  // klient-API — bara mot den dagordning/namnlista som råkar vara kopplad
  // till det här projektet, och med en lokal setter istället för replaceSelected.
  async function addAgendaItem(): Promise<string> {
    const updated = await client.agendas.addItem(agenda!.id, { title: 'Ny punkt' })
    setAgenda(updated)
    return updated.items[updated.items.length - 1].id
  }

  async function renameAgendaItem(itemId: string, title: string) {
    const updated = await client.agendas.updateItem(agenda!.id, itemId, { title })
    setAgenda(updated)
  }

  async function removeAgendaItem(itemId: string) {
    const updated = await client.agendas.removeItem(agenda!.id, itemId)
    setAgenda(updated)
  }

  async function reorderAgendaItems(nextItems: Agenda['items']) {
    const renumbered = nextItems.map((it, i) => ({ ...it, position: i + 1 }))
    const updated = await client.agendas.replaceItems(agenda!.id, renumbered)
    setAgenda(updated)
  }

  async function addPerson(): Promise<string> {
    const updated = await client.namelists.addPerson(nameList!.id, { name: 'Ny person' })
    setNameList(updated)
    return updated.people[updated.people.length - 1].id
  }

  async function renamePerson(personId: string, name: string) {
    const updated = await client.namelists.updatePerson(nameList!.id, personId, { name })
    setNameList(updated)
  }

  async function removePerson(personId: string) {
    const updated = await client.namelists.removePerson(nameList!.id, personId)
    setNameList(updated)
  }

  async function reorderPeople(nextPeople: NameList['people']) {
    const renumbered = nextPeople.map((pe, i) => ({ ...pe, position: i + 1 }))
    const updated = await client.namelists.replacePeople(nameList!.id, renumbered)
    setNameList(updated)
  }

  async function createAndAttachAgenda() {
    const created = await client.agendas.create({ name: 'Ny dagordning', description: 'Utkast' })
    actions.setAgenda(created.id)
    allAgendasResource.reload()
    setPicking(null)
  }

  async function createAndAttachNameList() {
    const created = await client.namelists.create({ name: 'Ny namnlista', description: 'Utkast' })
    actions.setNameList(created.id)
    allNameListsResource.reload()
    setPicking(null)
  }

  let playNote = ''
  if (frozen) playNote = 'Sändningen är publicerad. Utspelning är avstängd.'
  else if (!live)
    playNote = 'Ingen aktiv sändning just nu — utspelning loggas ändå och kan synkas mot filmen senare.'

  return (
    <>
      <div class="panel-head">
        <div class="title-row">
          <div class="title">
            <StatusChip tone={statusTone} dot>
              {statusLabel}
            </StatusChip>
            {p.name}
            <span class="subtitle">{subtitle}</span>
          </div>
          <button class="ib" type="button" title="Stäng playout" aria-label="Stäng playout" onClick={onClose}>
            <Icon name="close" />
          </button>
        </div>
        <div class="panel-head-row">
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
        </div>
      </div>

      <div class="now">
        <div class={nowItem ? '' : 'now-empty'}>
          <div class="k">Ärende i bild</div>
          <div class="v now-value">
            <span>{nowItem ?? '–'}</span>
            {nowItem && (
              <button
                class="ib now-clear"
                type="button"
                title="Rensa ärende i bild"
                aria-label="Rensa ärende i bild"
                onClick={() => actions.clear('agendaItem')}
              >
                ✕
              </button>
            )}
          </div>
        </div>
        <div class={nowSpeaker ? '' : 'now-empty'}>
          <div class="k">Talare i bild</div>
          <div class="v now-value">
            <span>{nowSpeaker ?? '–'}</span>
            {nowSpeaker && (
              <button
                class="ib now-clear"
                type="button"
                title="Rensa talare i bild"
                aria-label="Rensa talare i bild"
                onClick={() => actions.clear('person')}
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
              Välj...
            </button>
          </h3>
          <div class="col-body">
            {!agenda ? (
              <p class="muted-empty">{p.agendaId ? 'Laddar…' : 'Ingen dagordning kopplad till projektet.'}</p>
            ) : (
              <EditableItemList
                items={agenda.items}
                getId={(it) => it.id}
                getLabel={(it) => it.title}
                numbered
                addLabel="Lägg till punkt"
                getItemClassName={(it) => (p.playout.currentAgendaItemId === it.id ? 'active' : '')}
                onReorder={reorderAgendaItems}
                onAdd={addAgendaItem}
                onRename={renameAgendaItem}
                onRemove={removeAgendaItem}
                renderExtra={(it) => {
                  const offset = lastPlayedOffset(it.id)
                  const done = offset != null
                  return (
                    <>
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
                    </>
                  )
                }}
              />
            )}
          </div>
        </div>

        <div class="col">
          <h3>
            Namnlista
            <button class="btn btn-sm" type="button" onClick={() => setPicking('namelist')}>
              Välj...
            </button>
          </h3>
          <div class="col-body">
            {!nameList ? (
              <p class="muted-empty">{p.namelistId ? 'Laddar…' : 'Ingen namnlista kopplad till projektet.'}</p>
            ) : (
              <EditableItemList
                items={nameList.people}
                getId={(person) => person.id}
                getLabel={(person) => person.name}
                addLabel="Lägg till namn"
                getItemClassName={(person) => (p.playout.currentPersonId === person.id ? 'active' : '')}
                onReorder={reorderPeople}
                onAdd={addPerson}
                onRename={renamePerson}
                onRemove={removePerson}
                renderExtra={(person) => (
                  <button
                    class="play"
                    type="button"
                    disabled={!canPlay}
                    title="Spela ut"
                    onClick={() => actions.cue('person', person.id, person.name)}
                  >
                    <PlayIcon />
                  </button>
                )}
              />
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
          createNewLabel="Ny dagordning"
          onCreateNew={() => void createAndAttachAgenda()}
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
          createNewLabel="Ny namnlista"
          onCreateNew={() => void createAndAttachNameList()}
        />
      )}
    </>
  )
}
