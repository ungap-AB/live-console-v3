import { useEffect } from 'preact/hooks'
import './VideoLightbox.css'

interface VideoLightboxProps {
  title: string
  src: string
  live?: boolean
  onClose: () => void
}

// Ren video-yta, inget annat UI-brus. HLS-URL:erna är fejkade i mock-fasen
// så videon spelas oftast inte upp på riktigt — det är själva lightbox-
// mönstret som byggs här, inte en riktig spelare.
export function VideoLightbox({ title, src, live, onClose }: VideoLightboxProps) {
  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', onKeyDown)
    return () => document.removeEventListener('keydown', onKeyDown)
  }, [onClose])

  return (
    <div class="video-scrim" onClick={onClose}>
      <div class="video-box" onClick={(e) => e.stopPropagation()}>
        <div class="video-bar">
          <span>
            {title}
            {live && <span class="video-live">● Live</span>}
          </span>
          <button class="ib" type="button" onClick={onClose} aria-label="Stäng">
            ✕
          </button>
        </div>
        <video src={src} controls autoPlay playsInline>
          Videon kan inte spelas upp i den här miljön.
        </video>
      </div>
    </div>
  )
}
