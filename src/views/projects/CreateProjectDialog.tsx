import { useState } from 'preact/hooks'
import { Modal } from '../../components/Modal'
import { defaultLayoutSource, layoutSourceOptions } from './layoutInherit'
import type { Project } from '../../data/types'
import './CreateProjectDialog.css'

interface CreateProjectDialogProps {
  /** Projekten i domänen, för "Utgå från layout". */
  projects: readonly Pick<Project, 'id' | 'name' | 'createdAt'>[]
  onCancel: () => void
  onCreate: (name: string, layoutSourceProjectId: string | null) => void
}

const NONE = ''

// UNG-180: skapa projekt, med valet att utgå från ett annat projekts spelarlayout (texter, placering, Mux). Förvalt är det senast
// skapade projektet, så vanligaste fallet kostar inget klick; "Ingen" ger ett tomt projekt som förut. Layouten kopieras (aldrig delas).
export function CreateProjectDialog({ projects, onCancel, onCreate }: CreateProjectDialogProps) {
  const options = layoutSourceOptions(projects)
  const [name, setName] = useState('')
  const [source, setSource] = useState<string>(defaultLayoutSource(options) ?? NONE)
  const trimmed = name.trim()
  const submit = () => {
    if (trimmed) onCreate(trimmed, source === NONE ? null : source)
  }

  return (
    <Modal
      title="Nytt projekt"
      onClose={onCancel}
      footer={
        <>
          <button class="btn btn-sm" type="button" onClick={onCancel}>Avbryt</button>
          <button class="btn btn-sm btn-primary" type="button" disabled={!trimmed} onClick={submit}>Skapa</button>
        </>
      }
    >
      <label class="cp-field">
        <span>Namn</span>
        <input
          class="rename-input"
          value={name}
          autoFocus
          onInput={(event) => setName(event.currentTarget.value)}
          onKeyDown={(event) => {
            if (event.key === 'Enter') submit()
          }}
        />
      </label>
      {options.length > 0 && (
        <label class="cp-field">
          <span>Utgå från layout</span>
          <select value={source} onChange={(event) => setSource(event.currentTarget.value)}>
            {options.map((option, index) => (
              <option key={option.id} value={option.id}>
                {index === 0 ? `Senaste projektet: ${option.name}` : option.name}
              </option>
            ))}
            <option value={NONE}>Ingen (tomma texter och standardvärden)</option>
          </select>
          <small>Kopierar meddelandetexterna, textens placering, Mux-inställningen och posterbilden.</small>
        </label>
      )}
    </Modal>
  )
}
