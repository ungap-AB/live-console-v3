import { plural, t } from '@lingui/core/macro'
import { useEffect, useState } from 'preact/hooks'
import { client } from '../data'
import type { PublicShare, PublicShareItem } from '../data/types'
import { Icon } from '../components/Icon'
import logoLightUrl from '../images/ungap-presenter-2026-black.png'
import logoDarkUrl from '../images/ungap-presenter-2026-white.png'
import { startBrowserDownload } from './jobActions'
import { formatBytes, formatDateTime } from './time'
import './LoginView.css'
import './SharedDownloadsView.css'

interface SharedDownloadsViewProps {
  token: string
}

type Loaded = { state: 'loading' } | { state: 'failed' } | { state: 'ready'; share: PublicShare }

// UNG-80 steg 4: sidan som öppnas från länken i delningsmejlet, utan inloggning. Sidan hämtar bara information;
// en fil räknas och loggas först när mottagaren klickar på "Ladda ner", så länkskannrar förbrukar ingenting.
export function SharedDownloadsView({ token }: SharedDownloadsViewProps) {
  const [loaded, setLoaded] = useState<Loaded>({ state: 'loading' })
  const [busyId, setBusyId] = useState<string | null>(null)
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [gone, setGone] = useState<string[]>([])
  const [attempt, setAttempt] = useState(0)

  useEffect(() => {
    let cancelled = false
    setLoaded({ state: 'loading' })
    client.publicDownloads.lookup(token).then(
      (share) => { if (!cancelled) setLoaded({ state: 'ready', share }) },
      () => { if (!cancelled) setLoaded({ state: 'failed' }) },
    )
    return () => { cancelled = true }
  }, [token, attempt])

  async function download(item: PublicShareItem) {
    setBusyId(item.id)
    setErrors((prev) => ({ ...prev, [item.id]: '' }))
    try {
      const link = await client.publicDownloads.link(token, item.id)
      startBrowserDownload(link.url)
    } catch (err) {
      const code = (err as { code?: string } | null)?.code
      if (code === 'file_unavailable') setGone((prev) => [...prev, item.id])
      // Delningen hann återkallas eller gå ut medan sidan var öppen: visa rätt besked i stället för ett fel.
      if (code === 'share_invalid') setAttempt((value) => value + 1)
      setErrors((prev) => ({ ...prev, [item.id]: err instanceof Error ? err.message : t`The download failed.` }))
    } finally {
      setBusyId(null)
    }
  }

  return (
    <div class="login-screen">
      <div class="login-card shared-card">
        <img class="login-logo theme-light-only" src={logoLightUrl} alt="ungap" />
        <img class="login-logo theme-dark-only" src={logoDarkUrl} alt="ungap" />
        {loaded.state === 'loading' && <p class="login-sub" role="status">{t`Fetching downloads…`}</p>}
        {loaded.state === 'failed' && (
          <>
            <p class="login-sub">{t`The link could not be checked`}</p>
            <p class="login-note">{t`Something went wrong. Try again in a while.`}</p>
            <button class="btn login-submit" type="button" onClick={() => setAttempt((value) => value + 1)}>{t`Try again`}</button>
          </>
        )}
        {loaded.state === 'ready' && <ShareBody share={loaded.share} busyId={busyId} errors={errors} gone={gone} onDownload={(item) => void download(item)} />}
      </div>
    </div>
  )
}

interface ShareBodyProps {
  share: PublicShare
  busyId: string | null
  errors: Record<string, string>
  gone: string[]
  onDownload: (item: PublicShareItem) => void
}

function ShareBody({ share, busyId, errors, gone, onDownload }: ShareBodyProps) {
  if (share.status === 'unknown') {
    return (
      <>
        <p class="shared-title">{t`The link does not work`}</p>
        <p class="login-note">{t`Check that you copied the whole link. Otherwise ask the sender to share the files again.`}</p>
      </>
    )
  }
  if (share.status === 'expired') {
    return (
      <>
        <p class="shared-title">{t`The link has expired`}</p>
        <p class="login-note">{t`Ask the sender to share the files again.`}</p>
      </>
    )
  }
  if (share.status === 'revoked') {
    return (
      <>
        <p class="shared-title">{t`The link has been revoked`}</p>
        <p class="login-note">{t`The sender has withdrawn the share. Contact the sender if you need the files.`}</p>
      </>
    )
  }

  const items = share.items ?? []
  const sender = share.senderName ?? t`Someone`
  const fileCount = items.length
  return (
    <>
      <p class="shared-title">
        {plural(fileCount, { one: `${sender} has shared one file with you`, other: `${sender} has shared # files with you` })}
      </p>
      {share.message && <p class="shared-message">{share.message}</p>}
      <ul class="shared-list">
        {items.map((item) => {
          const unavailable = !item.available || gone.includes(item.id)
          return (
            <li key={item.id} class="shared-row">
              <Icon name="movie" size={20} />
              <span class="shared-name">
                {item.name}
                {item.sizeBytes ? <span class="shared-size"> · {formatBytes(item.sizeBytes)}</span> : null}
              </span>
              {unavailable ? (
                <span class="shared-size">{t`No longer available`}</span>
              ) : (
                <button class="btn btn-sm btn-primary" type="button" disabled={busyId === item.id} onClick={() => onDownload(item)}>
                  {busyId === item.id ? t`Fetching…` : t`Download`}
                </button>
              )}
              {errors[item.id] && <span class="shared-error" role="alert">{errors[item.id]}</span>}
            </li>
          )
        })}
      </ul>
      {share.expiresAtUtc && <p class="shared-note">{t`The link is valid until ${{ date: formatDateTime(share.expiresAtUtc) }}.`}</p>}
    </>
  )
}
