import { useEffect, useMemo, useRef, useState } from 'preact/hooks'
import { client } from '../../data'
import type { Agenda, AgendaItem, NameList, NameListPerson, Project } from '../../data/types'
import { useResource } from '../../app/useResource'
import { AttachedListPicker } from '../../components/AttachedListPicker'
import { EditableItemList } from '../../components/EditableItemList'
import { PdfAttachmentsModal } from '../../components/PdfAttachmentsModal'
import { Modal } from '../../components/Modal'
import { OverflowMenu } from '../../components/OverflowMenu'
import { Icon } from '../../components/Icon'
import { CheckIcon, PdfIcon, PlayIcon, StopIcon } from '../../components/icons'
import { formatHms } from '../../app/time'
import { errorMessage, runOptimistic } from '../../app/optimistic'
import { Toast } from '../../components/Toast'
import type { ProjectActions } from './actions'
import { useNameList } from './useNameList'
import { highlight, markedHit, matches, moveActive, queryTokens, shouldActivateSearch, type Hit } from './playoutSearchLogic'
import './PlayoutColumns.css'

interface PlayoutColumnsProps {
  project: Project
  actions: ProjectActions
  /** Läget Live: raden i bild markeras i rött (rött är reserverat för Live). */
  live?: boolean
  openPicker?: 'agenda' | 'namelist' | null
  onPickerClosed?: () => void
  /** Sökfält för båda listorna (UNG-130). Förvalt i läget Live. */
  searchable?: boolean
}

function Highlighted({ text, tokens }: { text: string; tokens: readonly string[] }) {
  return (
    <>
      {highlight(text, tokens).map((segment, index) => (segment.hit ? <mark key={index}>{segment.text}</mark> : segment.text))}
    </>
  )
}

// Dagordning och namnlista med utspelning. Portad från Playout (samma
// klientanrop och utspelningslogik) — Playouts egen kopia försvinner när
// den gamla vyn tas bort. Kopplingen görs i kolumnens rubrikrad; en
// okopplad kolumn visar ett tomt läge, inte ett fel.
export function PlayoutColumns({ project: p, actions, live = false, openPicker = null, onPickerClosed, searchable = live }: PlayoutColumnsProps) {
  const agendaResource = useResource(
    () => (p.agendaId ? client.agendas.get(p.agendaId) : Promise.resolve(undefined)),
    [p.agendaId],
  )
  const nameListResource = useNameList(p)
  const allAgendasResource = useResource(() => client.agendas.list(), [])
  const allNameListsResource = useResource(() => client.namelists.list(), [])

  // Lokal, muterbar kopia så att redigering här uppdaterar UI:t direkt.
  const [agenda, setAgenda] = useState<Agenda | null>(null)
  const [renameError, setRenameError] = useState<string | null>(null)
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

  // UNG-105: ändrat namn visas direkt; vid fel återställs det och en toast visar felet.
  function patchAgendaItemTitle(agendaId: string, itemId: string, title: string) {
    setAgenda((prev) => (prev && prev.id === agendaId ? { ...prev, items: prev.items.map((it) => (it.id === itemId ? { ...it, title } : it)) } : prev))
  }

  async function renameAgendaItem(itemId: string, title: string) {
    const current = agenda
    const previous = current?.items.find((it) => it.id === itemId)?.title
    if (!current || previous === undefined) return
    await runOptimistic({
      key: `agendaitem:${current.id}:${itemId}`,
      apply: () => {
        patchAgendaItemTitle(current.id, itemId, title)
        return () => patchAgendaItemTitle(current.id, itemId, previous)
      },
      request: () => client.agendas.updateItem(current.id, itemId, { title }),
      onSuccess: (updated) => setAgenda((prev) => (prev && prev.id === updated.id ? updated : prev)),
      onError: (err) => setRenameError(errorMessage(err, 'Kunde inte byta namn.')),
    })
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

  function patchPersonName(listId: string, personId: string, name: string) {
    setNameList((prev) => (prev && prev.id === listId ? { ...prev, people: prev.people.map((pe) => (pe.id === personId ? { ...pe, name } : pe)) } : prev))
  }

  async function renamePerson(personId: string, name: string) {
    const current = nameList
    const previous = current?.people.find((pe) => pe.id === personId)?.name
    if (!current || previous === undefined) return
    await runOptimistic({
      key: `person:${current.id}:${personId}`,
      apply: () => {
        patchPersonName(current.id, personId, name)
        return () => patchPersonName(current.id, personId, previous)
      },
      request: () => client.namelists.updatePerson(current.id, personId, { name }),
      onSuccess: (updated) => setNameList((prev) => (prev && prev.id === updated.id ? updated : prev)),
      onError: (err) => setRenameError(errorMessage(err, 'Kunde inte byta namn.')),
    })
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

  // ---- Sök (UNG-130) ----
  // Skriv-för-att-söka: `/` flyttar fokus till sökfältet (inget annat fångar tangenter), listorna filtreras utan att
  // ändra ordning, pilarna markerar en träff och Enter spelar bara ut en medvetet markerad rad.
  const searchRef = useRef<HTMLInputElement | null>(null)
  const [query, setQuery] = useState('')
  const [activeHit, setActiveHit] = useState(-1)
  const tokens = useMemo(() => queryTokens(query), [query])
  const searching = searchable && tokens.length > 0
  const agendaHits = useMemo(
    () => (searching ? (agenda?.items ?? []).filter((it) => matches(tokens, [it.title, it.reference])).map((it) => it.id) : []),
    [searching, tokens, agenda],
  )
  const nameHits = useMemo(
    () => (searching ? (nameList?.people ?? []).filter((pe) => matches(tokens, [pe.name, pe.party, pe.role])).map((pe) => pe.id) : []),
    [searching, tokens, nameList],
  )
  const hiddenAgenda = useMemo(
    () => (searching ? new Set((agenda?.items ?? []).map((it) => it.id).filter((id) => !agendaHits.includes(id))) : undefined),
    [searching, agenda, agendaHits],
  )
  const hiddenNames = useMemo(
    () => (searching ? new Set((nameList?.people ?? []).map((pe) => pe.id).filter((id) => !nameHits.includes(id))) : undefined),
    [searching, nameList, nameHits],
  )
  const hits: Hit[] = useMemo(
    () => [...agendaHits.map((id) => ({ list: 'agenda' as const, id })), ...nameHits.map((id) => ({ list: 'names' as const, id }))],
    [agendaHits, nameHits],
  )
  const marked = searching ? markedHit(hits, activeHit) : null
  const isMarked = (list: Hit['list'], id: string) => marked?.list === list && marked.id === id

  useEffect(() => {
    if (!searchable) return
    function onKeyDown(event: KeyboardEvent) {
      const target = event.target as HTMLElement | null
      const editable = Boolean(target?.isContentEditable) || ['INPUT', 'TEXTAREA', 'SELECT'].includes(target?.tagName ?? '')
      if (!shouldActivateSearch(event, editable, Boolean(document.querySelector('[role="dialog"]')))) return
      event.preventDefault()
      searchRef.current?.focus()
    }
    document.addEventListener('keydown', onKeyDown)
    return () => document.removeEventListener('keydown', onKeyDown)
  }, [searchable])

  useEffect(() => {
    if (marked) document.querySelector('.pcols li.search-hit')?.scrollIntoView({ block: 'nearest' })
  }, [marked?.list, marked?.id])

  function clearSearch() {
    setQuery('')
    setActiveHit(-1)
  }

  function playMarked() {
    if (!marked || !canPlay) return
    if (marked.list === 'agenda') {
      const item = agenda?.items.find((it) => it.id === marked.id)
      // En redan utspelad rad stoppas inte av Enter (det gör knappen); då händer ingenting.
      if (!item || p.playout.currentAgendaItemId === item.id) return
      actions.cue('agendaItem', item.id, item.title)
    } else {
      const person = nameList?.people.find((pe) => pe.id === marked.id)
      if (!person || p.playout.currentPersonId === person.id) return
      actions.cue('person', person.id, person.name)
    }
    clearSearch()
    searchRef.current?.blur()
  }

  function onSearchKeyDown(event: KeyboardEvent) {
    if (event.key === 'Escape') {
      // Esc rensar sökningen och lämnar fältet.
      clearSearch()
      searchRef.current?.blur()
    } else if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault()
      const current = marked ? hits.findIndex((hit) => hit.list === marked.list && hit.id === marked.id) : -1
      setActiveHit(moveActive(current, event.key === 'ArrowDown' ? 1 : -1, hits.length))
    } else if (event.key === 'Enter') {
      event.preventDefault()
      playMarked()
    }
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
      {searchable && (
        <div class="pcols-search">
          <Icon name="search" size={18} />
          <input
            ref={searchRef}
            class="pcols-search-input"
            type="text"
            role="searchbox"
            autoComplete="off"
            spellcheck={false}
            aria-label="Sök i dagordning och namnlista"
            placeholder="Sök punkt eller namn. Tryck / för att söka"
            value={query}
            onInput={(event) => {
              setQuery(event.currentTarget.value)
              setActiveHit(-1)
            }}
            onKeyDown={onSearchKeyDown}
          />
          {query && (
            <button class="pcols-search-clear" type="button" aria-label="Rensa sökningen" title="Rensa sökningen (Esc)" onClick={clearSearch}>
              <Icon name="close" size={16} />
            </button>
          )}
          <span class="pcols-search-count" role="status" aria-live="polite">
            {searching ? `Punkter ${agendaHits.length} · Namn ${nameHits.length}` : ''}
          </span>
        </div>
      )}
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
                hiddenIds={hiddenAgenda}
                renderLabel={searching ? (it) => <Highlighted text={it.title} tokens={tokens} /> : undefined}
                getItemClassName={(it) => [p.playout.currentAgendaItemId === it.id ? 'active' : '', isMarked('agenda', it.id) ? 'search-hit' : ''].filter(Boolean).join(' ')}
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
                            // Servern döljer namnet från förra punkten i samma anrop (UNG-112).
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
            {searching && agenda && agendaHits.length === 0 && <p class="pcol-empty">Inga träffar</p>}
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
                hiddenIds={hiddenNames}
                renderLabel={searching ? (person) => <Highlighted text={person.name} tokens={tokens} /> : undefined}
                getItemClassName={(person) => [p.playout.currentPersonId === person.id ? 'active' : '', isMarked('names', person.id) ? 'search-hit' : ''].filter(Boolean).join(' ')}
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
            {searching && nameList && nameHits.length === 0 && <p class="pcol-empty">Inga träffar</p>}
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
      {renameError && <Toast message={renameError} onDismiss={() => setRenameError(null)} />}
    </>
  )
}
