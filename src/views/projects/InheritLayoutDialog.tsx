import { t } from '@lingui/core/macro'
import { useState } from 'preact/hooks'
import { client } from '../../data'
import { Modal } from '../../components/Modal'
import { useResource } from '../../app/useResource'
import type { Project } from '../../data/types'
import type { ProjectActions } from './actions'
import { defaultLayoutSource, layoutDiff, layoutOf, layoutSourceOptions } from './layoutInherit'
import './CreateProjectDialog.css'

interface InheritLayoutDialogProps {
  project: Project
  actions: ProjectActions
  onCancel: () => void
  /** Called when the layout has been fetched and saved. */
  onDone: () => void
}

// UNG-180: fetches another project's player layout into this project. The layout is copied and REPLACES all layout fields, so the dialog lists
// exactly what is overwritten before confirming. The same list as in the create dialog, with the most recently created project preselected.
export function InheritLayoutDialog({ project, actions, onCancel, onDone }: InheritLayoutDialogProps) {
  const resource = useResource(() => client.projects.list(), [])
  const all = resource.data ?? []
  const options = layoutSourceOptions(all, project.id, true)
  const [chosen, setChosen] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const sourceId = chosen ?? defaultLayoutSource(options)
  const source = all.find((candidate) => candidate.id === sourceId)
  const changes = source ? layoutDiff(layoutOf(project), layoutOf(source)) : []

  async function confirm() {
    if (!sourceId) return
    setBusy(true)
    try {
      if (await actions.inheritLayout(sourceId)) onDone()
    } finally {
      setBusy(false)
    }
  }

  return (
    <Modal
      title={t`Get layout from project`}
      subtitle={t`Replaces all the player settings and the poster image with a copy of the chosen project's.`}
      onClose={onCancel}
      footer={
        <>
          <button class="btn btn-sm" type="button" onClick={onCancel}>{t`Cancel`}</button>
          <button class="btn btn-sm btn-primary" type="button" disabled={!source || busy} onClick={() => void confirm()}>
            {busy ? t`Fetching…` : changes.length > 0 ? t`Get layout` : t`Get anyway`}
          </button>
        </>
      }
    >
      {resource.loading && <p class="cp-note">{t`Fetching the projects…`}</p>}
      {!resource.loading && options.length === 0 && <p class="cp-note">{t`There are no other projects to get a layout from.`}</p>}
      {options.length > 0 && (
        <label class="cp-field">
          <span>{t`Project`}</span>
          <select value={sourceId ?? ''} onChange={(event) => setChosen(event.currentTarget.value)}>
            {options.map((option) => (
              <option key={option.id} value={option.id}>{option.label}</option>
            ))}
          </select>
        </label>
      )}
      {source && (
        changes.length === 0 ? (
          <p class="cp-note">{t`The layout is already the same. Nothing is overwritten.`}</p>
        ) : (
          <div class="cp-changes">
            <p class="cp-note">{t`This is replaced:`}</p>
            <ul>
              {changes.map((change) => (
                <li key={change.key}>
                  <strong>{change.label}</strong>
                  <span class="cp-from">{change.from}</span>
                  <span aria-hidden="true">→</span>
                  <span class="cp-to">{change.to}</span>
                </li>
              ))}
            </ul>
            <p class="cp-note">{t`Unsaved changes in the player settings are lost.`}</p>
          </div>
        )
      )}
    </Modal>
  )
}
