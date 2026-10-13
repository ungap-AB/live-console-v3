import type { ComponentChildren } from 'preact'
import { useEffect, useRef, useState } from 'preact/hooks'
import { useIngestInfoRequest } from './useIngestInfoRequest'
import { client } from '../../data'
import type { Channel, ChannelHealth, ForkResult, Project } from '../../data/types'
import { useDismiss } from '../../app/useDismiss'
import { useResource } from '../../app/useResource'
import { ConfirmModal } from '../../components/ConfirmModal'
import { Icon } from '../../components/Icon'
import { PlayerFooter } from './PlayerLinkField'
import { PickerModal } from '../../components/PickerModal'
import type { ProjectActions } from './actions'
import { MeetingBindingModal } from './MeetingBindingModal'
import { OverviewShell } from './OverviewShell'
import { PlayerSettingsDialog, type PlayerSettingsCategory } from './PlayerSettingsDialog'
import { type PlayoutAddress } from './PlayoutOverlay'
import { consumeMeetingBindingRequest } from './meetingBindingRequest'
import { linkedResourceLabel } from './preparationLabels'
import { FlowStep } from './FlowStep'
import { ForkButton } from './ForkButton'
import { IngestInfoPanel } from './IngestInfoPanel'
import { ModeSelector } from './ModeSelector'
import { useNameList } from './useNameList'
import './BeforeWorkspace.css'

interface BeforeWorkspaceProps {
  /** Projektets rubrik (ProjectHeader), överst i översiktsskalet. */
  header: ComponentChildren
  project: Project
  actions: ProjectActions
  channel: Channel | null
  health: ChannelHealth | null
  streamKey: string | null
  refresh: () => Promise<void>
  stopPolling: () => void
  showIngestInfo: boolean
  onShowIngestInfoChange: (show: boolean) => void
  meetingDomain: string
  /** Utspelningsvyns adress ägs av Livesandning, så att vyn står kvar öppen när läget går från Before till Live. */
  playout: PlayoutAddress
  /** UNG-198: anropas när ett projekt skapats ur det här. Saknas den visas inte knappen Fork. */
  onForked?: (result: ForkResult) => void
  /** Ökar när rubrikens Ingest info klickas: öppnar spelarinställningarnas flik Ingest. */
  ingestInfoRequest?: number
}

// Läget Before. UNG-268: översikt till vänster (lägesknapparna, förberedelserna, Spela ut kapitel under dem och Spelarinställningar längst ner), spelaren till
// höger; utspelningen av dagordning och namnlista ligger i den överlagrade arbetsvyn (Livesandning), som döljer spelaren. Koppla i
// korten väljer listan direkt, utan att öppna arbetsvyn.
export function BeforeWorkspace({ header, project: p, actions, channel, health, streamKey, refresh, stopPolling, showIngestInfo, onShowIngestInfoChange, meetingDomain, playout, onForked, ingestInfoRequest = 0 }: BeforeWorkspaceProps) {
  const agendaResource = useResource(
    () => (p.agendaId ? client.agendas.get(p.agendaId) : Promise.resolve(undefined)),
    [p.agendaId],
  )
  const nameListResource = useNameList(p)
  const [confirmTeardown, setConfirmTeardown] = useState(false)
  const [openMenu, setOpenMenu] = useState<string | null>(null)
  const [picking, setPicking] = useState<'agenda' | 'namelist' | null>(null)
  const [notUsed, setNotUsed] = useState<string[]>([])
  // UNG-189: öppnas direkt när man valt "Koppla till Meeting" i skapa-dialogen.
  const [showMeeting, setShowMeeting] = useState(() => consumeMeetingBindingRequest(p.id))
  // Spelarinställningarna och fliken de öppnas på (Ingest-steget och Visa ingest-info öppnar fliken Ingest).
  const [playerSettings, setPlayerSettings] = useState<PlayerSettingsCategory | null>(null)
  useIngestInfoRequest(ingestInfoRequest, () => setPlayerSettings('ingest'))
  // Spelaren laddas om när det tittarna ser i Before ändras (från spelarinställningarna).
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

  // Efter prod-provet 2026-10-13: förberedelserna är guidade steg (flödesknappar) som i After/Ondemand. Raden gör huvudåtgärden
  // (koppla listan, skapa ingest eller visa ingest-info); övriga åtgärder ligger i ⋯-menyn.
  function preparationStep(n: number, label: string, title: string, value: string, ready: boolean, onClick: () => void, menu: ComponentChildren) {
    const status = statusValue(title, value)
    return <FlowStep n={n} label={label} status={status} done={ready} title={`${title}: ${status}`} menu={menu} onClick={onClick} />
  }

  return (
    <OverviewShell
      projectId={p.id}
      header={header}
      modes={<ModeSelector project={p} actions={actions} />}
      player={p.playerUrl ? { url: p.playerUrl, version: playerVersion, preview: { label: 'Preview (live)', variant: 'published', mode: 'live' }, footer: <PlayerFooter project={p} actions={actions} onSettings={() => setPlayerSettings('link')} /> } : null}
      workOpen={playout.open}
      overlays={<>
        {picking && <ListPicker kind={picking} project={p} actions={actions} onClose={() => setPicking(null)} />}
        {playerSettings && (
          <PlayerSettingsDialog
            project={p}
            actions={actions}
            liveHlsUrl={channel?.playbackUrl ?? null}
            ingest={channel ? { channel, streamKey, onTeardown: teardownIngest } : null}
            initialCategory={playerSettings}
            onClose={() => setPlayerSettings(null)}
          />
        )}
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
      <div class="od-flow">
        <ol class="od-flow-steps" aria-label="Förberedelser">
          {preparationStep(1, p.agendaId ? 'Dagordning' : 'Koppla dagordning', 'Dagordning', p.agendaId ? withCount(linkedResourceLabel(agendaResource.data), agendaResource.data?.items.length, 'punkt', 'punkter') : 'Ej kopplad', !!p.agendaId, () => setPicking('agenda'), actionMenu('Dagordning', [
            { label: 'Koppla…', onClick: () => { setOpenMenu(null); setPicking('agenda') } },
            { label: 'Koppla till Meeting...', onClick: () => { setOpenMenu(null); setShowMeeting(true) } },
            { label: 'Använd ej', onClick: () => { void actions.setAgenda(null); markNotUsed('Dagordning') } },
          ]))}
          {preparationStep(2, p.namelistId ? 'Namnlista' : 'Koppla namnlista', 'Namnlista', p.namelistId ? withCount(linkedResourceLabel(nameListResource.data), nameListResource.data?.people.length, 'namn', 'namn') : 'Ej kopplad', !!p.namelistId, () => setPicking('namelist'), actionMenu('Namnlista', [
            { label: 'Koppla…', onClick: () => { setOpenMenu(null); setPicking('namelist') } },
            { label: 'Använd ej', onClick: () => { actions.setNameList(null); markNotUsed('Namnlista') } },
          ]))}
          {preparationStep(3, hasIngest ? 'Ingest' : 'Skapa ingest', 'Ingest', receivingSignal ? 'Signal OK' : hasIngest ? 'Ingen signal' : 'Inte skapad', hasIngest, () => (hasIngest ? setPlayerSettings('ingest') : void createIngest()), actionMenu('Ingest', [
            ...(!hasIngest ? [{ label: 'Skapa', onClick: () => void createIngest() }] : []),
            ...(hasIngest ? [
              { label: 'Visa ingest-info…', onClick: () => { setOpenMenu(null); setPlayerSettings('ingest') } },
              { label: 'Riv', onClick: () => { setOpenMenu(null); setConfirmTeardown(true) }, danger: true },
            ] : []),
          ]))}
        </ol>
        {showIngestInfo && channel && (
          <IngestInfoPanel channel={channel} streamKey={streamKey} onClose={() => onShowIngestInfoChange(false)} onTeardown={teardownIngest} />
        )}
      </div>

      <button class="btn btn-primary ovs-wide" type="button" onClick={playout.openPlayout}>
        <Icon name="playlist_play" size={18} /> Spela ut kapitel
      </button>


      <div class="bw-actions ovs-secondary">
        {onForked && <ForkButton project={p} livePhase={health?.livePhase} onForked={onForked} />}
      </div>
    </OverviewShell>
  )
}

interface ListPickerProps {
  kind: 'agenda' | 'namelist'
  project: Project
  actions: ProjectActions
  onClose: () => void
}

// Koppla dagordning eller namnlista direkt från förberedelsekortet (samma val som i utspelningsvyn, med Ny … som skapar och kopplar).
function ListPicker({ kind, project: p, actions, onClose }: ListPickerProps) {
  const lists = useResource(
    () => (kind === 'agenda' ? client.agendas.list() : client.namelists.list()).then((items) => items.map((item) => ({ id: item.id, name: item.name }))),
    [kind],
  )
  const currentId = kind === 'agenda' ? p.agendaId : p.namelistId

  async function createNew() {
    if (kind === 'agenda') {
      const created = await client.agendas.create({ name: p.name, description: 'Utkast' })
      await actions.setAgenda(created.id)
    } else {
      const created = await client.namelists.create({ name: p.name, description: 'Utkast' })
      actions.setNameList(created.id)
    }
  }

  return (
    <PickerModal
      title={kind === 'agenda' ? (currentId ? 'Byt dagordning' : 'Koppla dagordning') : (currentId ? 'Byt namnlista' : 'Koppla namnlista')}
      items={lists.data ?? []}
      selectedId={currentId}
      onPick={(id) => {
        if (kind === 'agenda') void actions.setAgenda(id)
        else actions.setNameList(id)
        onClose()
      }}
      onCancel={onClose}
      createNewLabel={kind === 'agenda' ? 'Ny dagordning' : 'Ny namnlista'}
      onCreateNew={() => {
        void createNew()
        onClose()
      }}
    />
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
