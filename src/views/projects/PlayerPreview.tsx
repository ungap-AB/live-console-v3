import { useEffect, useState } from 'preact/hooks'
import { client } from '../../data'
import type { PreviewLink, PublicMode } from '../../data/types'
import { errorMessage } from '../../app/optimistic'
import './PlayerPreview.css'

// Länken gäller i 4 timmar (UNG-253); förnyas i god tid så att en vy som står öppen länge inte tappar spelaren.
const RENEW_LINK_MS = 3 * 60 * 60 * 1000
// Förhandsvisningen pollas tätt, så att ändringar syns inom ett par sekunder (bara operatören tittar).
const PREVIEW_POLL_MS = 2000

/** Spelarens adress för en förhandsvisningslänk: samma spelare som tittarna får, men med ?preview i stället för ?p. */
export function previewPlayerUrl(playerUrl: string, token: string): string {
  const url = new URL(playerUrl, window.location.href)
  url.searchParams.delete('p')
  url.searchParams.set('preview', token)
  url.searchParams.set('pollMs', String(PREVIEW_POLL_MS))
  return url.toString()
}

/** Ett annat läge som spelaren kan visas i, som förhandsvisning (märkt, inte publik). */
export interface PlayerPreviewMode {
  /** Knappens text, t.ex. "Live (förhandsvisning)". */
  label: string
  variant: 'draft' | 'published'
  mode: PublicMode
}

interface PlayerPreviewProps {
  projectId: string
  /** Projektets spelaradress (samma som tittarna får). */
  url: string
  /** Ökar när något publicerats eller sparats, så att spelaren laddas om och visar det nya. */
  version: number
  /** Finns: operatören kan växla mellan det tittarna ser och förhandsvisningen. */
  preview?: PlayerPreviewMode
}

// UNG-252: den riktiga spelaren (live-player-v3) inbäddad i konsolen. UNG-251: alltid synlig i översikten.
// UNG-270: visar alltid det tittarna ser i lägets spelare, publicerat eller inte. Med `preview` kan spelaren i stället visas i ett annat
// läge via en förhandsvisningslänk: Live i Before, Ondemand i After (utkastets kapitel, otrimmad inspelning).
export function PlayerPreview({ projectId, url, version, preview }: PlayerPreviewProps) {
  const [asPreview, setAsPreview] = useState(false)
  const [link, setLink] = useState<PreviewLink | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [renewal, setRenewal] = useState(0)
  const active = asPreview && preview !== undefined

  useEffect(() => {
    if (!active) return
    let cancelled = false
    setLink(null)
    setError(null)
    client.projects.createPreviewLink(projectId, { variant: preview.variant, mode: preview.mode }).then(
      (next) => { if (!cancelled) setLink(next) },
      (reason) => { if (!cancelled) setError(errorMessage(reason)) },
    )
    const id = window.setTimeout(() => setRenewal((value) => value + 1), RENEW_LINK_MS)
    return () => { cancelled = true; window.clearTimeout(id) }
  }, [active, projectId, preview?.variant, preview?.mode, renewal])

  return (
    <section class="pp" aria-label="Förhandsvisning av spelaren">
      {preview && (
        <div class="pp-showas" role="group" aria-label="Visa spelaren som">
          <button type="button" class={!active ? 'is-active' : ''} aria-pressed={!active} onClick={() => setAsPreview(false)}>
            Som tittarna ser den
          </button>
          <button type="button" class={active ? 'is-active' : ''} aria-pressed={active} onClick={() => setAsPreview(true)}>
            {preview.label}
          </button>
        </div>
      )}
      {active ? (
        error ? <p class="pp-note" role="alert">{error}</p>
        : link ? (
          <div class="pp-frame">
            <iframe key={`${link.token}|${version}`} src={previewPlayerUrl(url, link.token)} title="Förhandsvisning av spelaren" allow="autoplay; fullscreen" allowFullScreen />
          </div>
        ) : <p class="pp-note">Förhandsvisningen laddas…</p>
      ) : (
        <div class="pp-frame">
          <iframe key={version} src={url} title="Spelaren som tittarna ser den" allow="autoplay; fullscreen" allowFullScreen />
        </div>
      )}
    </section>
  )
}
