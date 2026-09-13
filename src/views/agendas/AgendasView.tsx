import { useEffect, useState } from 'preact/hooks'
import { client } from '../../data'
import type { Agenda, AgendaItem } from '../../data/types'
import { useResource } from '../../app/useResource'
import { SplitPane } from '../../components/SplitPane'
import { StatusChip } from '../../components/StatusChip'
import { SortableList } from '../../components/SortableList'
import { RenameModal } from '../../components/RenameModal'
import { ConfirmModal } from '../../components/ConfirmModal'
import { CheckIcon, DeleteIcon, EditIcon, CancelIcon, SearchIcon } from '../../components/icons'

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString('sv-SE', { day: 'numeric', month: 'short', year: 'numeric' })
}

export function AgendasView() {
  const agendasResource = useResource(() => client.agendas.list(), [])
  const [agendas, setAgendas] = useState<Agenda[]>([])
  const [query, setQuery] = useState('')
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [editingItemId, setEditingItemId] = useState<string | null>(null)
  const [draft, setDraft] = useState({ title: '', reference: '' })
  const [renaming, setRenaming] = useState<Agenda | null>(null)
  const [confirmTrash, setConfirmTrash] = useState<Agenda | null>(null)

  useEffect(() => {
    if (agendasResource.data) setAgendas(agendasResource.data)
  }, [agendasResource.data])

  useEffect(() => {
    if (!selectedId && agendas.length > 0) setSelectedId(agendas[0].id)
  }, [agendas, selectedId])

  // Listan är medvetet lätt (itemCount, inga punkter) — full detalj hämtas
  // separat när något väljs, se PLAN-live-server-v3.md Steg 2.
  const detailResource = useResource(
    () => (selectedId ? client.agendas.get(selectedId) : Promise.resolve(undefined)),
    [selectedId],
  )
  const [selected, setSelected] = useState<Agenda | null>(null)

  useEffect(() => {
    setSelected(detailResource.data ?? null)
  }, [detailResource.data])

  const q = query.trim().toLowerCase()
  const visible = q
    ? agendas.filter((a) => (a.name + ' ' + a.description).toLowerCase().includes(q))
    : agendas

  function replaceSelected(next: Agenda) {
    setSelected(next)
    setAgendas((prev) =>
      prev.map((a) =>
        a.id === next.id
          ? { ...a, name: next.name, description: next.description, itemCount: next.items.length, usedInProjects: next.usedInProjects, changedAt: next.changedAt }
          : a,
      ),
    )
  }

  async function createAgenda() {
    const created = await client.agendas.create({ name: 'Ny dagordning', description: 'Utkast' })
    setAgendas((prev) => [created, ...prev])
    setSelectedId(created.id)
    setQuery('')
  }

  async function confirmRename(name: string) {
    if (!renaming) return
    const updated = await client.agendas.update(renaming.id, { name })
    replaceSelected(updated)
    setRenaming(null)
  }

  async function duplicate(agenda: Agenda) {
    const copy = await client.agendas.duplicate(agenda.id)
    setAgendas((prev) => {
      const idx = prev.findIndex((a) => a.id === agenda.id)
      return [...prev.slice(0, idx + 1), copy, ...prev.slice(idx + 1)]
    })
    setSelectedId(copy.id)
  }

  async function trash(agenda: Agenda) {
    await client.agendas.trash(agenda.id)
    setAgendas((prev) => prev.filter((a) => a.id !== agenda.id))
    setSelectedId(null)
    setConfirmTrash(null)
  }

  async function addItem(agenda: Agenda) {
    const updated = await client.agendas.addItem(agenda.id, { title: 'Ny punkt' })
    replaceSelected(updated)
    const added = updated.items[updated.items.length - 1]
    setEditingItemId(added.id)
    setDraft({ title: added.title, reference: added.reference ?? '' })
  }

  function startEdit(item: AgendaItem) {
    setEditingItemId(item.id)
    setDraft({ title: item.title, reference: item.reference ?? '' })
  }

  async function saveEdit(agenda: Agenda, itemId: string) {
    if (!draft.title.trim()) return
    const updated = await client.agendas.updateItem(agenda.id, itemId, {
      title: draft.title.trim(),
      reference: draft.reference.trim() || undefined,
    })
    replaceSelected(updated)
    setEditingItemId(null)
  }

  async function removeItem(agenda: Agenda, itemId: string) {
    const updated = await client.agendas.removeItem(agenda.id, itemId)
    replaceSelected(updated)
    if (editingItemId === itemId) setEditingItemId(null)
  }

  async function reorder(agenda: Agenda, nextItems: AgendaItem[]) {
    const renumbered = nextItems.map((it, i) => ({ ...it, position: i + 1 }))
    const updated = await client.agendas.replaceItems(agenda.id, renumbered)
    replaceSelected(updated)
  }

  return (
    <div class="view">
      <header>
        <div>
          <h1>Dagordningar</h1>
          <div class="sub">Mallar som kan läggas in i projekt</div>
        </div>
      </header>

      <div class="content">
        <SplitPane
          listLabel="Dagordningar"
          detailLabel="Vald dagordning"
          list={
            <>
              <div class="top">
                <div class="search">
                  <SearchIcon />
                  <input
                    type="search"
                    placeholder="Sök dagordning"
                    aria-label="Sök dagordning"
                    value={query}
                    onInput={(e) => setQuery(e.currentTarget.value)}
                  />
                </div>
                <button class="btn btn-sm" type="button" onClick={createAgenda}>
                  Ny
                </button>
              </div>
              <ul>
                {agendasResource.loading && agendas.length === 0 && <li class="none">Laddar…</li>}
                {!agendasResource.loading && visible.length === 0 && (
                  <li class="none">Ingen dagordning matchar sökningen.</li>
                )}
                {visible.map((a) => (
                  <li key={a.id} class={a.id === selectedId ? 'sel' : ''}>
                    <button type="button" onClick={() => setSelectedId(a.id)}>
                      <span class="nm">
                        {a.usedInProjects > 0 && <StatusChip tone="accent" dot />}
                        {a.name}
                      </span>
                      <span class="meta">
                        {a.itemCount} punkter · ändrad {formatDate(a.changedAt)}
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            </>
          }
          detail={
            !selectedId ? (
              <div class="docnone">Välj en dagordning i listan.</div>
            ) : !selected ? (
              <div class="docnone">Laddar…</div>
            ) : (
              <>
                <div class="head">
                  <h2>{selected.name}</h2>
                  <div class="facts">
                    <span>{selected.description}</span>
                    <span>{selected.items.length} punkter</span>
                    <span>Ändrad {formatDate(selected.changedAt)}</span>
                    {selected.usedInProjects > 0 ? (
                      <StatusChip tone="accent">Används i {selected.usedInProjects} projekt</StatusChip>
                    ) : (
                      <StatusChip tone="neutral">Används inte</StatusChip>
                    )}
                  </div>
                  <div class="tools">
                    <button class="btn btn-sm" type="button" onClick={() => setRenaming(selected)}>
                      Byt namn
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
                  <SortableList
                    items={selected.items}
                    getId={(it) => it.id}
                    onReorder={(next) => reorder(selected, next)}
                    renderItem={(it, i) =>
                      editingItemId === it.id ? (
                        <>
                          <span class="no">{i + 1}</span>
                          <span class="txt">
                            <input
                              value={draft.title}
                              placeholder="Rubrik"
                              aria-label="Rubrik"
                              autoFocus
                              onInput={(e) => setDraft((d) => ({ ...d, title: e.currentTarget.value }))}
                              onKeyDown={(e) => {
                                if (e.key === 'Enter') saveEdit(selected, it.id)
                                if (e.key === 'Escape') setEditingItemId(null)
                              }}
                            />
                            <input
                              class="ref"
                              value={draft.reference}
                              placeholder="Ärendenummer (valfritt)"
                              aria-label="Ärendenummer"
                              onInput={(e) => setDraft((d) => ({ ...d, reference: e.currentTarget.value }))}
                              onKeyDown={(e) => {
                                if (e.key === 'Enter') saveEdit(selected, it.id)
                                if (e.key === 'Escape') setEditingItemId(null)
                              }}
                            />
                          </span>
                          <span class="rowbtns">
                            <button
                              class="ib"
                              type="button"
                              title="Spara"
                              aria-label="Spara"
                              onClick={() => saveEdit(selected, it.id)}
                            >
                              <CheckIcon />
                            </button>
                            <button
                              class="ib"
                              type="button"
                              title="Avbryt"
                              aria-label="Avbryt"
                              onClick={() => setEditingItemId(null)}
                            >
                              <CancelIcon />
                            </button>
                          </span>
                        </>
                      ) : (
                        <>
                          <span class="no">{i + 1}</span>
                          <span class="txt">
                            <b>{it.title}</b>
                            {it.reference && <em>{it.reference}</em>}
                          </span>
                          <span class="rowbtns">
                            <button
                              class="ib"
                              type="button"
                              title="Redigera"
                              aria-label="Redigera"
                              onClick={() => startEdit(it)}
                            >
                              <EditIcon />
                            </button>
                            <button
                              class="ib del"
                              type="button"
                              title="Ta bort"
                              aria-label="Ta bort"
                              onClick={() => removeItem(selected, it.id)}
                            >
                              <DeleteIcon />
                            </button>
                          </span>
                        </>
                      )
                    }
                  />
                  <div class="addrow">
                    <button class="btn btn-sm" type="button" onClick={() => addItem(selected)}>
                      Lägg till punkt
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
