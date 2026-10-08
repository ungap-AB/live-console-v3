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
  /** Anropas när layouten hämtats och sparats. */
  onDone: () => void
}

// UNG-180: hämtar ett annat projekts spelarlayout till det här projektet. Layouten kopieras och ERSÄTTER alla layoutfält, så dialogen listar
// exakt vad som skrivs över innan man bekräftar. Samma lista som i skapa-dialogen, med det senast skapade projektet förvalt.
export function InheritLayoutDialog({ project, actions, onCancel, onDone }: InheritLayoutDialogProps) {
  const resource = useResource(() => client.projects.list(), [])
  const all = resource.data ?? []
  const options = layoutSourceOptions(all, project.id)
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
      title="Hämta layout från projekt"
      subtitle="Ersätter spelarens texter, textplacering och Mux-inställning med en kopia av det valda projektets."
      onClose={onCancel}
      footer={
        <>
          <button class="btn btn-sm" type="button" onClick={onCancel}>Avbryt</button>
          <button class="btn btn-sm btn-primary" type="button" disabled={!source || busy} onClick={() => void confirm()}>
            {busy ? 'Hämtar…' : changes.length > 0 ? 'Hämta layout' : 'Hämta ändå'}
          </button>
        </>
      }
    >
      {resource.loading && <p class="cp-note">Hämtar projekten…</p>}
      {!resource.loading && options.length === 0 && <p class="cp-note">Det finns inga andra projekt att hämta layout från.</p>}
      {options.length > 0 && (
        <label class="cp-field">
          <span>Projekt</span>
          <select value={sourceId ?? ''} onChange={(event) => setChosen(event.currentTarget.value)}>
            {options.map((option, index) => (
              <option key={option.id} value={option.id}>{index === 0 ? `Senaste projektet: ${option.name}` : option.name}</option>
            ))}
          </select>
        </label>
      )}
      {source && (
        changes.length === 0 ? (
          <p class="cp-note">Layouten är redan densamma. Inget skrivs över.</p>
        ) : (
          <div class="cp-changes">
            <p class="cp-note">Det här ersätts:</p>
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
            <p class="cp-note">Osparade ändringar i spelarinställningarna går förlorade. Posterbilden påverkas inte.</p>
          </div>
        )
      )}
    </Modal>
  )
}
