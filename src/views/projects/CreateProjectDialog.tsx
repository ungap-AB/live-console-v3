import { useState } from 'preact/hooks'
import { client } from '../../data'
import { Modal } from '../../components/Modal'
import { useResource } from '../../app/useResource'
import { defaultLayoutSource, layoutSourceOptions } from './layoutInherit'
import { agendaOptions, chooseList, defaultChoice, isMeetingCustomer, nameListOptions } from './createProjectLists'
import { ListPickerDialog } from './ListPickerDialog'
import type { ListChoices } from './createProjectLists'
import type { Project } from '../../data/types'
import './CreateProjectDialog.css'

interface CreateProjectDialogProps {
  /** Projekten i domänen, för "Utgå från layout" och för att veta vilken namnlista föregående projekt har. */
  projects: readonly Pick<Project, 'id' | 'name' | 'createdAt' | 'namelistId' | 'meetingBindingId' | 'isLayoutTemplate'>[]
  onCancel: () => void
  onCreate: (name: string, layoutSourceProjectId: string | null, lists: ListChoices) => void
}

const NONE = ''

// UNG-180/189: skapa projekt. Namn, val av layoutkälla (senast skapade projektet förvalt) och, utan spärr, dagordning och namnlista:
// den senast skapade oanvända dagordningen respektive föregående projekts namnlista föreslås, eller Ingen (koppla senare). Meeting-kunder
// får "Koppla till Meeting" förvalt. Att skapa en ny lista erbjuds inte här: det görs i projektvyn eller under Dagordningar och Namnlistor.
// UNG-287: layouten erbjuds från det senaste projektet och mallarna. En annan lista än förslaget väljs i en väljardialog (Välj annan…).
export function CreateProjectDialog({ projects, onCancel, onCreate }: CreateProjectDialogProps) {
  const options = layoutSourceOptions(projects)
  const [name, setName] = useState('')
  const [source, setSource] = useState<string>(defaultLayoutSource(options) ?? NONE)
  const agendas = useResource(() => client.agendas.list(), [])
  const nameLists = useResource(() => client.namelists.list(), [])
  const [chosen, setChosen] = useState<Partial<ListChoices>>({})
  // Listor valda i väljardialogen, och vilken väljare som är öppen (dialogen ersätter skapa-dialogen så länge, så att Esc bara stänger den).
  const [picked, setPicked] = useState<Partial<ListChoices>>({})
  const [picking, setPicking] = useState<keyof ListChoices | null>(null)
  const trimmed = name.trim()

  const meeting = isMeetingCustomer(projects)
  const sourceProject = projects.find((project) => project.id === source)
  const agendaChoices = agendaOptions({ agendas: agendas.data ?? [], meeting, picked: picked.agenda })
  const nameListChoices = nameListOptions({ source: sourceProject, nameLists: nameLists.data ?? [], meeting, picked: picked.namelist })
  // Förvalen följer med tills man själv valt: namnlistan byter när man byter layoutkälla, tills man rört något av de två valen.
  const defaults: ListChoices = { agenda: defaultChoice(agendaChoices), namelist: defaultChoice(nameListChoices) }
  const lists: ListChoices = { agenda: chosen.agenda ?? defaults.agenda, namelist: chosen.namelist ?? defaults.namelist }
  const choose = (which: keyof ListChoices, value: string) => setChosen(chooseList(lists, which, value, defaults))

  const submit = () => {
    if (trimmed) onCreate(trimmed, source === NONE ? null : source, lists)
  }

  if (picking) {
    const agenda = picking === 'agenda'
    return (
      <ListPickerDialog
        title={agenda ? 'Välj dagordning' : 'Välj namnlista'}
        lists={(agenda ? agendas.data : nameLists.data) ?? []}
        loading={agenda ? agendas.loading : nameLists.loading}
        onCancel={() => setPicking(null)}
        onPick={(id) => {
          setPicked({ ...picked, [picking]: id })
          choose(picking, id)
          setPicking(null)
        }}
      />
    )
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
            {options.map((option) => <option key={option.id} value={option.id}>{option.label}</option>)}
            <option value={NONE}>Ingen (tomma texter och standardvärden)</option>
          </select>
          <small>Kopierar meddelandetexterna, textens placering, Mux-inställningen och posterbilden. Fler val: markera ett projekt som mall i projektlistans ⋯-meny.</small>
        </label>
      )}
      <label class="cp-field">
        <span>Dagordning</span>
        <div class="cp-row">
          <select value={lists.agenda} onChange={(event) => choose('agenda', event.currentTarget.value)}>
            {agendaChoices.map((option) => <option key={option.id} value={option.id}>{option.label}</option>)}
          </select>
          <button class="btn btn-sm" type="button" onClick={() => setPicking('agenda')}>Välj annan…</button>
        </div>
      </label>
      <label class="cp-field">
        <span>Namnlista</span>
        <div class="cp-row">
          <select value={lists.namelist} onChange={(event) => choose('namelist', event.currentTarget.value)}>
            {nameListChoices.map((option) => <option key={option.id} value={option.id}>{option.label}</option>)}
          </select>
          <button class="btn btn-sm" type="button" onClick={() => setPicking('namelist')}>Välj annan…</button>
        </div>
        <small>Du kan koppla eller byta dagordning och namnlista när som helst i projektet.</small>
      </label>
    </Modal>
  )
}
