import { i18n } from '@lingui/core'
import { plural, t } from '@lingui/core/macro'
import { useEffect, useState } from 'preact/hooks'
import { client } from '../../data'
import type { NameList, NameListPerson } from '../../data/types'
import { useResource } from '../../app/useResource'
import { SplitPane } from '../../components/SplitPane'
import { StatusChip } from '../../components/StatusChip'
import { OverflowMenu } from '../../components/OverflowMenu'
import { EditableItemList } from '../../components/EditableItemList'
import { ImportTextDialog } from '../../components/ImportTextDialog'
import { RenameModal } from '../../components/RenameModal'
import { ConfirmModal } from '../../components/ConfirmModal'
import { SearchIcon, EditIcon } from '../../components/icons'
import { readStoredSelection, storeSelection } from '../../app/selectionStorage'
import { errorMessage, runOptimistic } from '../../app/optimistic'
import { Toast } from '../../components/Toast'
import { formatDate } from '../../app/time'
import './NameListsView.css'

function namesChangedText(count: number, changedAt: string): string {
  const changed = formatDate(changedAt)
  return plural(count, { one: `# name · changed ${changed}`, other: `# names · changed ${changed}` })
}

function changedText(changedAt: string): string {
  const changed = formatDate(changedAt)
  return t`Changed ${changed}`
}

interface NameListsViewProps {
  selectionScope: string
  /** Set by App.tsx when arriving via "Open..." in the project details — consumed once on mount (the view is unmounted/remounted on every navigation here, see App.tsx). */
  initialSelectedId?: string | null
  onInitialSelectionConsumed?: () => void
}

export function NameListsView({ selectionScope, initialSelectedId, onInitialSelectionConsumed }: NameListsViewProps) {
  const listsResource = useResource(() => client.namelists.list(), [])
  const [namelists, setNamelists] = useState<NameList[]>([])
  const [selectedId, setSelectedId] = useState<string | null>(() => initialSelectedId ?? readStoredSelection('namelist', selectionScope))

  useEffect(() => {
    if (initialSelectedId) onInitialSelectionConsumed?.()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])
  const [personFilter, setPersonFilter] = useState('')
  const [creating, setCreating] = useState(false)
  const [renaming, setRenaming] = useState<NameList | null>(null)
  const [confirmTrash, setConfirmTrash] = useState<NameList | null>(null)
  const [importing, setImporting] = useState<NameList | null>(null)

  useEffect(() => {
    if (listsResource.data) setNamelists(listsResource.data)
  }, [listsResource.data])

  useEffect(() => {
    if (namelists.length > 0 && (!selectedId || !namelists.some((namelist) => namelist.id === selectedId))) setSelectedId(namelists[0].id)
  }, [namelists, selectedId])

  useEffect(() => {
    storeSelection('namelist', selectedId, selectionScope)
  }, [selectedId, selectionScope])

  // The list is deliberately light (personCount, no people) — full details are fetched
  // separately when something is selected, see PLAN-live-server-v3.md step 2.
  const detailResource = useResource(
    () => (selectedId ? client.namelists.get(selectedId) : Promise.resolve(undefined)),
    [selectedId],
  )
  const [selected, setSelected] = useState<NameList | null>(null)
  const [toast, setToast] = useState<string | null>(null)
  const trashName = confirmTrash?.name ?? ''
  const trashUsedIn = confirmTrash?.usedInProjects ?? 0

  useEffect(() => {
    setSelected(detailResource.data ?? null)
  }, [detailResource.data])

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

  async function createNameList(name: string) {
    const created = await client.namelists.create({ name, description: t`Draft` })
    setNamelists((prev) => [created, ...prev])
    setSelectedId(created.id)
    setCreating(false)
  }

  // UNG-105: the new name shows immediately; on failure it is restored and a toast shows the error.
  function patchListName(id: string, name: string) {
    setSelected((prev) => (prev && prev.id === id ? { ...prev, name } : prev))
    setNamelists((prev) => prev.map((n) => (n.id === id ? { ...n, name } : n)))
  }

  // The server's response replaces only if the list is still the one shown.
  function applyServerList(next: NameList) {
    setSelected((prev) => (prev && prev.id === next.id ? next : prev))
    setNamelists((prev) =>
      prev.map((n) =>
        n.id === next.id
          ? { ...n, name: next.name, description: next.description, personCount: next.people.length, usedInProjects: next.usedInProjects, changedAt: next.changedAt }
          : n,
      ),
    )
  }

  function confirmRename(name: string) {
    if (!renaming) return
    const list = renaming
    setRenaming(null)
    void runOptimistic({
      key: `namelist:${list.id}`,
      apply: () => {
        patchListName(list.id, name)
        return () => patchListName(list.id, list.name)
      },
      request: () => client.namelists.update(list.id, { name }),
      onSuccess: applyServerList,
      onError: (err) => setToast(errorMessage(err, t`Could not rename.`)),
    })
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

  async function addPerson(list: NameList): Promise<string> {
    const updated = await client.namelists.addPerson(list.id, { name: t`New person` })
    replaceSelected(updated)
    return updated.people[updated.people.length - 1].id
  }

  function patchPersonName(listId: string, personId: string, name: string) {
    setSelected((prev) =>
      prev && prev.id === listId ? { ...prev, people: prev.people.map((p) => (p.id === personId ? { ...p, name } : p)) } : prev,
    )
  }

  async function renamePerson(list: NameList, personId: string, name: string) {
    const previous = list.people.find((p) => p.id === personId)?.name
    if (previous === undefined) return
    await runOptimistic({
      key: `person:${list.id}:${personId}`,
      apply: () => {
        patchPersonName(list.id, personId, name)
        return () => patchPersonName(list.id, personId, previous)
      },
      request: () => client.namelists.updatePerson(list.id, personId, { name }),
      onSuccess: applyServerList,
      onError: (err) => setToast(errorMessage(err, t`Could not rename.`)),
    })
  }

  async function removePerson(list: NameList, personId: string) {
    const updated = await client.namelists.removePerson(list.id, personId)
    replaceSelected(updated)
  }

  async function reorder(list: NameList, nextPeople: NameListPerson[]) {
    const renumbered = nextPeople.map((p, i) => ({ ...p, position: i + 1 }))
    const updated = await client.namelists.replacePeople(list.id, renumbered)
    replaceSelected(updated)
  }

  async function sortAZ(list: NameList) {
    const sorted = [...list.people]
      .sort((a, b) => a.name.localeCompare(b.name, i18n.locales))
      .map((p, i) => ({ ...p, position: i + 1 }))
    const updated = await client.namelists.replacePeople(list.id, sorted)
    replaceSelected(updated)
  }

  function openImport(list: NameList) {
    setImporting(list)
  }

  return (
    <div class="view">
      <header>
        <div class="header-list-zone">
          <h1>{t`Name lists`}</h1>
          <span class="spacer" />
          <button class="btn btn-sm" type="button" onClick={() => setCreating(true)}>
            {t`+ New`}
          </button>
        </div>
      </header>

      <div class="content">
        <SplitPane
          listLabel={t`Name lists`}
          detailLabel={t`Selected name list`}
          list={
            <>
              <ul>
                {listsResource.loading && namelists.length === 0 && <li class="none">{t`Loading…`}</li>}
                {!listsResource.loading && namelists.length === 0 && (
                  <li class="none">{t`No name list yet.`}</li>
                )}
                {namelists.map((n) => (
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
                        {namesChangedText(n.personCount, n.changedAt)}
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            </>
          }
          detail={
            !selectedId ? (
              <div class="docnone">{t`Select a name list in the list.`}</div>
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
                      title={t`Rename the name list`}
                      aria-label={t`Rename the name list`}
                      onClick={() => setRenaming(selected)}
                    >
                      <EditIcon />
                    </button>
                    <span class="head-actions">
                      <OverflowMenu
                        items={[
                          { label: t`Duplicate`, onClick: () => duplicate(selected) },
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
                    <span>{plural(selected.people.length, { one: '# name', other: '# names' })}</span>
                    <span>{changedText(selected.changedAt)}</span>
                  </div>
                </div>
                <div class="body">
                  <EditableItemList
                    items={visiblePeople}
                    getId={(p) => p.id}
                    getLabel={(p) => p.name}
                    disabled={filterActive}
                    addLabel={t`Add name`}
                    onReorder={(next) => reorder(selected, next)}
                    onAdd={() => addPerson(selected)}
                    onRename={(id, name) => renamePerson(selected, id, name)}
                    onRemove={(id) => removePerson(selected, id)}
                    toolbarExtra={
                      <div class="person-toolbar-fields">
                        <div class="search">
                          <SearchIcon />
                          <input
                            type="search"
                            placeholder={t`Filter names`}
                            aria-label={t`Filter names`}
                            value={personFilter}
                            onInput={(e) => setPersonFilter(e.currentTarget.value)}
                          />
                        </div>
                        <button class="btn btn-sm" type="button" onClick={() => sortAZ(selected)}>
                          {t`Sort A–Z`}
                        </button>
                      </div>
                    }
                    toolbarExtraAfter={
                      <button class="btn btn-sm" type="button" onClick={() => openImport(selected)}>
                        {t`Import...`}
                      </button>
                    }
                    emptyMessage={filterActive ? t`No name matches the filter.` : undefined}
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
          title={t`New name list`}
          initialValue=""
          onCancel={() => setCreating(false)}
          onSave={createNameList}
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
          kind="namelist"
          existingCount={importing.people.length}
          onClose={() => setImporting(null)}
          run={async (text, mode) => {
            const result = await client.namelists.importPeople(importing.id, text, mode)
            replaceSelected(result.nameList)
            return result
          }}
        />
      )}
      {toast && <Toast message={toast} onDismiss={() => setToast(null)} />}
    </div>
  )
}
