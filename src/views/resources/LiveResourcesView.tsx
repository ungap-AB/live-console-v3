import { t } from '@lingui/core/macro'
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
import { EditIcon } from '../../components/icons'
import { formatDateTime } from '../../app/time'
import { errorMessage, runOptimistic } from '../../app/optimistic'
import { formatNumber } from '../../i18n'

const STALE_DAYS = 30

function isStale(c: Channel): boolean {
  return c.state !== 'live' && c.idleDays >= STALE_DAYS
}

function statusTone(c: Channel): 'live' | 'warn' | 'neutral' {
  if (c.state === 'live') return 'live'
  return isStale(c) ? 'warn' : 'neutral'
}

function statusLabel(c: Channel): string {
  return c.state === 'live' ? t`Broadcasting` : t`Idle`
}

function idleText(c: Channel): string {
  if (c.state === 'live') return t`active`
  const days = c.idleDays
  return days === 0 ? t`used today` : t`unused ${days} d`
}

function openingProjectText(name: string): string {
  return t`Opening the project: ${name}`
}

function latencyText(c: Channel): string {
  const type = c.type
  const latencyMode = c.latencyMode
  return t`${type} · ${latencyMode} latency`
}

function createdText(iso: string): string {
  const created = formatDateTime(iso)
  return t`Created ${created}`
}

function idleDaysText(days: number): string {
  return t`${days} days`
}

function secondsAgoText(value: number): string {
  const seconds = formatNumber(value)
  return t`${seconds} s ago`
}

function staleText(c: Channel): string {
  const days = c.idleDays
  return c.project
    ? t`Idle for ${days} days. Candidate for cleanup — an allocated channel takes up a slot even when it costs nothing.`
    : t`Idle for ${days} days without a linked project. Candidate for cleanup — an allocated channel takes up a slot even when it costs nothing.`
}

export function LiveResourcesView() {
  const resource = useResource(() => client.channels.list(), [])
  const [channels, setChannels] = useState<Channel[]>([])
  const [quota, setQuota] = useState<{ used: number; limit: number } | null>(null)
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [creating, setCreating] = useState(false)
  const [renaming, setRenaming] = useState<Channel | null>(null)
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
      setToast(err instanceof Error ? err.message : t`Could not create the resource.`)
    }
  }

  function requestNewChannel() {
    if (quota && quota.used >= quota.limit) {
      const limit = quota.limit
      setToast(t`The channel limit is reached (${limit}). Tear down an idle resource first.`)
      return
    }
    setCreating(true)
  }

  // UNG-105: the new name shows immediately; on failure it is restored and a toast shows the error.
  function patchChannelLabel(id: string, label: string) {
    setChannels((prev) => prev.map((c) => (c.id === id ? { ...c, label } : c)))
  }

  function renameChannel(channel: Channel, label: string) {
    setRenaming(null)
    void runOptimistic({
      key: `channel:${channel.id}`,
      apply: () => {
        patchChannelLabel(channel.id, label)
        return () => patchChannelLabel(channel.id, channel.label)
      },
      request: () => client.channels.rename(channel.id, label),
      onSuccess: (updated) => setChannels((prev) => prev.map((c) => (c.id === updated.id ? updated : c))),
      onError: (err) => setToast(errorMessage(err, t`Could not rename.`)),
    })
  }

  async function rotateKey(channel: Channel) {
    await client.channels.rotateKey(channel.id)
    setConfirmRotate(null)
    setToast(t`New stream key generated. The old one stops working immediately.`)
  }

  async function teardown(channel: Channel) {
    try {
      await client.channels.teardown(channel.id)
      setChannels((prev) => prev.filter((c) => c.id !== channel.id))
      setSelectedId(null)
      setQuota((prev) => (prev ? { ...prev, used: prev.used - 1 } : prev))
    } catch (err) {
      setToast(err instanceof Error ? err.message : t`Could not tear down the resource.`)
    } finally {
      setConfirmTeardown(null)
    }
  }

  const teardownLabel = confirmTeardown?.label ?? ''

  return (
    <div class="view">
      <header>
        <div class="header-list-zone">
          <h1>{t`Live resources`}</h1>
          <span class="spacer" />
          <button class="btn btn-sm" type="button" onClick={requestNewChannel}>
            {t`+ New`}
          </button>
        </div>
      </header>

      <div class="content">
        <SplitPane
          listLabel={t`Live resources`}
          detailLabel={t`Selected resource`}
          list={
            <>
              <ul>
                {resource.loading && channels.length === 0 && <li class="none">{t`Loading…`}</li>}
                {!resource.loading && visible.length === 0 && <li class="none">{t`No resource yet.`}</li>}
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
                          {c.name} · {c.project ? t`linked` : t`standalone`} · {idleText(c)}
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
              <div class="docnone">{t`Select a resource in the list.`}</div>
            ) : (
              <ResourceDetail
                channel={selected}
                health={healthResource.data ?? null}
                onRotateKey={() => (selected.state === 'live' ? setConfirmRotate(selected) : rotateKey(selected))}
                onOpenProject={() => selected.project && setToast(openingProjectText(selected.project.name))}
                onTeardown={() => setConfirmTeardown(selected)}
                onRename={() => setRenaming(selected)}
              />
            )
          }
        />
      </div>

      {creating && (
        <RenameModal
          title={t`New resource`}
          initialValue=""
          onCancel={() => setCreating(false)}
          onSave={createChannel}
        />
      )}

      {renaming && (
        <RenameModal
          title={t`Rename the resource`}
          initialValue={renaming.label}
          onCancel={() => setRenaming(null)}
          onSave={(label) => renameChannel(renaming, label)}
        />
      )}

      {confirmRotate && (
        <ConfirmModal
          title={t`Rotate stream key?`}
          confirmLabel={t`Rotate anyway`}
          danger
          onCancel={() => setConfirmRotate(null)}
          onConfirm={() => rotateKey(confirmRotate)}
        >
          <p>{t`A broadcast is in progress. Rotating the stream key breaks the encoder's connection. Continue?`}</p>
        </ConfirmModal>
      )}

      {confirmTeardown && (
        <ConfirmModal
          title={t`Tear down resource?`}
          confirmLabel={t`Tear down resource`}
          danger
          onCancel={() => setConfirmTeardown(null)}
          onConfirm={() => teardown(confirmTeardown)}
        >
          <p>{t`Tear down ${teardownLabel}? The ingest server and stream key stop working. Recordings in the video archive are not affected.`}</p>
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
  onRename: () => void
}

function ResourceDetail({ channel: c, health, onRotateKey, onOpenProject, onTeardown, onRename }: ResourceDetailProps) {
  const live = c.state === 'live'

  return (
    <>
      <div class="head">
        <h2>
          {c.label}
          <button class="ib" type="button" title={t`Rename the resource`} aria-label={t`Rename the resource`} onClick={onRename}>
            <EditIcon />
          </button>
          <StatusChip tone={statusTone(c)} dot>
            {statusLabel(c)}
          </StatusChip>
          {c.project ? (
            <StatusChip tone="accent">{t`Linked to project`}</StatusChip>
          ) : (
            <StatusChip tone="neutral">{t`Standalone`}</StatusChip>
          )}
          <span class="head-actions">
            <OverflowMenu
              items={[
                {
                  label: t`Tear down resource`,
                  danger: true,
                  disabled: live,
                  title: live ? t`Cannot be torn down while a signal is being received` : undefined,
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
            {latencyText(c)}
          </span>
          <span>{createdText(c.createdAt)}</span>
        </div>
        <div class="tools">
          {c.project && (
            <button class="btn btn-sm" type="button" onClick={onOpenProject}>
              {t`Open the project`}
            </button>
          )}
          <button class="btn btn-sm" type="button" onClick={onRotateKey}>
            {t`Rotate stream key`}
          </button>
        </div>
      </div>

      <div class="body">
        <div class="grid grid-fixed4">
          <div>
            <div class="k">{t`Status`}</div>
            <div class="v">{live ? 'LIVE' : 'OFFLINE'}</div>
          </div>
          <div>
            <div class="k">{t`Last used`}</div>
            <div class="v">{live ? t`broadcasting now` : c.lastUsedAt ? formatDateTime(c.lastUsedAt) : t`never used`}</div>
          </div>
          <div>
            <div class="k">{t`Recording`}</div>
            <div class="v">{c.recording ? t`on` : t`off`}</div>
          </div>
          <div>
            <div class="k">{t`Idle`}</div>
            <div class="v">{live ? '–' : idleDaysText(c.idleDays)}</div>
          </div>
        </div>

        <div class="cols2">
          <div>
            <div class="block">
              <h3>{t`Connection`}</h3>
              <div class="field-list">
                <CopyField label={t`Ingest server`} value={c.ingestEndpoint} monospace />
                <CopyField label="Stream key" value={c.streamKeyMasked} monospace />
                <CopyField label={t`Playback URL`} value={c.playbackUrl} monospace />
                <CopyField label="ARN" value={c.arn} monospace />
              </div>
            </div>

          </div>

          <div class="health">
            <h4>{t`Incoming signal`}</h4>
            {live && health ? (
              <dl>
                <dt>{t`Bitrate`}</dt>
                <dd>{formatNumber(health.bitrateKbps ?? 0)} kbps</dd>
                <dt>{t`Resolution`}</dt>
                <dd>{health.resolution ?? ''}</dd>
                <dt>{t`Latest frame`}</dt>
                <dd>{secondsAgoText(health.lastFrameSecondsAgo ?? 0)}</dd>
                <dt>{t`Viewers`}</dt>
                <dd>{typeof health.viewerCount === 'number' ? formatNumber(health.viewerCount) : '–'}</dd>
                <dt>{t`Broadcasting since`}</dt>
                <dd>{health.streamStartedAt ? formatDateTime(health.streamStartedAt) : ''}</dd>
              </dl>
            ) : (
              <p>{t`No signal. The resource is allocated and waiting for an encoder.`}</p>
            )}
          </div>
        </div>

        {live ? (
          <p class="note">{t`The resource cannot be torn down while a signal is being received. Stop the encoder first.`}</p>
        ) : isStale(c) ? (
          <p class="note warn">
            {staleText(c)}
          </p>
        ) : (
          <p class="note">{t`Idle resources cost nothing but count against the account's channel limit.`}</p>
        )}
      </div>
    </>
  )
}
