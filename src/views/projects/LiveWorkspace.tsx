import { client } from '../../data'
import type { Channel, ChannelHealth, Project, TimelineEvent } from '../../data/types'
import { useResource } from '../../app/useResource'
import { formatLocalTime } from '../../app/time'
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
  const personPanelRef = useRef<HTMLDivElement>(null)
  const personValueRef = useRef<HTMLSpanElement>(null)
  const [nowPanelMinHeight, setNowPanelMinHeight] = useState<number | null>(null)
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

  const latestEvent = (kind: TimelineEvent['kind'], refId: string | null): TimelineEvent | null =>
    refId ? p.playout.timeline.filter((event) => event.kind === kind && event.refId === refId).at(-1) ?? null : null
  const currentAgendaEvent = latestEvent('agendaItem', p.playout.currentAgendaItemId)
  const currentPersonEvent = latestEvent('person', p.playout.currentPersonId)

  useLayoutEffect(() => {
    const measurements = [
      { panel: agendaPanelRef.current, value: agendaValueRef.current, labels: agendaResource.data?.items.map((item) => item.title) ?? [] },
      { panel: personPanelRef.current, value: personValueRef.current, labels: nameListResource.data?.people.map((person) => person.name) ?? [] },
    ].filter((entry) => entry.panel && entry.value && entry.labels.length > 0) as { panel: HTMLDivElement; value: HTMLSpanElement; labels: string[] }[]
    if (measurements.length === 0) return

    const heights = measurements.map(({ panel, value, labels }) => {
      const valueRow = value.parentElement
      const actionButton = valueRow?.querySelector('button')
      const width = (valueRow?.clientWidth ?? value.clientWidth) - (actionButton?.clientWidth ?? 0) - 8
      if (width <= 0) return 0
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
      probe.textContent = labels.filter(Boolean).reduce((longest, label) => label.length > longest.length ? label : longest, '')
      document.body.appendChild(probe)
      const panelStyle = getComputedStyle(panel)
      const height = Math.ceil(probe.getBoundingClientRect().height)
        + parseFloat(panelStyle.paddingTop) + parseFloat(panelStyle.paddingBottom)
        + parseFloat(panelStyle.borderTopWidth) + parseFloat(panelStyle.borderBottomWidth)
      document.body.removeChild(probe)
      return height
    })
    setNowPanelMinHeight(Math.max(...heights))
  }, [agendaResource.data?.items, nameListResource.data?.people, layoutWidth, nowItem, nowSpeaker])

  useLayoutEffect(() => {
    const handleResize = () => setLayoutWidth(window.innerWidth)
    window.addEventListener('resize', handleResize)
    return () => window.removeEventListener('resize', handleResize)
  }, [])

  const panels: { key: string; label: string; value: string | null; occurredAt: string | null; clearLabel: string; onClear: () => void }[] = [
    { key: 'item', label: 'Aktuell punkt', value: nowItem, occurredAt: currentAgendaEvent?.occurredAt ?? null, clearLabel: 'Rensa ärende i bild', onClear: () => actions.clear('agendaItem') },
    { key: 'person', label: 'Aktuell talare', value: nowSpeaker, occurredAt: currentPersonEvent?.occurredAt ?? null, clearLabel: 'Rensa talare i bild', onClear: () => actions.clear('person') },
  ]
  if (p.meetingBindingId) {
    panels.push({
      key: 'exclamation',
      label: 'Tillfällig talare',
      value: nowExclamation,
      occurredAt: null,
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
            ref={panel.key === 'item' ? agendaPanelRef : panel.key === 'person' ? personPanelRef : undefined}
            class={`lw-now-panel${panel.value ? ' is-active' : ''}`}
            style={nowPanelMinHeight ? { minHeight: `${nowPanelMinHeight}px` } : undefined}
          >
            {panel.label && <span class="lw-now-label">{panel.label}</span>}
            <span class="lw-now-value">
              <span ref={panel.key === 'item' ? agendaValueRef : panel.key === 'person' ? personValueRef : undefined}>
                <span>{panel.value ?? '–'}</span>
                {panel.occurredAt && <small class="lw-now-time">{formatLocalTime(panel.occurredAt)}</small>}
              </span>
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
