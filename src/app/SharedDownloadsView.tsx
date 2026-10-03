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
      setErrors((prev) => ({ ...prev, [item.id]: err instanceof Error ? err.message : 'Nedladdningen misslyckades.' }))
    } finally {
      setBusyId(null)
    }
  }

  return (
    <div class="login-screen">
      <div class="login-card shared-card">
        <img class="login-logo theme-light-only" src={logoLightUrl} alt="ungap" />
        <img class="login-logo theme-dark-only" src={logoDarkUrl} alt="ungap" />
        {loaded.state === 'loading' && <p class="login-sub" role="status">Hämtar nedladdningar…</p>}
        {loaded.state === 'failed' && (
          <>
            <p class="login-sub">Länken kunde inte kontrolleras</p>
            <p class="login-note">Något gick fel. Försök igen om en stund.</p>
            <button class="btn login-submit" type="button" onClick={() => setAttempt((value) => value + 1)}>Försök igen</button>
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
        <p class="shared-title">Länken fungerar inte</p>
        <p class="login-note">Kontrollera att du har kopierat hela länken. Be annars avsändaren att dela filerna på nytt.</p>
      </>
    )
  }
  if (share.status === 'expired') {
    return (
      <>
        <p class="shared-title">Länken har gått ut</p>
        <p class="login-note">Be avsändaren att dela filerna på nytt.</p>
      </>
    )
  }
  if (share.status === 'revoked') {
    return (
      <>
        <p class="shared-title">Länken är återkallad</p>
        <p class="login-note">Avsändaren har dragit tillbaka delningen. Kontakta avsändaren om du behöver filerna.</p>
      </>
    )
  }

  const items = share.items ?? []
  return (
    <>
      <p class="shared-title">
        {share.senderName ?? 'Någon'} har delat {items.length === 1 ? 'en fil' : `${items.length} filer`} med dig
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
                <span class="shared-size">Inte längre tillgänglig</span>
              ) : (
                <button class="btn btn-sm btn-primary" type="button" disabled={busyId === item.id} onClick={() => onDownload(item)}>
                  {busyId === item.id ? 'Hämtar…' : 'Ladda ner'}
                </button>
              )}
              {errors[item.id] && <span class="shared-error" role="alert">{errors[item.id]}</span>}
            </li>
          )
        })}
      </ul>
      {share.expiresAtUtc && <p class="shared-note">Länken gäller till {formatDateTime(share.expiresAtUtc)}.</p>}
    </>
  )
}
