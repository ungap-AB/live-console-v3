import { useEffect, useState } from 'preact/hooks'
import { client } from '../../data'
import type { Agenda, AgendaItem, Project } from '../../data/types'
import { useResource } from '../../app/useResource'
import { SplitPane } from '../../components/SplitPane'
import { StatusChip } from '../../components/StatusChip'
import { EditableItemList } from '../../components/EditableItemList'
import { RenameModal } from '../../components/RenameModal'
import { ConfirmModal } from '../../components/ConfirmModal'
import { SearchIcon, PlusIcon } from '../../components/icons'
import './AgendasView.css'

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString('sv-SE', { day: 'numeric', month: 'short', year: 'numeric' })
}

interface AgendasViewProps {
  onOpenProject: (id: string) => void
  /** Sätts av App.tsx när man kommer hit via "Öppna..." i ProjektDetail — konsumeras en gång vid montering (vyn avmonteras/monteras om varje gång man navigerar hit, se App.tsx). */
  initialSelectedId?: string | null
  onInitialSelectionConsumed?: () => void
}

export function AgendasView({ onOpenProject, initialSelectedId, onInitialSelectionConsumed }: AgendasViewProps) {
  const agendasResource = useResource(() => client.agendas.list(), [])
  const [agendas, setAgendas] = useState<Agenda[]>([])
  const [query, setQuery] = useState('')
  const [selectedId, setSelectedId] = useState<string | null>(initialSelectedId ?? null)

  useEffect(() => {
    if (initialSelectedId) onInitialSelectionConsumed?.()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])
  const [renaming, setRenaming] = useState<Agenda | null>(null)
  const [confirmTrash, setConfirmTrash] = useState<Agenda | null>(null)
  const [usedByOpen, setUsedByOpen] = useState(false)

  const projectsResource = useResource(() => client.projects.list(), [])
  const projects: Project[] = projectsResource.data ?? []

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
    setUsedByOpen(false)
  }, [detailResource.data])

  const q = query.trim().toLowerCase()
  const filtered = q
    ? agendas.filter((a) => (a.name + ' ' + a.description).toLowerCase().includes(q))
    : agendas
  const visible = filtered.filter((a) => !a.isTemplate)
  const templates = filtered.filter((a) => a.isTemplate)

  const usedBy = selected ? projects.filter((p) => p.agendaId === selected.id) : []

  function replaceSelected(next: Agenda) {
    setSelected(next)
    setAgendas((prev) =>
      prev.map((a) =>
        a.id === next.id
          ? {
              ...a,
              name: next.name,
              description: next.description,
              itemCount: next.items.length,
              usedInProjects: next.usedInProjects,
              changedAt: next.changedAt,
              isTemplate: next.isTemplate,
            }
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

  async function toggleTemplate(agenda: Agenda) {
    const updated = await client.agendas.setTemplate(agenda.id, !agenda.isTemplate)
    replaceSelected(updated)
  }

  async function trash(agenda: Agenda) {
    await client.agendas.trash(agenda.id)
    setAgendas((prev) => prev.filter((a) => a.id !== agenda.id))
    setSelectedId(null)
    setConfirmTrash(null)
  }

  async function addItem(agenda: Agenda): Promise<string> {
    const updated = await client.agendas.addItem(agenda.id, { title: 'Ny punkt' })
    replaceSelected(updated)
    return updated.items[updated.items.length - 1].id
  }

  async function renameItem(agenda: Agenda, itemId: string, title: string) {
    const updated = await client.agendas.updateItem(agenda.id, itemId, { title })
    replaceSelected(updated)
  }

  async function removeItem(agenda: Agenda, itemId: string) {
    const updated = await client.agendas.removeItem(agenda.id, itemId)
    replaceSelected(updated)
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
              <ul class="scroll-list">
                {agendasResource.loading && agendas.length === 0 && <li class="none">Laddar…</li>}
                {!agendasResource.loading && visible.length === 0 && templates.length === 0 && (
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
              {templates.length > 0 && (
                <>
                  <div class="templates-heading">Mallar</div>
                  <ul class="templates-list">
                    {templates.map((a) => (
                      <li key={a.id} class={a.id === selectedId ? 'sel' : ''}>
                        <button type="button" onClick={() => setSelectedId(a.id)}>
                          <span class="nm">{a.name}</span>
                          <span class="meta">{a.itemCount} punkter</span>
                        </button>
                        <button
                          class="ib clone"
                          type="button"
                          title="Klona till ny dagordning"
                          aria-label="Klona till ny dagordning"
                          onClick={() => duplicate(a)}
                        >
                          <PlusIcon />
                        </button>
                      </li>
                    ))}
                  </ul>
                </>
              )}
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
                  <h2>
                    {selected.name}
                    {selected.isTemplate && <StatusChip tone="neutral">Mall</StatusChip>}
                  </h2>
                  <div class="facts">
                    <span>{selected.description}</span>
                    <span>{selected.items.length} punkter</span>
                    <span>Ändrad {formatDate(selected.changedAt)}</span>
                    {selected.usedInProjects === 0 ? (
                      <StatusChip tone="neutral">Används inte</StatusChip>
                    ) : selected.usedInProjects === 1 && usedBy.length === 1 ? (
                      <span>
                        Används i{' '}
                        <button class="used-by-link" type="button" onClick={() => onOpenProject(usedBy[0].id)}>
                          {usedBy[0].name}
                        </button>
                      </span>
                    ) : (
                      <span class="used-by">
                        <button class="used-by-link" type="button" onClick={() => setUsedByOpen((v) => !v)}>
                          Används i {selected.usedInProjects} projekt
                        </button>
                        {usedByOpen && usedBy.length > 0 && (
                          <div class="used-by-menu">
                            {usedBy.map((p) => (
                              <button key={p.id} type="button" onClick={() => onOpenProject(p.id)}>
                                {p.name}
                              </button>
                            ))}
                          </div>
                        )}
                      </span>
                    )}
                  </div>
                  <div class="tools">
                    <button class="btn btn-sm" type="button" onClick={() => setRenaming(selected)}>
                      Redigera
                    </button>
                    <button class="btn btn-sm" type="button" onClick={() => toggleTemplate(selected)}>
                      {selected.isTemplate ? 'Ta bort mallstatus' : 'Gör till mall'}
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
                  <EditableItemList
                    items={selected.items}
                    getId={(it) => it.id}
                    getLabel={(it) => it.title}
                    numbered
                    addLabel="Lägg till punkt"
                    onReorder={(next) => reorder(selected, next)}
                    onAdd={() => addItem(selected)}
                    onRename={(id, title) => renameItem(selected, id, title)}
                    onRemove={(id) => removeItem(selected, id)}
                    hint={
                      selected.usedInProjects > 0
                        ? 'Ändringar slår igenom i projekt som ännu inte publicerats. Publicerade sändningar har en fryst kopia och påverkas inte.'
                        : undefined
                    }
                  />
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
