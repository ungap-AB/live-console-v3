import { useEffect, useRef, useState } from 'preact/hooks'
import { client } from '../../data'
import type { NameList, NameListPerson } from '../../data/types'
import { useResource } from '../../app/useResource'
import { SplitPane } from '../../components/SplitPane'
import { StatusChip } from '../../components/StatusChip'
import { SortableList } from '../../components/SortableList'
import { RenameModal } from '../../components/RenameModal'
import { ConfirmModal } from '../../components/ConfirmModal'
import { CheckIcon, DeleteIcon, EditIcon, CancelIcon, SearchIcon } from '../../components/icons'
import './NameListsView.css'

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString('sv-SE', { day: 'numeric', month: 'short', year: 'numeric' })
}

export function NameListsView() {
  const listsResource = useResource(() => client.namelists.list(), [])
  const [namelists, setNamelists] = useState<NameList[]>([])
  const [query, setQuery] = useState('')
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [personFilter, setPersonFilter] = useState('')
  const [editingPersonId, setEditingPersonId] = useState<string | null>(null)
  const [draftName, setDraftName] = useState('')
  const [renaming, setRenaming] = useState<NameList | null>(null)
  const [confirmTrash, setConfirmTrash] = useState<NameList | null>(null)
  const [confirmingPersonId, setConfirmingPersonId] = useState<string | null>(null)
  const confirmTimeoutRef = useRef<number | undefined>(undefined)

  useEffect(() => {
    if (listsResource.data) setNamelists(listsResource.data)
  }, [listsResource.data])

  useEffect(() => {
    if (!selectedId && namelists.length > 0) setSelectedId(namelists[0].id)
  }, [namelists, selectedId])

  // Listan är medvetet lätt (personCount, inga personer) — full detalj hämtas
  // separat när något väljs, se PLAN-live-server-v3.md Steg 2.
  const detailResource = useResource(
    () => (selectedId ? client.namelists.get(selectedId) : Promise.resolve(undefined)),
    [selectedId],
  )
  const [selected, setSelected] = useState<NameList | null>(null)

  useEffect(() => {
    setSelected(detailResource.data ?? null)
    setConfirmingPersonId(null)
  }, [detailResource.data])

  useEffect(() => () => window.clearTimeout(confirmTimeoutRef.current), [])

  const q = query.trim().toLowerCase()
  const visible = q
    ? namelists.filter((n) => (n.name + ' ' + n.description).toLowerCase().includes(q))
    : namelists

  const personQuery = personFilter.trim().toLowerCase()
  const visiblePeople = selected
    ? personQuery
      ? selected.people.filter((p) => p.name.toLowerCase().includes(personQuery))
      : selected.people
    : []
  const filterActive = personQuery.length > 0

  function replaceSelected(next: NameList) {
    setSelected(next)
    setNamelists((prev) =>
      prev.map((n) =>
        n.id === next.id
          ? { ...n, name: next.name, description: next.description, personCount: next.people.length, usedInProjects: next.usedInProjects, changedAt: next.changedAt }
          : n,
      ),
    )
  }

  async function createNameList() {
    const created = await client.namelists.create({ name: 'Ny namnlista', description: 'Utkast' })
    setNamelists((prev) => [created, ...prev])
    setSelectedId(created.id)
    setQuery('')
  }

  async function confirmRename(name: string) {
    if (!renaming) return
    const updated = await client.namelists.update(renaming.id, { name })
    replaceSelected(updated)
    setRenaming(null)
  }

  async function duplicate(list: NameList) {
    const copy = await client.namelists.duplicate(list.id)
    setNamelists((prev) => {
      const idx = prev.findIndex((n) => n.id === list.id)
      return [...prev.slice(0, idx + 1), copy, ...prev.slice(idx + 1)]
    })
    setSelectedId(copy.id)
  }

  async function trash(list: NameList) {
    await client.namelists.trash(list.id)
    setNamelists((prev) => prev.filter((n) => n.id !== list.id))
    setSelectedId(null)
    setConfirmTrash(null)
  }

  async function addPerson(list: NameList) {
    const updated = await client.namelists.addPerson(list.id, { name: 'Ny person' })
    replaceSelected(updated)
    const added = updated.people[updated.people.length - 1]
    setEditingPersonId(added.id)
    setDraftName(added.name)
  }

  function startEdit(person: NameListPerson) {
    setEditingPersonId(person.id)
    setDraftName(person.name)
  }

  async function saveEdit(list: NameList, personId: string) {
    if (!draftName.trim()) return
    const updated = await client.namelists.updatePerson(list.id, personId, { name: draftName.trim() })
    replaceSelected(updated)
    setEditingPersonId(null)
  }

  async function removePerson(list: NameList, personId: string) {
    const updated = await client.namelists.removePerson(list.id, personId)
    replaceSelected(updated)
    if (editingPersonId === personId) setEditingPersonId(null)
  }

  function requestRemovePerson(personId: string) {
    window.clearTimeout(confirmTimeoutRef.current)
    setConfirmingPersonId(personId)
    confirmTimeoutRef.current = window.setTimeout(() => setConfirmingPersonId(null), 4000)
  }

  async function confirmRemovePerson(list: NameList, personId: string) {
    window.clearTimeout(confirmTimeoutRef.current)
    setConfirmingPersonId(null)
    await removePerson(list, personId)
  }

  async function reorder(list: NameList, nextPeople: NameListPerson[]) {
    const renumbered = nextPeople.map((p, i) => ({ ...p, position: i + 1 }))
    const updated = await client.namelists.replacePeople(list.id, renumbered)
    replaceSelected(updated)
  }

  async function sortAZ(list: NameList) {
    const sorted = [...list.people]
      .sort((a, b) => a.name.localeCompare(b.name, 'sv'))
      .map((p, i) => ({ ...p, position: i + 1 }))
    const updated = await client.namelists.replacePeople(list.id, sorted)
    replaceSelected(updated)
  }

  return (
    <div class="view">
      <header>
        <div>
          <h1>Namnlistor</h1>
          <div class="sub">Mallar som kan läggas in i projekt</div>
        </div>
      </header>

      <div class="content">
        <SplitPane
          listLabel="Namnlistor"
          detailLabel="Vald namnlista"
          list={
            <>
              <div class="top">
                <div class="search">
                  <SearchIcon />
                  <input
                    type="search"
                    placeholder="Sök namnlista"
                    aria-label="Sök namnlista"
                    value={query}
                    onInput={(e) => setQuery(e.currentTarget.value)}
                  />
                </div>
                <button class="btn btn-sm" type="button" onClick={createNameList}>
                  Ny
                </button>
              </div>
              <ul>
                {listsResource.loading && namelists.length === 0 && <li class="none">Laddar…</li>}
                {!listsResource.loading && visible.length === 0 && (
                  <li class="none">Ingen namnlista matchar sökningen.</li>
                )}
                {visible.map((n) => (
                  <li key={n.id} class={n.id === selectedId ? 'sel' : ''}>
                    <button
                      type="button"
                      onClick={() => {
                        setSelectedId(n.id)
                        setPersonFilter('')
                      }}
                    >
                      <span class="nm">
                        {n.usedInProjects > 0 && <StatusChip tone="accent" dot />}
                        {n.name}
                      </span>
                      <span class="meta">
                        {n.personCount} namn · ändrad {formatDate(n.changedAt)}
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            </>
          }
          detail={
            !selectedId ? (
              <div class="docnone">Välj en namnlista i listan.</div>
            ) : !selected ? (
              <div class="docnone">Laddar…</div>
            ) : (
              <>
                <div class="head">
                  <h2>{selected.name}</h2>
                  <div class="facts">
                    <span>{selected.description}</span>
                    <span>{selected.people.length} namn</span>
                    <span>Ändrad {formatDate(selected.changedAt)}</span>
                  </div>
                  <div class="tools">
                    <button class="btn btn-sm" type="button" onClick={() => setRenaming(selected)}>
                      Redigera
                    </button>
                    <button class="btn btn-sm" type="button" onClick={() => duplicate(selected)}>
                      Duplicera
                    </button>
                    <span class="spacer" />
                    <button
                      class="btn btn-sm btn-danger"
                      type="button"
                      onClick={() =>
                        selected.usedInProjects > 0 ? setConfirmTrash(selected) : trash(selected)
                      }
                    >
                      Flytta till papperskorgen
                    </button>
                  </div>
                </div>
                <div class="body">
                  <div class="person-toolbar">
                    <div class="search">
                      <SearchIcon />
                      <input
                        type="search"
                        placeholder="Filtrera namn"
                        aria-label="Filtrera namn"
                        value={personFilter}
                        onInput={(e) => setPersonFilter(e.currentTarget.value)}
                      />
                    </div>
                    <button class="btn btn-sm" type="button" onClick={() => sortAZ(selected)}>
                      Sortera A–Ö
                    </button>
                  </div>

                  {filterActive && visiblePeople.length === 0 && (
                    <p class="hint">Inget namn matchar filtret.</p>
                  )}

                  <SortableList
                    items={visiblePeople}
                    getId={(p) => p.id}
                    disabled={filterActive}
                    onReorder={(next) => reorder(selected, next)}
                    renderItem={(p) =>
                      editingPersonId === p.id ? (
                        <>
                          <span class="txt">
                            <input
                              value={draftName}
                              placeholder="Namn"
                              aria-label="Namn"
                              autoFocus
                              onInput={(e) => setDraftName(e.currentTarget.value)}
                              onKeyDown={(e) => {
                                if (e.key === 'Enter') saveEdit(selected, p.id)
                                if (e.key === 'Escape') setEditingPersonId(null)
                              }}
                            />
                          </span>
                          <span class="rowbtns">
                            <button
                              class="ib"
                              type="button"
                              title="Spara"
                              aria-label="Spara"
                              onClick={() => saveEdit(selected, p.id)}
                            >
                              <CheckIcon />
                            </button>
                            <button
                              class="ib"
                              type="button"
                              title="Avbryt"
                              aria-label="Avbryt"
                              onClick={() => setEditingPersonId(null)}
                            >
                              <CancelIcon />
                            </button>
                          </span>
                        </>
                      ) : (
                        <>
                          <span class="txt">
                            <b>{p.name}</b>
                          </span>
                          <span class="rowbtns">
                            <button
                              class="ib"
                              type="button"
                              title="Redigera"
                              aria-label="Redigera"
                              onClick={() => startEdit(p)}
                            >
                              <EditIcon />
                            </button>
                            {confirmingPersonId === p.id ? (
                              <button
                                class="ib del confirm"
                                type="button"
                                title="Bekräfta borttagning"
                                aria-label="Bekräfta borttagning"
                                onClick={() => confirmRemovePerson(selected, p.id)}
                              >
                                <CheckIcon />
                              </button>
                            ) : (
                              <button
                                class="ib del"
                                type="button"
                                title="Ta bort"
                                aria-label="Ta bort"
                                onClick={() => requestRemovePerson(p.id)}
                              >
                                <DeleteIcon />
                              </button>
                            )}
                          </span>
                        </>
                      )
                    }
                  />
                  <div class="addrow">
                    <button class="btn btn-sm" type="button" onClick={() => addPerson(selected)}>
                      Lägg till namn
                    </button>
                  </div>
                  {selected.usedInProjects > 0 && (
                    <p class="hint">
                      Ändringar slår igenom i projekt som ännu inte publicerats. Publicerade sändningar
                      har en fryst kopia och påverkas inte.
                    </p>
                  )}
                </div>
              </>
            )
          }
        />
      </div>

      {renaming && (
        <RenameModal
          initialValue={renaming.name}
          onCancel={() => setRenaming(null)}
          onSave={confirmRename}
        />
      )}

      {confirmTrash && (
        <ConfirmModal
          title="Flytta till papperskorgen?"
          confirmLabel="Flytta till papperskorgen"
          danger
          onCancel={() => setConfirmTrash(null)}
          onConfirm={() => trash(confirmTrash)}
        >
          <p>
            {confirmTrash.name} används i {confirmTrash.usedInProjects} projekt. Flytta till
            papperskorgen ändå?
          </p>
        </ConfirmModal>
      )}
    </div>
  )
}
