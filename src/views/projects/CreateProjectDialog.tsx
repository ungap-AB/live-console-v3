import { t } from '@lingui/core/macro'
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
  /** The projects in the domain, for "Start from layout" and to know which name list the previous project has. */
  projects: readonly Pick<Project, 'id' | 'name' | 'createdAt' | 'namelistId' | 'meetingBindingId' | 'isLayoutTemplate'>[]
  onCancel: () => void
  onCreate: (name: string, layoutSourceProjectId: string | null, lists: ListChoices) => void
}

const NONE = ''

// UNG-180/189: create a project. Name, choice of layout source (the most recently created project preselected) and, without a gate, agenda
// and name list: the most recently created unused agenda and the previous project's name list are suggested, or None (link later). Meeting
// customers get "Link to Meeting" preselected. Creating a new list is not offered here: that is done in the project view or under Agendas
// and Name lists. UNG-287: the layout is offered from the latest project and the templates. A list other than the suggestion is chosen in a
// picker dialog (Choose another…).
export function CreateProjectDialog({ projects, onCancel, onCreate }: CreateProjectDialogProps) {
  const options = layoutSourceOptions(projects)
  const [name, setName] = useState('')
  const [source, setSource] = useState<string>(defaultLayoutSource(options) ?? NONE)
  const agendas = useResource(() => client.agendas.list(), [])
  const nameLists = useResource(() => client.namelists.list(), [])
  const [chosen, setChosen] = useState<Partial<ListChoices>>({})
  // Lists chosen in the picker dialog, and which picker is open (the dialog replaces the create dialog meanwhile, so Esc only closes it).
  const [picked, setPicked] = useState<Partial<ListChoices>>({})
  const [picking, setPicking] = useState<keyof ListChoices | null>(null)
  const trimmed = name.trim()

  const meeting = isMeetingCustomer(projects)
  const sourceProject = projects.find((project) => project.id === source)
  const agendaChoices = agendaOptions({ agendas: agendas.data ?? [], meeting, picked: picked.agenda })
  const nameListChoices = nameListOptions({ source: sourceProject, nameLists: nameLists.data ?? [], meeting, picked: picked.namelist })
  // The preselections follow along until the user chooses: the name list changes with the layout source until either choice is touched.
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
        title={agenda ? t`Choose agenda` : t`Choose name list`}
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
      title={t`New project`}
      onClose={onCancel}
      footer={
        <>
          <button class="btn btn-sm" type="button" onClick={onCancel}>{t`Cancel`}</button>
          <button class="btn btn-sm btn-primary" type="button" disabled={!trimmed} onClick={submit}>{t`Create`}</button>
        </>
      }
    >
      <label class="cp-field">
        <span>{t`Name`}</span>
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
          <span>{t`Start from layout`}</span>
          <select value={source} onChange={(event) => setSource(event.currentTarget.value)}>
            {options.map((option) => <option key={option.id} value={option.id}>{option.label}</option>)}
            <option value={NONE}>{t`None (empty texts and default values)`}</option>
          </select>
          <small>{t`Copies the message texts, the text placement, the Mux setting and the poster image. More choices: mark a project as a template in the project list's ⋯ menu.`}</small>
        </label>
      )}
      <label class="cp-field">
        <span>{t`Agenda`}</span>
        <div class="cp-row">
          <select value={lists.agenda} onChange={(event) => choose('agenda', event.currentTarget.value)}>
            {agendaChoices.map((option) => <option key={option.id} value={option.id}>{option.label}</option>)}
          </select>
          <button class="btn btn-sm" type="button" onClick={() => setPicking('agenda')}>{t`Choose another…`}</button>
        </div>
      </label>
      <label class="cp-field">
        <span>{t`Name list`}</span>
        <div class="cp-row">
          <select value={lists.namelist} onChange={(event) => choose('namelist', event.currentTarget.value)}>
            {nameListChoices.map((option) => <option key={option.id} value={option.id}>{option.label}</option>)}
          </select>
          <button class="btn btn-sm" type="button" onClick={() => setPicking('namelist')}>{t`Choose another…`}</button>
        </div>
        <small>{t`You can link or change the agenda and name list at any time in the project.`}</small>
      </label>
    </Modal>
  )
}
