import { useEffect, useState } from 'preact/hooks'
import { client } from '../../data'
import type { Channel, ChannelHealth, Project } from '../../data/types'
import { useResource } from '../../app/useResource'
import { Clock } from '../../components/Clock'
import { ConfirmModal } from '../../components/ConfirmModal'
import { Icon } from '../../components/Icon'
import type { ProjectActions } from './actions'
import { IngestInfo } from './IngestInfo'
import { PlayoutColumns } from './PlayoutColumns'
import './BeforeWorkspace.css'

interface BeforeWorkspaceProps {
  project: Project
  actions: ProjectActions
  channel: Channel | null
  health: ChannelHealth | null
  streamKey: string | null
  refresh: () => Promise<void>
  stopPolling: () => void
}

interface StatusItem {
  label: string
  value: string
  ready: boolean
}

// Arbetsyta för förberedelser i läget Before. Statusraden är passiv
// information — kopplingarna är frivilliga och inget är ett tvingande steg.
export function BeforeWorkspace({ project: p, actions, channel, health, streamKey, refresh, stopPolling }: BeforeWorkspaceProps) {
  const agendaResource = useResource(
    () => (p.agendaId ? client.agendas.get(p.agendaId) : Promise.resolve(undefined)),
    [p.agendaId],
  )
  const nameListResource = useResource(
    () => (p.namelistId ? client.namelists.get(p.namelistId) : Promise.resolve(undefined)),
    [p.namelistId],
  )
  const [showIngestInfo, setShowIngestInfo] = useState(false)
  const [confirmTeardown, setConfirmTeardown] = useState(false)
  const [draft, setDraft] = useState(p.beforeText)
  const [saving, setSaving] = useState(false)

  // Nytt värde utifrån (annat fönster, sparat) ersätter utkastet bara när det inte redigeras.
  useEffect(() => setDraft(p.beforeText), [p.beforeText])

  const hasIngest = p.channel !== null
  const receivingSignal = health?.livePhase === 'live'
  const dirty = draft !== p.beforeText

  const status: StatusItem[] = [
    { label: 'Dagordning', value: p.agendaId ? (agendaResource.data?.name ?? 'Kopplad') : 'Ej kopplad', ready: !!p.agendaId },
    { label: 'Namnlista', value: p.namelistId ? (nameListResource.data?.name ?? 'Kopplad') : 'Ej kopplad', ready: !!p.namelistId },
    { label: 'Ingest', value: hasIngest ? 'Skapad' : 'Inte skapad', ready: hasIngest },
    { label: 'Signal', value: receivingSignal ? 'Signal OK' : 'Ingen signal', ready: receivingSignal },
    { label: 'Spelare', value: p.visibility === 'open' ? 'Öppen' : 'Stängd', ready: p.visibility === 'open' },
  ]

  async function createIngest() {
    await actions.createChannel()
    await refresh()
  }

  async function teardownIngest() {
    setConfirmTeardown(false)
    setShowIngestInfo(false)
    // Kanalen är borta direkt efter teardown — stoppa pollningen i stället för
    // att hälsokolla ett id som inte finns (se useLiveChannel.refresh-racet).
    stopPolling()
    await actions.teardownChannel()
  }

  async function saveBeforeText() {
    setSaving(true)
    try {
      await actions.rename(p.name, { beforeText: draft })
    } finally {
      setSaving(false)
    }
  }

  return (
    <div class="bw">
      <div class="bw-title-row">
        <h2>Förberedelser</h2>
        <span class="bw-clock">
          <Clock />
        </span>
      </div>

      <ul class="bw-status" aria-label="Status för förberedelser">
        {status.map((item) => (
          <li key={item.label} class={item.ready ? 'is-ready' : 'is-pending'}>
            <Icon name={item.ready ? 'check_circle' : 'radio_button_unchecked'} size={20} />
            <span class="bw-status-text">
              <span class="bw-status-label">{item.label}</span>
              <span class="bw-status-value">
                {item.value}
                <span class="sr-only">{item.ready ? ' – klart' : ' – inte klart'}</span>
              </span>
            </span>
          </li>
        ))}
      </ul>

      <section class="bw-ingest" aria-label="Ingest">
        {!hasIngest ? (
          <div class="bw-ingest-row">
            <p>Skapa en ingest-resurs för att kunna ta emot signal från enkodern.</p>
            <button class="btn btn-primary" type="button" onClick={() => void createIngest()}>
              Skapa ingest
            </button>
          </div>
        ) : (
          <>
            <div class="bw-ingest-row">
              <p>Ingest är skapad. Ange servern och stream key i enkodern för att skicka signal.</p>
              <button class="btn" type="button" aria-expanded={showIngestInfo} onClick={() => setShowIngestInfo((v) => !v)}>
                {showIngestInfo ? 'Dölj ingest-info' : 'Visa ingest-info'}
              </button>
              <button
                class="btn btn-danger-ghost"
                type="button"
                disabled={receivingSignal}
                title={receivingSignal ? 'Går inte att riva medan signal tas emot' : undefined}
                onClick={() => setConfirmTeardown(true)}
              >
                Riv ingest
              </button>
            </div>
            {showIngestInfo && (
              <div class="bw-ingest-info">
                <IngestInfo channel={channel} streamKey={streamKey} />
              </div>
            )}
          </>
        )}
      </section>

      <div class="bw-message">
        <label for="bw-before-text">Before-meddelande – visas för publiken tills du går till Live</label>
        <div class="bw-message-row">
          <textarea
            id="bw-before-text"
            rows={2}
            value={draft}
            onInput={(e) => setDraft((e.target as HTMLTextAreaElement).value)}
          />
          <button class="btn" type="button" disabled={!dirty || saving} onClick={() => void saveBeforeText()}>
            Spara
          </button>
        </div>
      </div>

      <PlayoutColumns project={p} actions={actions} />

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
    </div>
  )
}
