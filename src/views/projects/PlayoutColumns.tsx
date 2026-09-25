import { useEffect, useState } from 'preact/hooks'
import { client } from '../../data'
import type { Agenda, AgendaItem, NameList, NameListPerson, Project } from '../../data/types'
import { useResource } from '../../app/useResource'
import { AttachedListPicker } from '../../components/AttachedListPicker'
import { EditableItemList } from '../../components/EditableItemList'
import { PdfAttachmentsModal } from '../../components/PdfAttachmentsModal'
import { Modal } from '../../components/Modal'
import { OverflowMenu } from '../../components/OverflowMenu'
import { CheckIcon, PdfIcon, PlayIcon, StopIcon } from '../../components/icons'
import { formatHms } from '../../app/time'
import type { ProjectActions } from './actions'
import './PlayoutColumns.css'

interface PlayoutColumnsProps {
  project: Project
  actions: ProjectActions
  /** Läget Live: raden i bild markeras i rött (rött är reserverat för Live). */
  live?: boolean
  openPicker?: 'agenda' | 'namelist' | null
  onPickerClosed?: () => void
}

// Dagordning och namnlista med utspelning. Portad från Playout (samma
// klientanrop och utspelningslogik) — Playouts egen kopia försvinner när
// den gamla vyn tas bort. Kopplingen görs i kolumnens rubrikrad; en
// okopplad kolumn visar ett tomt läge, inte ett fel.
export function PlayoutColumns({ project: p, actions, live = false, openPicker = null, onPickerClosed }: PlayoutColumnsProps) {
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

  // Lokal, muterbar kopia så att redigering här uppdaterar UI:t direkt.
  const [agenda, setAgenda] = useState<Agenda | null>(null)
  const [nameList, setNameList] = useState<NameList | null>(null)
  useEffect(() => setAgenda(agendaResource.data ?? null), [agendaResource.data])
  useEffect(() => setNameList(nameListResource.data ?? null), [nameListResource.data])

  const [importKind, setImportKind] = useState<'agenda' | 'namelist' | null>(null)
  const [importText, setImportText] = useState('')
  const [importError, setImportError] = useState<string | null>(null)
  const [personSort, setPersonSort] = useState<'name' | 'playCount'>('name')
  const [pdfItem, setPdfItem] = useState<AgendaItem | null>(null)

  // Utspelning ska fungera även offline — mötet måste dokumenteras trots
  // enkoderstrul. Bara en publicerad (fryst) tidslinje är låst.
  const canPlay = p.publication.state !== 'published'

  function lastPlayedOffset(itemId: string): number | null {
    const events = p.playout.timeline.filter((e) => e.kind === 'agendaItem' && e.refId === itemId)
    if (events.length === 0) return null
    return events[events.length - 1].offsetSeconds
  }

  function speakerPlayCount(personId: string): number {
    return p.playout.timeline.filter((event) => event.kind === 'person' && event.refId === personId).length
  }

  async function addAgendaItem(): Promise<string> {
    const updated = await client.agendas.addItem(agenda!.id, { title: 'Ny punkt' })
    setAgenda(updated)
    return updated.items[updated.items.length - 1].id
  }

  async function renameAgendaItem(itemId: string, title: string) {
    setAgenda(await client.agendas.updateItem(agenda!.id, itemId, { title }))
  }

  async function removeAgendaItem(itemId: string) {
    setAgenda(await client.agendas.removeItem(agenda!.id, itemId))
  }

  async function reorderAgendaItems(nextItems: Agenda['items']) {
    const renumbered = nextItems.map((it, i) => ({ ...it, position: i + 1 }))
    setAgenda(await client.agendas.replaceItems(agenda!.id, renumbered))
  }

  async function addPerson(): Promise<string> {
    const updated = await client.namelists.addPerson(nameList!.id, { name: 'Ny person' })
    setNameList(updated)
    return updated.people[updated.people.length - 1].id
  }

  async function renamePerson(personId: string, name: string) {
    setNameList(await client.namelists.updatePerson(nameList!.id, personId, { name }))
  }

  async function removePerson(personId: string) {
    setNameList(await client.namelists.removePerson(nameList!.id, personId))
  }

  async function reorderPeople(nextPeople: NameList['people']) {
    const renumbered = nextPeople.map((pe, i) => ({ ...pe, position: i + 1 }))
    setNameList(await client.namelists.replacePeople(nameList!.id, renumbered))
  }

  async function changePersonSort(value: 'name' | 'playCount') {
    setPersonSort(value)
    if (!nameList) return
    const sorted = [...nameList.people].sort((left, right) => {
      if (value === 'playCount') {
        const countDifference = speakerPlayCount(right.id) - speakerPlayCount(left.id)
        if (countDifference) return countDifference
      }
      return left.name.localeCompare(right.name, 'sv')
    })
    await reorderPeople(sorted)
  }

  async function createAndAttachAgenda() {
    const created = await client.agendas.create({ name: p.name, description: 'Utkast' })
    await actions.setAgenda(created.id)
    allAgendasResource.reload()
  }

  async function createAndAttachNameList() {
    const created = await client.namelists.create({ name: p.name, description: 'Utkast' })
    actions.setNameList(created.id)
    allNameListsResource.reload()
  }

  function openImport(kind: 'agenda' | 'namelist') {
    setImportKind(kind)
    setImportText('')
    setImportError(null)
  }

  function parseImport(text: string): string[] {
    return text.replace(/\r\n?/g, '\n').split('\n').map((line) => line.trim()).filter(Boolean)
  }

  async function importAgenda(text: string) {
    let working = agenda
    if (!working) {
      working = await client.agendas.create({ name: p.name, description: 'Utkast' })
      await actions.setAgenda(working.id)
      allAgendasResource.reload()
    }
    const titles = parseImport(text)
    const items: AgendaItem[] = []
    for (let index = 0; index < titles.length; index += 1) {
      const title = titles[index]
      const existing = working.items[index]
      if (existing) items.push({ ...existing, position: index + 1, title, reference: undefined })
      else {
        working = await client.agendas.addItem(working.id, { title })
        const added = working.items[working.items.length - 1]
        items.push({ ...added, position: index + 1, title, reference: undefined })
      }
    }
    setAgenda(await client.agendas.replaceItems(working.id, items))
  }

  async function importNameList(text: string) {
    let working = nameList
    if (!working) {
      working = await client.namelists.create({ name: p.name, description: 'Utkast' })
      await actions.setNameList(working.id)
      allNameListsResource.reload()
    }
    const names = parseImport(text)
    const existingPeople = working.people.slice()
    const imported: NameListPerson[] = []
    for (const name of names) {
      working = await client.namelists.addPerson(working.id, { name })
      imported.push(working.people[working.people.length - 1])
    }
    setNameList(
      await client.namelists.replacePeople(
        working.id,
        [...existingPeople, ...imported].map((person, index) => ({ ...person, position: index + 1 })),
      ),
    )
  }

  async function submitImport() {
    const values = parseImport(importText)
    if (values.length === 0) {
      setImportError(importKind === 'agenda' ? 'Klistra in minst en punkt, en punkt per rad.' : 'Klistra in minst ett namn, ett namn per rad.')
      return
    }
    if (importKind === 'agenda') await importAgenda(importText)
    if (importKind === 'namelist') await importNameList(importText)
    setImportKind(null)
  }

  return (
    <>
      <div class={`pcols${live ? ' is-live' : ''}`}>
        <section class="pcol">
          <div class="pcol-head">
            <h2>Dagordning</h2>
            <span class="pcol-sub">{agenda?.name ?? ''}</span>
            <AttachedListPicker
              currentId={p.agendaId}
              items={(allAgendasResource.data ?? []).map((a) => ({ id: a.id, name: a.name }))}
              pickerTitle={p.agendaId ? 'Byt dagordning' : 'Koppla dagordning'}
              createNewLabel="Ny dagordning"
              onPick={(id) => {
                void actions.setAgenda(id)
                onPickerClosed?.()
              }}
              onCreateNew={async () => {
                await createAndAttachAgenda()
                onPickerClosed?.()
              }}
              buttonLabel={p.agendaId ? 'Byt' : 'Koppla dagordning…'}
              buttonClassName="btn btn-sm btn-ghost"
              open={openPicker === 'agenda'}
              onClose={onPickerClosed}
            />
            <OverflowMenu
              label="Dagordningsalternativ"
              items={[
                { label: 'Lägg till punkt', disabled: !agenda, onClick: async () => void (await addAgendaItem()) },
                { label: 'Importera...', onClick: () => openImport('agenda') },
              ]}
            />
          </div>
          <div class="pcol-body">
            {!agenda ? (
              <p class="pcol-empty">{p.agendaId ? 'Laddar…' : 'Ingen dagordning kopplad. Koppla en för att kunna spela ut ärenden.'}</p>
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
                compactInteractions
                hideAddButton
                renderExtra={(it) => {
                  const offset = lastPlayedOffset(it.id)
                  const active = p.playout.currentAgendaItemId === it.id
                  return (
                    <>
                      <button
                        class="ib pdf-row-action"
                        type="button"
                        title={`PDF-dokument${it.attachments?.length ? ` (${it.attachments.length})` : ''}`}
                        aria-label={`Öppna PDF-dokument för ${it.title}`}
                        onClick={() => setPdfItem(it)}
                      >
                        <PdfIcon />
                        <span class="pdf-count" aria-hidden="true">{it.attachments?.length ?? 0}</span>
                      </button>
                      {offset != null && <span class="time" title="Position i inspelningen">{formatHms(offset)}</span>}
                      <button
                        class="play"
                        type="button"
                        disabled={!canPlay}
                        title={active ? 'Rensa punkt i bild' : 'Spela ut'}
                        aria-label={active ? `Rensa ${it.title} i bild` : `Spela ut ${it.title}`}
                        onClick={() => {
                          if (active) {
                            actions.clear('agendaItem')
                          }
                          else {
                            actions.clear('person')
                            actions.cue('agendaItem', it.id, it.title)
                          }
                        }}
                      >
                        {active ? <StopIcon /> : offset != null ? <CheckIcon /> : <PlayIcon />}
                      </button>
                    </>
                  )
                }}
              />
            )}
          </div>
        </section>

        <section class="pcol">
          <div class="pcol-head">
            <h2>Namnlista</h2>
            <span class="pcol-sub">{nameList?.name ?? ''}</span>
            {nameList && (
              <select
                class="sort-select"
                aria-label="Sortera namnlista"
                value={personSort}
                onChange={(event) => void changePersonSort(event.currentTarget.value as 'name' | 'playCount')}
              >
                <option value="name">Namn A–Ö</option>
                <option value="playCount">Mest utspelade</option>
              </select>
            )}
            <AttachedListPicker
              currentId={p.namelistId}
              items={(allNameListsResource.data ?? []).map((n) => ({ id: n.id, name: n.name }))}
              pickerTitle={p.namelistId ? 'Byt namnlista' : 'Koppla namnlista'}
              createNewLabel="Ny namnlista"
              onPick={(id) => {
                actions.setNameList(id)
                onPickerClosed?.()
              }}
              onCreateNew={() => {
                createAndAttachNameList()
                onPickerClosed?.()
              }}
              buttonLabel={p.namelistId ? 'Byt' : 'Koppla namnlista…'}
              buttonClassName="btn btn-sm btn-ghost"
              open={openPicker === 'namelist'}
              onClose={onPickerClosed}
            />
            <OverflowMenu
              label="Namnlistealternativ"
              items={[
                { label: 'Lägg till namn', disabled: !nameList, onClick: async () => void (await addPerson()) },
                { label: 'Importera...', onClick: () => openImport('namelist') },
              ]}
            />
          </div>
          <div class="pcol-body">
            {!nameList ? (
              <p class="pcol-empty">
                {p.namelistId
                  ? 'Laddar…'
                  : p.meetingBindingId
                    ? 'Talare spelas ut direkt från Meeting.'
                    : 'Ingen namnlista kopplad. Koppla en för att kunna spela ut talare.'}
              </p>
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
                compactInteractions
                hideAddButton
                renderExtra={(person) => {
                  const active = p.playout.currentPersonId === person.id
                  return (
                    <>
                      <span class="play-count" title={`${speakerPlayCount(person.id)} utspelningar`}>
                        {speakerPlayCount(person.id)}
                      </span>
                      <button
                        class="play"
                        type="button"
                        disabled={!canPlay}
                        title={active ? 'Rensa namn i bild' : 'Spela ut'}
                        aria-label={active ? `Rensa ${person.name} i bild` : `Spela ut ${person.name}`}
                        onClick={() => (active ? actions.clear('person') : actions.cue('person', person.id, person.name))}
                      >
                        {active ? <StopIcon /> : <PlayIcon />}
                      </button>
                    </>
                  )
                }}
              />
            )}
          </div>
        </section>
      </div>

      {pdfItem && agenda && (
        <PdfAttachmentsModal
          agenda={agenda}
          item={pdfItem}
          onChanged={(next) => {
            setAgenda(next)
            setPdfItem(next.items.find((item) => item.id === pdfItem.id) ?? null)
          }}
          onClose={() => setPdfItem(null)}
        />
      )}

      {importKind && (
        <Modal
          title={importKind === 'agenda' ? 'Importera dagordning' : 'Importera namn'}
          subtitle={importKind === 'agenda' ? 'En punkt per rad. Befintliga punkter ersätts.' : 'Ett namn per rad. Nya namn läggs till efter befintliga.'}
          onClose={() => setImportKind(null)}
          footer={
            <>
              <button class="btn btn-sm" type="button" onClick={() => setImportKind(null)}>Avbryt</button>
              <button class="btn btn-sm primary" type="button" onClick={() => void submitImport()}>Importera</button>
            </>
          }
        >
          <textarea
            class="playout-import-textarea"
            rows={12}
            value={importText}
            placeholder={importKind === 'agenda' ? 'Kommunfullmäktiges sammanträde\nVal av justerare\nFrågor' : 'Anna Andersson\nBo Berg\nCecilia Carlsson'}
            onInput={(event) => {
              setImportText(event.currentTarget.value)
              setImportError(null)
            }}
            autofocus
          />
          {importError && <p class="form-error">{importError}</p>}
        </Modal>
      )}
    </>
  )
}
