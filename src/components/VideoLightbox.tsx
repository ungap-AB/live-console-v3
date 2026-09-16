import { useEffect, useRef, useState } from 'preact/hooks'
import { create, isPlayerSupported } from 'amazon-ivs-player'
import wasmBinary from 'amazon-ivs-player/dist/assets/amazon-ivs-wasmworker.min.wasm?url'
import wasmWorker from 'amazon-ivs-player/dist/assets/amazon-ivs-wasmworker.min.js?url'
import './VideoLightbox.css'

interface VideoLightboxProps {
  title: string
  src: string
  live?: boolean
  onClose: () => void
}

export function VideoLightbox({ title, src, live, onClose }: VideoLightboxProps) {
  const videoRef = useRef<HTMLVideoElement>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', onKeyDown)
    return () => document.removeEventListener('keydown', onKeyDown)
  }, [onClose])

  useEffect(() => {
    const video = videoRef.current
    if (!video) return
    if (!isPlayerSupported) {
      setError('AWS IVS Player kan inte köras i den här webbläsaren.')
      return
    }

    const player = create({ wasmWorker, wasmBinary })
    player.attachHTMLVideoElement(video)
    player.load(src)
    if (live) {
      video.defaultMuted = true
      video.muted = true
      player.play()
    }

    return () => {
      player.pause()
      player.delete()
    }
  }, [live, src])

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
        {error && <div class="video-error">{error}</div>}
        <video ref={videoRef} controls autoPlay={live} playsInline>
          Videon kan inte spelas upp i den här miljön.
        </video>
      </div>
    </div>
  )
}
