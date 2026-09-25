import { useState } from 'preact/hooks'
import { client } from '../../data'
import type { ChannelHealth, Project } from '../../data/types'
import { useResource } from '../../app/useResource'
import { ConfirmModal } from '../../components/ConfirmModal'
import { Icon } from '../../components/Icon'
import type { ProjectActions } from './actions'
import { MeetingBindingModal } from './MeetingBindingModal'
import { PlayoutColumns } from './PlayoutColumns'
import './BeforeWorkspace.css'

interface BeforeWorkspaceProps {
  project: Project
  actions: ProjectActions
  health: ChannelHealth | null
  refresh: () => Promise<void>
  stopPolling: () => void
  showIngestInfo: boolean
  onShowIngestInfoChange: (show: boolean) => void
  meetingDomain: string
}

// Arbetsyta för förberedelser i läget Before.
export function BeforeWorkspace({ project: p, actions, health, refresh, stopPolling, showIngestInfo, onShowIngestInfoChange, meetingDomain }: BeforeWorkspaceProps) {
  const agendaResource = useResource(
    () => (p.agendaId ? client.agendas.get(p.agendaId) : Promise.resolve(undefined)),
    [p.agendaId],
  )
  const nameListResource = useResource(
    () => (p.namelistId ? client.namelists.get(p.namelistId) : Promise.resolve(undefined)),
    [p.namelistId],
  )
  const [confirmTeardown, setConfirmTeardown] = useState(false)
  const [openMenu, setOpenMenu] = useState<string | null>(null)
  const [openPicker, setOpenPicker] = useState<'agenda' | 'namelist' | null>(null)
  const [notUsed, setNotUsed] = useState<string[]>([])
  const [showMeeting, setShowMeeting] = useState(false)

  const hasIngest = p.channel !== null
  const receivingSignal = health?.livePhase === 'live'

  async function teardownIngest() {
    setConfirmTeardown(false)
    // Kanalen är borta direkt efter teardown — stoppa pollningen i stället för
    // att hälsokolla ett id som inte finns (se useLiveChannel.refresh-racet).
    stopPolling()
    await actions.teardownChannel()
  }

  async function createIngest() {
    setOpenMenu(null)
    await actions.createChannel()
    await refresh()
    // Nyskapad ingest ska visa sin info direkt, inte kräva ett extra klick.
    onShowIngestInfoChange(true)
  }

  function markNotUsed(label: string) {
    setNotUsed((current) => current.includes(label) ? current : [...current, label])
    setOpenMenu(null)
  }

  function statusValue(label: string, value: string) {
    return notUsed.includes(label) ? 'Används ej' : value
  }

  function toggleMenu(label: string) {
    setOpenMenu((current) => current === label ? null : label)
  }

  function actionMenu(label: string, actionsForItem: { label: string; onClick: () => void; danger?: boolean }[]) {
    return (
      <div class="bw-menu-wrap">
        <button class="bw-menu-button" type="button" aria-label={`Åtgärder för ${label}`} aria-expanded={openMenu === label} onClick={() => toggleMenu(label)}>
          <Icon name="more_horiz" size={20} />
        </button>
        {openMenu === label && (
          <div class="bw-menu" role="menu">
            {actionsForItem.map((item) => (
              <button key={item.label} class={item.danger ? 'is-danger' : ''} type="button" role="menuitem" onClick={item.onClick}>
                {item.label}
              </button>
            ))}
          </div>
        )}
      </div>
    )
  }

  function preparationCard(label: string, value: string, ready: boolean, menu: preact.ComponentChildren) {
    return (
      <li key={label} class={ready ? 'is-ready' : 'is-pending'}>
        <Icon name={ready ? 'check_circle' : 'radio_button_unchecked'} size={20} />
        <span class="bw-status-text">
          <span class="bw-status-label">{label}</span>
          <span class="bw-status-value">
            {statusValue(label, value)}
            <span class="sr-only">{ready ? ' – klart' : ' – inte klart'}</span>
          </span>
        </span>
        {menu}
      </li>
    )
  }

  return (
    <div class="bw">
      <ul class="bw-status" aria-label="Status för förberedelser">
        {preparationCard('Meeting', p.meetingBindingId ? 'Kopplad' : 'Ej kopplad', !!p.meetingBindingId, actionMenu('Meeting', [
          { label: 'Koppla', onClick: () => { setOpenMenu(null); setShowMeeting(true) } },
        ]))}
        {preparationCard('Dagordning', p.agendaId ? (agendaResource.data?.name ?? 'Kopplad') : 'Ej kopplad', !!p.agendaId, actionMenu('Dagordning', [
          { label: 'Koppla', onClick: () => { setOpenMenu(null); setOpenPicker('agenda') } },
          { label: 'Använd ej', onClick: () => { void actions.setAgenda(null); markNotUsed('Dagordning') } },
        ]))}
        {preparationCard('Namnlista', p.namelistId ? (nameListResource.data?.name ?? 'Kopplad') : 'Ej kopplad', !!p.namelistId, actionMenu('Namnlista', [
          { label: 'Koppla', onClick: () => { setOpenMenu(null); setOpenPicker('namelist') } },
          { label: 'Använd ej', onClick: () => { actions.setNameList(null); markNotUsed('Namnlista') } },
        ]))}
        {preparationCard('Ingest', receivingSignal ? 'Signal OK' : hasIngest ? 'Ingen signal' : 'Inte skapad', hasIngest, <>
          {hasIngest && (
            <button
              class="bw-info-button"
              type="button"
              aria-label="Visa ingest-info"
              title="Visa ingest-info"
              aria-expanded={showIngestInfo}
              onClick={() => onShowIngestInfoChange(!showIngestInfo)}
            >
              <Icon name="info" size={18} />
            </button>
          )}
          {actionMenu('Ingest', [
          ...(!hasIngest ? [{ label: 'Skapa', onClick: () => void createIngest() }] : []),
          ...(hasIngest ? [
            { label: showIngestInfo ? 'Dölj ingest-info' : 'Visa ingest-info', onClick: () => { onShowIngestInfoChange(!showIngestInfo); setOpenMenu(null) } },
            { label: 'Riv', onClick: () => { setOpenMenu(null); setConfirmTeardown(true) }, danger: true },
          ] : []),
          ])}
        </>)}
      </ul>

      <PlayoutColumns project={p} actions={actions} openPicker={openPicker} onPickerClosed={() => setOpenPicker(null)} />

      {confirmTeardown && (
        <ConfirmModal
          title="Riva ingest?"
          confirmLabel="Riv ingest"
          danger
          onCancel={() => setConfirmTeardown(false)}
          onConfirm={() => void teardownIngest()}
        >
          <p>Ingest-resursen tas bort. För att sända behöver du skapa en ny ingest och använda en ny stream key i enkodern.</p>
        </ConfirmModal>
      )}
      {showMeeting && (
        <MeetingBindingModal
          projectName={p.name}
          meetingDomain={meetingDomain}
          currentAgendaName={p.agendaId ? agendaResource.data?.name : undefined}
          actions={actions}
          onClose={() => setShowMeeting(false)}
        />
      )}
    </div>
  )
}
