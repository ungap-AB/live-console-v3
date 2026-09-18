import { useEffect, useState } from 'preact/hooks'
import { client } from '../../data'
import type { Channel, ChannelHealth } from '../../data/types'
import { useResource } from '../../app/useResource'
import { SplitPane } from '../../components/SplitPane'
import { StatusChip } from '../../components/StatusChip'
import { CopyField } from '../../components/CopyField'
import { OverflowMenu } from '../../components/OverflowMenu'
import { RenameModal } from '../../components/RenameModal'
import { ConfirmModal } from '../../components/ConfirmModal'
import { Toast } from '../../components/Toast'
import { formatDateTime } from '../../app/time'

const STALE_DAYS = 30

function isStale(c: Channel): boolean {
  return c.state !== 'live' && c.idleDays >= STALE_DAYS
}

function statusTone(c: Channel): 'live' | 'warn' | 'neutral' {
  if (c.state === 'live') return 'live'
  return isStale(c) ? 'warn' : 'neutral'
}

function statusLabel(c: Channel): string {
  return c.state === 'live' ? 'Sänder' : 'Vilande'
}

function idleText(c: Channel): string {
  if (c.state === 'live') return 'aktiv'
  return c.idleDays === 0 ? 'använd idag' : `oanvänd ${c.idleDays} d`
}

export function LiveResourcesView() {
  const resource = useResource(() => client.channels.list(), [])
  const [channels, setChannels] = useState<Channel[]>([])
  const [quota, setQuota] = useState<{ used: number; limit: number } | null>(null)
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [creating, setCreating] = useState(false)
  const [confirmRotate, setConfirmRotate] = useState<Channel | null>(null)
  const [confirmTeardown, setConfirmTeardown] = useState<Channel | null>(null)
  const [toast, setToast] = useState<string | null>(null)

  useEffect(() => {
    if (resource.data) setChannels(resource.data)
  }, [resource.data])

  useEffect(() => {
    client.channels.quota().then(setQuota)
  }, [])

  useEffect(() => {
    if (!selectedId && channels.length > 0) setSelectedId(channels[0].id)
  }, [channels, selectedId])

  const visible = [...channels].sort(
    (a, b) => Number(b.state === 'live') - Number(a.state === 'live') || b.idleDays - a.idleDays,
  )

  const selected = channels.find((c) => c.id === selectedId) ?? null

  const healthResource = useResource(
    () => (selected?.state === 'live' ? client.channels.health(selected.id) : Promise.resolve(null)),
    [selected?.id, selected?.state],
  )

  async function createChannel(label: string) {
    try {
      const created = await client.channels.create({ label })
      setChannels((prev) => [created, ...prev])
      setSelectedId(created.id)
      setQuota((prev) => (prev ? { ...prev, used: prev.used + 1 } : prev))
      setCreating(false)
    } catch (err) {
      setCreating(false)
      setToast(err instanceof Error ? err.message : 'Kunde inte skapa resursen.')
    }
  }

  function requestNewChannel() {
    if (quota && quota.used >= quota.limit) {
      setToast(`Kanaltaket är nått (${quota.limit}). Riv en vilande resurs först.`)
      return
    }
    setCreating(true)
  }

  async function rotateKey(channel: Channel) {
    await client.channels.rotateKey(channel.id)
    setConfirmRotate(null)
    setToast('Ny stream key genererad. Den gamla slutar gälla omedelbart.')
  }

  async function teardown(channel: Channel) {
    try {
      await client.channels.teardown(channel.id)
      setChannels((prev) => prev.filter((c) => c.id !== channel.id))
      setSelectedId(null)
      setQuota((prev) => (prev ? { ...prev, used: prev.used - 1 } : prev))
    } catch (err) {
      setToast(err instanceof Error ? err.message : 'Kunde inte riva resursen.')
    } finally {
      setConfirmTeardown(null)
    }
  }

  return (
    <div class="view">
      <header>
        <div class="header-list-zone">
          <h1>Live-resurser</h1>
          <span class="spacer" />
          <button class="btn btn-sm" type="button" onClick={requestNewChannel}>
            + Ny
          </button>
        </div>
      </header>

      <div class="content">
        <SplitPane
          listLabel="Live-resurser"
          detailLabel="Vald resurs"
          list={
            <>
              <ul>
                {resource.loading && channels.length === 0 && <li class="none">Laddar…</li>}
                {!resource.loading && visible.length === 0 && <li class="none">Ingen resurs ännu.</li>}
                {visible.map((c) => (
                  <li key={c.id} class={c.id === selectedId ? 'sel' : ''}>
                    <button class="row" type="button" onClick={() => setSelectedId(c.id)}>
                      <span class="rowtop">
                        <span class="nm">{c.label}</span>
                      </span>
                      <span class="meta-row">
                        <StatusChip tone={statusTone(c)} dot>
                          {statusLabel(c)}
                        </StatusChip>
                        <span class="meta meta-mono">
                          {c.name} · {c.project ? 'kopplad' : 'fristående'} · {idleText(c)}
                        </span>
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            </>
          }
          detail={
            !selected ? (
              <div class="docnone">Välj en resurs i listan.</div>
            ) : (
              <ResourceDetail
                channel={selected}
                health={healthResource.data ?? null}
                onRotateKey={() => (selected.state === 'live' ? setConfirmRotate(selected) : rotateKey(selected))}
                onOpenProject={() => selected.project && setToast(`Öppnar projektet: ${selected.project.name}`)}
                onTeardown={() => setConfirmTeardown(selected)}
              />
            )
          }
        />
      </div>

      {creating && (
        <RenameModal
          title="Ny resurs"
          initialValue=""
          onCancel={() => setCreating(false)}
          onSave={createChannel}
        />
      )}

      {confirmRotate && (
        <ConfirmModal
          title="Rotera stream key?"
          confirmLabel="Rotera ändå"
          danger
          onCancel={() => setConfirmRotate(null)}
          onConfirm={() => rotateKey(confirmRotate)}
        >
          <p>Sändning pågår. Att rotera stream key bryter enkoderns anslutning. Fortsätt?</p>
        </ConfirmModal>
      )}

      {confirmTeardown && (
        <ConfirmModal
          title="Riv resurs?"
          confirmLabel="Riv resurs"
          danger
          onCancel={() => setConfirmTeardown(null)}
          onConfirm={() => teardown(confirmTeardown)}
        >
          <p>
            Riv {confirmTeardown.label}? Ingest-server och stream key slutar gälla. Inspelningar i
            videoarkivet påverkas inte.
          </p>
        </ConfirmModal>
      )}

      {toast && <Toast message={toast} onDismiss={() => setToast(null)} />}
    </div>
  )
}

interface ResourceDetailProps {
  channel: Channel
  health: ChannelHealth | null
  onRotateKey: () => void
  onOpenProject: () => void
  onTeardown: () => void
}

function ResourceDetail({ channel: c, health, onRotateKey, onOpenProject, onTeardown }: ResourceDetailProps) {
  const live = c.state === 'live'

  return (
    <>
      <div class="head">
        <h2>
          {c.label}
          <StatusChip tone={statusTone(c)} dot>
            {statusLabel(c)}
          </StatusChip>
          {c.project ? (
            <StatusChip tone="accent">Kopplad till projekt</StatusChip>
          ) : (
            <StatusChip tone="neutral">Fristående</StatusChip>
          )}
          <span class="head-actions">
            <OverflowMenu
              items={[
                {
                  label: 'Riv resurs',
                  danger: true,
                  disabled: live,
                  title: live ? 'Går inte att riva medan signal tas emot' : undefined,
                  onClick: onTeardown,
                },
              ]}
            />
          </span>
        </h2>
        <div class="facts">
          <span>{c.name}</span>
          <span>{c.region}</span>
          <span>
            {c.type} · {c.latencyMode} latency
          </span>
          <span>Skapad {formatDateTime(c.createdAt)}</span>
        </div>
        <div class="tools">
          {c.project && (
            <button class="btn btn-sm" type="button" onClick={onOpenProject}>
              Öppna projektet
            </button>
          )}
          <button class="btn btn-sm" type="button" onClick={onRotateKey}>
            Rotera stream key
          </button>
        </div>
      </div>

      <div class="body">
        <div class="grid grid-fixed4">
          <div>
            <div class="k">Status</div>
            <div class="v">{live ? 'LIVE' : 'OFFLINE'}</div>
          </div>
          <div>
            <div class="k">Senast använd</div>
            <div class="v">{live ? 'sänder nu' : c.lastUsedAt ? formatDateTime(c.lastUsedAt) : 'aldrig använd'}</div>
          </div>
          <div>
            <div class="k">Inspelning</div>
            <div class="v">{c.recording ? 'på' : 'av'}</div>
          </div>
          <div>
            <div class="k">Vilande</div>
            <div class="v">{live ? '–' : `${c.idleDays} dygn`}</div>
          </div>
        </div>

        <div class="cols2">
          <div>
            <div class="block">
              <h3>Anslutning</h3>
              <div class="field-list">
                <CopyField label="Ingest-server" value={c.ingestEndpoint} monospace />
                <CopyField label="Stream key" value={c.streamKeyMasked} monospace />
                <CopyField label="Playback-URL" value={c.playbackUrl} monospace />
                <CopyField label="ARN" value={c.arn} monospace />
              </div>
            </div>

          </div>

          <div class="health">
            <h4>Inkommande signal</h4>
            {live && health ? (
              <dl>
                <dt>Bitrate</dt>
                <dd>{(health.bitrateKbps ?? 0).toLocaleString('sv-SE')} kbps</dd>
                <dt>Upplösning</dt>
                <dd>{health.resolution ?? ''}</dd>
                <dt>Senaste bild</dt>
                <dd>{(health.lastFrameSecondsAgo ?? 0).toLocaleString('sv-SE')} s sedan</dd>
                <dt>Sänder sedan</dt>
                <dd>{health.streamStartedAt ? formatDateTime(health.streamStartedAt) : ''}</dd>
              </dl>
            ) : (
              <p>Ingen signal. Resursen är allokerad och väntar på enkoder.</p>
            )}
          </div>
        </div>

        {live ? (
          <p class="note">Resursen kan inte rivas medan signal tas emot. Stoppa enkodern först.</p>
        ) : isStale(c) ? (
          <p class="note warn">
            Vilande i {c.idleDays} dygn{c.project ? '' : ' utan kopplat projekt'}. Kandidat för
            städning — en allokerad kanal upptar en plats även när den inte kostar något.
          </p>
        ) : (
          <p class="note">Vilande resurser kostar inget men räknas mot kontots kanaltak.</p>
        )}
      </div>
    </>
  )
}
