import { plural, t } from '@lingui/core/macro'
import { useEffect, useRef, useState } from 'preact/hooks'
import { client } from '../../data'
import type { Agenda, AgendaItem, Project } from '../../data/types'
import { useDismiss } from '../../app/useDismiss'
import { useResource } from '../../app/useResource'
import { SplitPane } from '../../components/SplitPane'
import { StatusChip } from '../../components/StatusChip'
import { OverflowMenu } from '../../components/OverflowMenu'
import { EditableItemList } from '../../components/EditableItemList'
import { ImportTextDialog } from '../../components/ImportTextDialog'
import { RenameModal } from '../../components/RenameModal'
import { ConfirmModal } from '../../components/ConfirmModal'
import { PdfAttachmentsModal } from '../../components/PdfAttachmentsModal'
import { PlusIcon, EditIcon } from '../../components/icons'
import { PdfIcon } from '../../components/icons'
import { readStoredSelection, storeSelection } from '../../app/selectionStorage'
import { errorMessage, runOptimistic } from '../../app/optimistic'
import { Toast } from '../../components/Toast'
import { formatDate } from '../../app/time'
import './AgendasView.css'

function itemsText(count: number): string {
  return plural(count, { one: '# item', other: '# items' })
}

function itemsChangedText(count: number, changedAt: string): string {
  const changed = formatDate(changedAt)
  return plural(count, { one: `# item · changed ${changed}`, other: `# items · changed ${changed}` })
}

function changedText(changedAt: string): string {
  const changed = formatDate(changedAt)
  return t`Changed ${changed}`
}

function pdfTitle(count: number): string {
  return count ? t`PDF documents (${count})` : t`PDF documents`
}

function pdfAriaLabel(title: string): string {
  return t`Open PDF documents for ${title}`
}

interface AgendasViewProps {
  onOpenProject: (id: string) => void
  selectionScope: string
  /** Set by App.tsx when arriving via "Open..." in the project details — consumed once on mount (the view is unmounted/remounted on every navigation here, see App.tsx). */
  initialSelectedId?: string | null
  onInitialSelectionConsumed?: () => void
}

export function AgendasView({ onOpenProject, selectionScope, initialSelectedId, onInitialSelectionConsumed }: AgendasViewProps) {
  const agendasResource = useResource(() => client.agendas.list(), [])
  const [agendas, setAgendas] = useState<Agenda[]>([])
  const [selectedId, setSelectedId] = useState<string | null>(() => initialSelectedId ?? readStoredSelection('agenda', selectionScope))

  useEffect(() => {
    if (initialSelectedId) onInitialSelectionConsumed?.()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])
  const [creating, setCreating] = useState(false)
  const [renaming, setRenaming] = useState<Agenda | null>(null)
  const [confirmTrash, setConfirmTrash] = useState<Agenda | null>(null)
  const [importing, setImporting] = useState<Agenda | null>(null)
  const [usedByOpen, setUsedByOpen] = useState(false)
  const usedByRef = useRef<HTMLSpanElement>(null)
  useDismiss(usedByOpen, usedByRef, () => setUsedByOpen(false))
  const [pdfItem, setPdfItem] = useState<AgendaItem | null>(null)

  const projectsResource = useResource(() => client.projects.list(), [])
  const projects: Project[] = projectsResource.data ?? []

  useEffect(() => {
    if (agendasResource.data) setAgendas(agendasResource.data)
  }, [agendasResource.data])

  useEffect(() => {
    if (agendas.length > 0 && (!selectedId || !agendas.some((agenda) => agenda.id === selectedId))) setSelectedId(agendas[0].id)
  }, [agendas, selectedId])

  useEffect(() => {
    storeSelection('agenda', selectedId, selectionScope)
  }, [selectedId, selectionScope])

  // The list is deliberately light (itemCount, no items) — full details are fetched
  // separately when something is selected, see PLAN-live-server-v3.md step 2.
  const detailResource = useResource(
    () => (selectedId ? client.agendas.get(selectedId) : Promise.resolve(undefined)),
    [selectedId],
  )
  const [selected, setSelected] = useState<Agenda | null>(null)
  const [toast, setToast] = useState<string | null>(null)
  const trashName = confirmTrash?.name ?? ''
  const trashUsedIn = confirmTrash?.usedInProjects ?? 0

  useEffect(() => {
    setSelected(detailResource.data ?? null)
    setUsedByOpen(false)
    setPdfItem(null)
  }, [detailResource.data])

  const visible = agendas.filter((a) => !a.isTemplate)
  const templates = agendas.filter((a) => a.isTemplate)

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

  async function createAgenda(name: string) {
    const created = await client.agendas.create({ name, description: t`Draft` })
    setAgendas((prev) => [created, ...prev])
    setSelectedId(created.id)
    setCreating(false)
  }

  // UNG-105: the new name shows immediately; on failure it is restored and a toast shows the error.
  function patchAgendaName(id: string, name: string) {
    setSelected((prev) => (prev && prev.id === id ? { ...prev, name } : prev))
    setAgendas((prev) => prev.map((x) => (x.id === id ? { ...x, name } : x)))
  }

  // The server's response replaces only if the agenda is still the one shown.
  function applyServerAgenda(next: Agenda) {
    setSelected((prev) => (prev && prev.id === next.id ? next : prev))
    setAgendas((prev) =>
      prev.map((x) =>
        x.id === next.id
          ? { ...x, name: next.name, description: next.description, itemCount: next.items.length, usedInProjects: next.usedInProjects, changedAt: next.changedAt, isTemplate: next.isTemplate }
          : x,
      ),
    )
  }

  function confirmRename(name: string) {
    if (!renaming) return
    const agenda = renaming
    setRenaming(null)
    void runOptimistic({
      key: `agenda:${agenda.id}`,
      apply: () => {
        patchAgendaName(agenda.id, name)
        return () => patchAgendaName(agenda.id, agenda.name)
      },
      request: () => client.agendas.update(agenda.id, { name }),
      onSuccess: applyServerAgenda,
      onError: (err) => setToast(errorMessage(err, t`Could not rename.`)),
    })
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
    const updated = await client.agendas.addItem(agenda.id, { title: t`New item` })
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

  function openImport(agenda: Agenda) {
    setImporting(agenda)
  }

  return (
    <div class="view">
      <header>
        <div class="header-list-zone">
          <h1>{t`Agendas`}</h1>
          <span class="spacer" />
          <button class="btn btn-sm" type="button" onClick={() => setCreating(true)}>
            {t`+ New`}
          </button>
        </div>
      </header>

      <div class="content">
        <SplitPane
          listLabel={t`Agendas`}
          detailLabel={t`Selected agenda`}
          list={
            <>
              <ul class="scroll-list">
                {agendasResource.loading && agendas.length === 0 && <li class="none">{t`Loading…`}</li>}
                {!agendasResource.loading && visible.length === 0 && templates.length === 0 && (
                  <li class="none">{t`No agenda yet.`}</li>
                )}
                {visible.map((a) => (
                  <li key={a.id} class={a.id === selectedId ? 'sel' : ''}>
                    <button type="button" onClick={() => setSelectedId(a.id)}>
                      <span class="nm">
                        {a.usedInProjects > 0 && <StatusChip tone="accent" dot />}
                        {a.name}
                      </span>
                      <span class="meta">
                        {itemsChangedText(a.itemCount, a.changedAt)}
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
              {templates.length > 0 && (
                <>
                  <div class="templates-heading">{t`Templates`}</div>
                  <ul class="templates-list">
                    {templates.map((a) => (
                      <li key={a.id} class={a.id === selectedId ? 'sel' : ''}>
                        <button type="button" onClick={() => setSelectedId(a.id)}>
                          <span class="nm">{a.name}</span>
                          <span class="meta">{itemsText(a.itemCount)}</span>
                        </button>
                        <button
                          class="ib clone"
                          type="button"
                          title={t`Clone to new agenda`}
                          aria-label={t`Clone to new agenda`}
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
              <div class="docnone">{t`Select an agenda in the list.`}</div>
            ) : !selected ? (
              <div class="docnone">{t`Loading…`}</div>
            ) : (
              <>
                <div class="head">
                  <h2>
                    {selected.name}
                    <button
                      class="ib"
                      type="button"
                      title={t`Rename the agenda`}
                      aria-label={t`Rename the agenda`}
                      onClick={() => setRenaming(selected)}
                    >
                      <EditIcon />
                    </button>
                    {selected.isTemplate && <StatusChip tone="neutral">{t`Template`}</StatusChip>}
                    <span class="head-actions">
                      <OverflowMenu
                        items={[
                          {
                            label: selected.isTemplate ? t`Remove template status` : t`Make template`,
                            onClick: () => toggleTemplate(selected),
                          },
                          {
                            label: t`Move to trash`,
                            danger: true,
                            onClick: () =>
                              selected.usedInProjects > 0 ? setConfirmTrash(selected) : trash(selected),
                          },
                        ]}
                      />
                    </span>
                  </h2>
                  <div class="facts">
                    <span>{selected.description}</span>
                    <span>{itemsText(selected.items.length)}</span>
                    <span>{changedText(selected.changedAt)}</span>
                    {selected.usedInProjects === 0 ? (
                      <StatusChip tone="neutral">{t`Not used`}</StatusChip>
                    ) : selected.usedInProjects === 1 && usedBy.length === 1 ? (
                      <span>
                        {t`Used in`}{' '}
                        <button class="used-by-link" type="button" onClick={() => onOpenProject(usedBy[0].id)}>
                          {usedBy[0].name}
                        </button>
                      </span>
                    ) : (
                      <span class="used-by" ref={usedByRef}>
                        <button class="used-by-link" type="button" onClick={() => setUsedByOpen((v) => !v)}>
                          {plural(selected.usedInProjects, { one: 'Used in # project', other: 'Used in # projects' })}
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
                </div>
                <div class="body">
                  <EditableItemList
                    items={selected.items}
                    getId={(it) => it.id}
                    getLabel={(it) => it.title}
                    numbered
                    addLabel={t`Add item`}
                    onReorder={(next) => reorder(selected, next)}
                    onAdd={() => addItem(selected)}
                    onRename={(id, title) => renameItem(selected, id, title)}
                    onRemove={(id) => removeItem(selected, id)}
                    renderRowAction={(item) => (
                      <button
                        class="ib pdf-row-action"
                        type="button"
                        title={pdfTitle(item.attachments?.length ?? 0)}
                        aria-label={pdfAriaLabel(item.title)}
                        onClick={() => setPdfItem(item)}
                      >
                        <PdfIcon />
                        <span class="pdf-count" aria-hidden="true">{item.attachments?.length ?? 0}</span>
                      </button>
                    )}
                    toolbarExtraAfter={
                      <button class="btn btn-sm btn-primary agenda-import-button" type="button" onClick={() => openImport(selected)}>
                        {t`Import...`}
                      </button>
                    }
                    hint={
                      selected.usedInProjects > 0
                        ? t`Changes take effect in projects that have not been published yet. Published broadcasts have a frozen copy and are not affected.`
                        : undefined
                    }
                  />
                </div>
              </>
            )
          }
        />
      </div>

      {creating && (
        <RenameModal
          title={t`New agenda`}
          initialValue=""
          onCancel={() => setCreating(false)}
          onSave={createAgenda}
        />
      )}

      {renaming && (
        <RenameModal
          initialValue={renaming.name}
          onCancel={() => setRenaming(null)}
          onSave={confirmRename}
        />
      )}

      {confirmTrash && (
        <ConfirmModal
          title={t`Move to trash?`}
          confirmLabel={t`Move to trash`}
          danger
          onCancel={() => setConfirmTrash(null)}
          onConfirm={() => trash(confirmTrash)}
        >
          <p>{plural(trashUsedIn, { one: `${trashName} is used in # project. Move to trash anyway?`, other: `${trashName} is used in # projects. Move to trash anyway?` })}</p>
        </ConfirmModal>
      )}

      {importing && (
        <ImportTextDialog
          kind="agenda"
          existingCount={importing.items.length}
          onClose={() => setImporting(null)}
          run={async (text, mode) => {
            const result = await client.agendas.importItems(importing.id, text, mode)
            replaceSelected(result.agenda)
            return result
          }}
        />
      )}

      {pdfItem && selected && (
        <PdfAttachmentsModal
          agenda={selected}
          item={pdfItem}
          onChanged={(next) => {
            replaceSelected(next)
            setPdfItem(next.items.find((item) => item.id === pdfItem.id) ?? null)
          }}
          onClose={() => setPdfItem(null)}
        />
      )}
      {toast && <Toast message={toast} onDismiss={() => setToast(null)} />}
    </div>
  )
}
