import type { ComponentChildren } from 'preact'
import { useEffect, useRef, useState } from 'preact/hooks'
import { client } from '../../data'
import type { ChannelHealth, Project } from '../../data/types'
import { useDismiss } from '../../app/useDismiss'
import { useResource } from '../../app/useResource'
import { ConfirmModal } from '../../components/ConfirmModal'
import { Icon } from '../../components/Icon'
import type { ProjectActions } from './actions'
import { MeetingBindingModal } from './MeetingBindingModal'
import { OverviewShell } from './OverviewShell'
import { PlayerSettingsDialog } from './PlayerSettingsDialog'
import { PlayoutOverlay, type PlayoutAddress } from './PlayoutOverlay'
import { consumeMeetingBindingRequest } from './meetingBindingRequest'
import { linkedResourceLabel } from './preparationLabels'
import { PlayoutColumns } from './PlayoutColumns'
import { useModeChange } from './useModeChange'
import { useNameList } from './useNameList'
import './BeforeWorkspace.css'

interface BeforeWorkspaceProps {
  /** Projektets rubrik (ProjectHeader), överst i översiktsskalet. */
  header: ComponentChildren
  project: Project
  actions: ProjectActions
  health: ChannelHealth | null
  refresh: () => Promise<void>
  stopPolling: () => void
  showIngestInfo: boolean
  onShowIngestInfoChange: (show: boolean) => void
  meetingDomain: string
  /** Utspelningsvyns adress ägs av Livesandning, så att vyn står kvar öppen när läget går från Before till Live. */
  playout: PlayoutAddress
}

// Läget Before. UNG-268: översikt till vänster (status, förberedelser, spelarens bild och text), spelaren till höger; utspelningen av
// dagordning och namnlista ligger i en överlagrad arbetsvy som döljer spelaren.
export function BeforeWorkspace({ header, project: p, actions, health, refresh, stopPolling, showIngestInfo, onShowIngestInfoChange, meetingDomain, playout }: BeforeWorkspaceProps) {
  const agendaResource = useResource(
    () => (p.agendaId ? client.agendas.get(p.agendaId) : Promise.resolve(undefined)),
    [p.agendaId],
  )
  const nameListResource = useNameList(p)
  const [confirmTeardown, setConfirmTeardown] = useState(false)
  const [openMenu, setOpenMenu] = useState<string | null>(null)
  const [openPicker, setOpenPicker] = useState<'agenda' | 'namelist' | null>(null)
  const [notUsed, setNotUsed] = useState<string[]>([])
  // UNG-189: öppnas direkt när man valt "Koppla till Meeting" i skapa-dialogen.
  const [showMeeting, setShowMeeting] = useState(() => consumeMeetingBindingRequest(p.id))
  const [showPlayerSettings, setShowPlayerSettings] = useState(false)
  const { selectMode } = useModeChange(p, actions)
  // Spelaren laddas om när det tittarna ser i Before ändras (från dialogen här eller i rubriken).
  const [playerVersion, setPlayerVersion] = useState(0)
  useEffect(() => setPlayerVersion((v) => v + 1), [p.beforeText, p.posterUrl, p.textPlacement])

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

  function actionMenu(label: string, actionsForItem: BwMenuItem[]) {
    return (
      <BwMenu
        label={label}
        items={actionsForItem}
        open={openMenu === label}
        onToggle={() => toggleMenu(label)}
        onClose={() => setOpenMenu((current) => (current === label ? null : current))}
      />
    )
  }

  // optional: ett alternativ, inte ett obligatoriskt steg — neutral ikon i stället för kryssruta.
  function preparationCard(label: string, value: string, ready: boolean, menu: preact.ComponentChildren, optional = false) {
    return (
      <li key={label} class={optional ? 'is-optional' : ready ? 'is-ready' : 'is-pending'}>
        <Icon name={optional ? 'upload_file' : ready ? 'check_circle' : 'radio_button_unchecked'} size={20} />
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
    <OverviewShell
      header={header}
      player={p.playerUrl ? { url: p.playerUrl, published: true, version: playerVersion } : null}
      workOpen={playout.open}
      overlays={<>
        {playout.open && (
          <PlayoutOverlay projectName={p.name} onClose={playout.closePlayout}>
            <PlayoutColumns project={p} actions={actions} openPicker={openPicker} onPickerClosed={() => setOpenPicker(null)} />
          </PlayoutOverlay>
        )}
        {showPlayerSettings && <PlayerSettingsDialog project={p} actions={actions} onClose={() => setShowPlayerSettings(false)} />}
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
      </>}
    >
      <div class="bw-summary">
        <span class="bw-summary-label">Status</span>
        <strong>{receivingSignal ? 'Inte startad – signal tas emot' : 'Inte startad'}</strong>
      </div>

      <div class="bw-actions">
        <button class="btn btn-primary" type="button" onClick={playout.openPlayout}>
          <Icon name="playlist_play" size={18} /> Spela ut kapitel
        </button>
        <button class="btn" type="button" onClick={() => setShowPlayerSettings(true)}>
          <Icon name="settings" size={18} /> Spelarinställningar…
        </button>
      </div>

      <ul class="bw-status" aria-label="Status för förberedelser">
        {preparationCard('Dagordning', p.agendaId ? withCount(linkedResourceLabel(agendaResource.data), agendaResource.data?.items.length, 'punkt', 'punkter') : 'Ej kopplad', !!p.agendaId, actionMenu('Dagordning', [
          { label: 'Koppla', onClick: () => { setOpenMenu(null); setOpenPicker('agenda'); playout.openPlayout() } },
          { label: 'Koppla till Meeting...', onClick: () => { setOpenMenu(null); setShowMeeting(true) } },
          { label: 'Använd ej', onClick: () => { void actions.setAgenda(null); markNotUsed('Dagordning') } },
        ]))}
        {preparationCard('Namnlista', p.namelistId ? withCount(linkedResourceLabel(nameListResource.data), nameListResource.data?.people.length, 'namn', 'namn') : 'Ej kopplad', !!p.namelistId, actionMenu('Namnlista', [
          { label: 'Koppla', onClick: () => { setOpenMenu(null); setOpenPicker('namelist'); playout.openPlayout() } },
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
        {preparationCard('Ladda upp video', 'Valfritt – i stället för livesändning', false, actionMenu('Ladda upp video', [
          {
            label: 'Ladda upp...',
            onClick: () => { setOpenMenu(null); selectMode('ondemand') },
            disabled: receivingSignal,
            title: receivingSignal ? 'Enkodern sänder just nu.' : undefined,
          },
        ]), true)}
      </ul>

      <div class="bw-player-texts">
        <span class="bw-summary-label">Tittarna ser nu</span>
        <div class="bw-player-row">
          {p.posterUrl ? <img class="bw-poster" src={p.posterUrl} alt="Spelarens bild" /> : <span class="bw-poster is-empty">Ingen bild</span>}
          <p class="bw-before-text">{p.beforeText.trim() || 'Ingen text för Before.'}</p>
        </div>
      </div>
    </OverviewShell>
  )
}

function withCount(label: string, count: number | undefined, one: string, many: string): string {
  return count === undefined ? label : `${label} · ${count} ${count === 1 ? one : many}`
}

interface BwMenuItem {
  label: string
  onClick: () => void
  danger?: boolean
  disabled?: boolean
  title?: string
}

interface BwMenuProps {
  label: string
  items: BwMenuItem[]
  open: boolean
  onToggle: () => void
  onClose: () => void
}

function BwMenu({ label, items, open, onToggle, onClose }: BwMenuProps) {
  const ref = useRef<HTMLDivElement>(null)
  useDismiss(open, ref, onClose)
  return (
    <div class="bw-menu-wrap" ref={ref}>
      <button class="bw-menu-button" type="button" aria-label={`Åtgärder för ${label}`} aria-expanded={open} onClick={onToggle}>
        <Icon name="more_horiz" size={20} />
      </button>
      {open && (
        <div class="bw-menu" role="menu">
          {items.map((item) => (
            <button key={item.label} class={item.danger ? 'is-danger' : ''} type="button" role="menuitem" disabled={item.disabled} title={item.title} onClick={item.onClick}>
              {item.label}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
