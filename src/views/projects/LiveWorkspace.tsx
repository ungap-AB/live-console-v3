import { client } from '../../data'
import type { Channel, ChannelHealth, Project } from '../../data/types'
import { useResource } from '../../app/useResource'
import { useLayoutEffect, useRef, useState } from 'preact/hooks'
import type { ProjectActions } from './actions'
import { PlayoutColumns } from './PlayoutColumns'
import './LiveWorkspace.css'

interface LiveWorkspaceProps {
  project: Project
  actions: ProjectActions
  channel: Channel | null
  health: ChannelHealth | null
  streamKey: string | null
}

// Ren sändningskontroll för läget Live.
export function LiveWorkspace({ project: p, actions, health }: LiveWorkspaceProps) {
  const agendaResource = useResource(
    () => (p.agendaId ? client.agendas.get(p.agendaId) : Promise.resolve(undefined)),
    [p.agendaId],
  )
  const nameListResource = useResource(
    () => (p.namelistId ? client.namelists.get(p.namelistId) : Promise.resolve(undefined)),
    [p.namelistId],
  )
  const phase = health?.livePhase
  const agendaPanelRef = useRef<HTMLDivElement>(null)
  const agendaValueRef = useRef<HTMLSpanElement>(null)
  const [agendaPanelMinHeight, setAgendaPanelMinHeight] = useState<number | null>(null)
  const [layoutWidth, setLayoutWidth] = useState(() => window.innerWidth)

  const nowItem =
    p.playout.currentAgendaItem?.label ??
    agendaResource.data?.items.find((it) => it.id === p.playout.currentAgendaItemId)?.title ??
    null
  const nowSpeaker =
    p.playout.currentPerson?.label ??
    nameListResource.data?.people.find((pe) => pe.id === p.playout.currentPersonId)?.name ??
    null
  const nowExclamation = p.playout.currentExclamation?.label ?? null

  useLayoutEffect(() => {
    const panel = agendaPanelRef.current
    const value = agendaValueRef.current
    const titles = agendaResource.data?.items.map((item) => item.title).filter(Boolean) ?? []
    if (!panel || !value || titles.length === 0) return

    const valueRow = value.parentElement
    const actionButton = valueRow?.querySelector('button')
    const width = (valueRow?.clientWidth ?? value.clientWidth) - (actionButton?.clientWidth ?? 0) - 8
    if (width <= 0) return

    const style = getComputedStyle(value)
    const probe = document.createElement('span')
    probe.style.position = 'absolute'
    probe.style.visibility = 'hidden'
    probe.style.pointerEvents = 'none'
    probe.style.width = `${width}px`
    probe.style.font = style.font
    probe.style.lineHeight = style.lineHeight
    probe.style.fontWeight = style.fontWeight
    probe.style.whiteSpace = 'normal'
    probe.style.overflowWrap = 'anywhere'
    probe.textContent = titles.reduce((longest, title) => title.length > longest.length ? title : longest, '')
    document.body.appendChild(probe)

    const panelStyle = getComputedStyle(panel)
    const nextHeight = Math.ceil(probe.getBoundingClientRect().height)
      + parseFloat(panelStyle.paddingTop)
      + parseFloat(panelStyle.paddingBottom)
      + parseFloat(panelStyle.borderTopWidth)
      + parseFloat(panelStyle.borderBottomWidth)
    document.body.removeChild(probe)
    setAgendaPanelMinHeight(nextHeight)
  }, [agendaResource.data?.items, layoutWidth, nowItem])

  useLayoutEffect(() => {
    const handleResize = () => setLayoutWidth(window.innerWidth)
    window.addEventListener('resize', handleResize)
    return () => window.removeEventListener('resize', handleResize)
  }, [])

  const panels: { key: string; label: string; value: string | null; clearLabel: string; onClear: () => void }[] = [
    { key: 'item', label: '', value: nowItem, clearLabel: 'Rensa ärende i bild', onClear: () => actions.clear('agendaItem') },
    { key: 'person', label: '', value: nowSpeaker, clearLabel: 'Rensa talare i bild', onClear: () => actions.clear('person') },
  ]
  if (p.meetingBindingId) {
    panels.push({
      key: 'exclamation',
      label: 'Tillfällig talare',
      value: nowExclamation,
      clearLabel: 'Rensa tillfällig talare',
      onClear: () => actions.clear('exclamation'),
    })
  }

  return (
    <div class="lw">
      {phase === 'signalInterrupted' && (
        <div class="lw-interrupt" role="alert">
          <p>Signalavbrott — videosignalen har avbrutits medan spelaren är öppen.</p>
          <button class="btn btn-sm" type="button" onClick={() => void actions.interruptionDecision('wait_for_reconnect')}>
            Invänta återanslutning
          </button>
          <button class="btn btn-danger btn-sm" type="button" onClick={() => void actions.interruptionDecision('end')}>
            Stäng player och avsluta
          </button>
        </div>
      )}

      <div class="lw-now">
        {panels.map((panel) => (
          <div
            key={panel.key}
            ref={panel.key === 'item' ? agendaPanelRef : undefined}
            class={`lw-now-panel${panel.value ? ' is-active' : ''}`}
            style={panel.key === 'item' && agendaPanelMinHeight ? { minHeight: `${agendaPanelMinHeight}px` } : undefined}
          >
            {panel.label && <span class="lw-now-label">{panel.label}</span>}
            <span class="lw-now-value">
              <span ref={panel.key === 'item' ? agendaValueRef : undefined}>{panel.value ?? '–'}</span>
              {panel.value && (
                <button class="pv-icon-btn" type="button" aria-label={panel.clearLabel} title={panel.clearLabel} onClick={panel.onClear}>
                  ✕
                </button>
              )}
            </span>
          </div>
        ))}
      </div>

      <PlayoutColumns project={p} actions={actions} live />
    </div>
  )
}
