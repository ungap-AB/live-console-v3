import { useEffect, useRef, useState } from 'preact/hooks'
import { Icon } from '../../components/Icon'
import { editorHref, parseEditorLink } from '../../app/projectLink'
import { routeHref } from '../../app/router'
import { captionEntry, consumeCaptionStudio } from './captionEntryLogic'
import { CaptionStudio } from './CaptionStudio'
import type { EditorChapterTools, EditorTrim } from './CaptionEditor'
import { useCaptionGeneration } from './useCaptionGeneration'

interface CaptionEntryProps {
  projectId: string
  projectName: string
  videoDurationSeconds?: number
  posterUrl?: string | null
  onChanged: () => void
  /** Kapitel sparades i redigeraren. */
  onChaptersChanged?: () => void
  /** Trimningen som redigeraren visar och ändrar (ägs av ondemand-vyn). */
  trim?: EditorTrim
  /** UNG-247: trimningen är låst (publicerat), med en väg till Avpublicera. */
  trimLock?: { onUnpublish: () => void }
  /** UNG-249: projektets uppgifter för kapitelverktygen i redigeraren. */
  chapterTools?: EditorChapterTools
}

// UNG-165: knappen ovanför videofönstret som leder direkt till att skapa eller redigera undertexter. Etiketten följer serverns läge
// (skapa, genererar n %, redigera). Knappen äger också studion (redigeraren med skapandet som overlay) och dess öppna/stängda läge.
export function CaptionEntry({ projectId, projectName, videoDurationSeconds, posterUrl, onChanged, onChaptersChanged, trim, trimLock, chapterTools }: CaptionEntryProps) {
  const captions = useCaptionGeneration(projectId)
  // Öppnas direkt när man kommit hit via knappen i projektlistan, eller (UNG-250) när adressen är editorns (omladdning, delad länk).
  const [open, setOpen] = useState(() => consumeCaptionStudio(projectId) || parseEditorLink(window.location.hash) === projectId)
  // UNG-250: ökas när bakåtknappen ska stänga editorn; editorn frågar då om osparade ändringar precis som Stäng.
  const [closeSignal, setCloseSignal] = useState(0)
  // Sant när det ligger en post utan editorn bakom editorns adress i historiken, så att stängning kan gå bakåt dit.
  const pushed = useRef(false)
  const openRef = useRef(open)
  openRef.current = open

  const atEditor = () => parseEditorLink(window.location.hash) === projectId

  // Öppen editor har sin egen adress (en ny historikpost, så att bakåt stänger den).
  useEffect(() => {
    if (!open || atEditor()) return
    pushed.current = true
    window.location.hash = editorHref(projectId)
  }, [open, projectId])

  useEffect(() => {
    function onHashChange() {
      if (atEditor()) {
        // Framåt till editorns adress öppnar den igen.
        if (!openRef.current) {
          pushed.current = true
          setOpen(true)
        }
      } else if (openRef.current && window.location.hash.startsWith(routeHref('projects'))) {
        // Bakåt: lägg tillbaka editorns adress och be editorn stänga. Stänger den (inget osparat eller bekräftat) går stängningen
        // bakåt igen; avbryts den står man kvar i editorn med rätt adress. Leder bakåt till en annan vy (efter en omladdning) byts vyn.
        window.history.pushState(null, '', editorHref(projectId))
        pushed.current = true
        setCloseSignal((signal) => signal + 1)
      }
    }
    window.addEventListener('hashchange', onHashChange)
    return () => window.removeEventListener('hashchange', onHashChange)
  }, [projectId])

  // Lämnas projektet med editorn öppen (vyn byts) ska adressen inte fortsätta peka på editorn.
  useEffect(() => () => {
    if (openRef.current && atEditor()) window.history.replaceState(null, '', routeHref('projects'))
  }, [projectId])

  function close() {
    openRef.current = false
    setOpen(false)
    void captions.refresh()
    if (!atEditor()) return
    if (pushed.current) window.history.back()
    else window.history.replaceState(null, '', routeHref('projects'))
    pushed.current = false
  }

  const entry = captionEntry(captions.generation)
  if (!entry) return null

  return (
    <>
      <button
        class={`btn btn-sm caption-entry${entry.kind === 'edit' ? ' btn-primary' : ''}`}
        type="button"
        disabled={Boolean(entry.disabledReason)}
        title={entry.disabledReason ?? (entry.kind === 'progress'
          ? 'Undertexterna genereras. Öppna för att följa framsteget.'
          : entry.kind === 'create' ? 'Öppnar redigeraren: trim och kapitel. Undertexter skapas därifrån.' : 'Öppnar undertextredigeraren')}
        onClick={() => setOpen(true)}
      >
        <Icon name={entry.kind === 'create' ? 'edit' : 'closed_caption'} size={18} /> {entry.label}
      </button>
      {open && (
        <CaptionStudio
          projectId={projectId}
          projectName={projectName}
          videoDurationSeconds={videoDurationSeconds}
          posterUrl={posterUrl}
          generation={captions.generation}
          phase={captions.phase}
          setGeneration={captions.setGeneration}
          refresh={captions.refresh}
          onChanged={onChanged}
          onChaptersChanged={onChaptersChanged}
          trim={trim}
          trimLock={trimLock}
          chapterTools={chapterTools}
          closeSignal={closeSignal}
          onClose={close}
        />
      )}
    </>
  )
}
