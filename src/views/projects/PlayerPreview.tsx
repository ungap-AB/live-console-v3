import { useState } from 'preact/hooks'
import './PlayerPreview.css'

interface PlayerPreviewProps {
  /** Projektets spelaradress (samma som tittarna får). */
  url: string
  /** Publicerat: då finns något att visa. Annars förklaras varför inte. */
  published: boolean
  /** Ökar när något publicerats eller sparats, så att spelaren laddas om och visar det nya. */
  version: number
}

// UNG-252: den riktiga spelaren (live-player-v3) inbäddad i konsolen, så att operatören ser exakt det tittarna ser (kapitelpanel,
// undertexter, dagordning). Steg 1: bara det publicerade. Förhandsvisning av utkastet kommer i UNG-253/254.
export function PlayerPreview({ url, published, version }: PlayerPreviewProps) {
  const [open, setOpen] = useState(false)
  return (
    <section class="pp" aria-label="Förhandsvisning av spelaren">
      <button class="btn btn-sm" type="button" aria-expanded={open} onClick={() => setOpen(!open)}>
        {open ? 'Dölj förhandsvisningen' : 'Förhandsvisa som tittare'}
      </button>
      {open && (
        published ? (
          <div class="pp-frame">
            <iframe key={version} src={url} title="Förhandsvisning av spelaren" allow="autoplay; fullscreen" allowFullScreen />
          </div>
        ) : (
          <p class="pp-note">Förhandsvisningen visar det som är publicerat, och finns därför först när projektet har publicerats.</p>
        )
      )}
    </section>
  )
}
