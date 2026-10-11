import type { ComponentChildren } from 'preact'
import { useEffect, useRef, useState } from 'preact/hooks'
import { Icon } from '../../components/Icon'
import { parsePlayoutLink, playoutHref } from '../../app/projectLink'
import { routeHref } from '../../app/router'
import './PlayoutOverlay.css'

// UNG-268: utspelningsvyns öppna läge följer adressen #/projects/{id}/playout (mönstret från editorn, UNG-250): öppna pushar adressen,
// omladdning och framåt öppnar, bakåt och Stäng stänger. Den öppnas bara med knappen, aldrig av sig själv när signalen går live.
export function usePlayoutAddress(projectId: string) {
  const atPlayout = () => parsePlayoutLink(window.location.hash) === projectId
  const [open, setOpen] = useState(atPlayout)
  // Sant när det ligger en post utan utspelningsvyn bakom dess adress i historiken, så att Stäng kan gå bakåt dit.
  const pushed = useRef(false)
  const openRef = useRef(open)
  openRef.current = open

  useEffect(() => {
    if (!open || atPlayout()) return
    pushed.current = true
    window.location.hash = playoutHref(projectId)
  }, [open, projectId])

  useEffect(() => {
    function onHashChange() {
      // Inget att spara i utspelningen, så bakåt stänger direkt.
      if (atPlayout() !== openRef.current) setOpen(atPlayout())
    }
    window.addEventListener('hashchange', onHashChange)
    return () => window.removeEventListener('hashchange', onHashChange)
  }, [projectId])

  // Lämnas vyn med utspelningen öppen (annat projekt, läget byts) ska adressen inte fortsätta peka på den.
  useEffect(() => () => {
    if (openRef.current && atPlayout()) window.history.replaceState(null, '', routeHref('projects'))
  }, [projectId])

  function close() {
    openRef.current = false
    setOpen(false)
    if (!atPlayout()) return
    if (pushed.current) window.history.back()
    else window.history.replaceState(null, '', routeHref('projects'))
    pushed.current = false
  }

  return { open, openPlayout: () => setOpen(true), closePlayout: close }
}

export type PlayoutAddress = ReturnType<typeof usePlayoutAddress>

interface PlayoutOverlayProps {
  /** Rubriken (förval Utspelning); UNG-255 använder samma ram för Förhandsvisning. */
  title?: string
  label?: string
  projectName: string
  /** Till höger i vyns huvud, före Stäng (i Live: lägesknapparna med paus, signal, tittare och klocka). */
  bar?: ComponentChildren
  onClose: () => void
  children: ComponentChildren
}

// Utspelningen som arbetsvy över hela projektet. Stängs bara med Stäng (inte Esc), så att en tangenttryckning under sändning inte tar
// bort listorna.
export function PlayoutOverlay({ title = 'Utspelning', label = 'Utspelning av kapitel', projectName, bar, onClose, children }: PlayoutOverlayProps) {
  return (
    <div class="po" role="region" aria-label={label}>
      <header class="po-head">
        <h2>{title}</h2>
        <span class="po-sub">{projectName}</span>
        <span class="spacer" />
        {bar}
        <button class="btn btn-sm" type="button" onClick={onClose}>
          <Icon name="close" size={18} /> Stäng
        </button>
      </header>
      <div class="po-body">{children}</div>
    </div>
  )
}
