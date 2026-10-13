import { t } from '@lingui/core/macro'
import { useEffect, useState } from 'preact/hooks'
import { client } from '../../data'
import { readNotifyByEmail } from '../../app/notifyPreference'
import { formatBytes } from '../../app/time'
import { Icon } from '../../components/Icon'
import { NotifyCheckbox } from '../../components/NotifyCheckbox'
import { validateHlsUrl } from './recordingSource'

interface UploadPanelProps {
  projectId: string
  projectName: string
  /** Det finns redan en (ännu opublicerad) video — kortet erbjuder då att ersätta den. */
  replacing: boolean
  failed: boolean
  onUploaded: () => void
  onCancel?: () => void
  /** Anropas när en filöverföring eller adresskoppling startar/slutar, så att en omgivande dialog kan stå kvar under tiden. */
  onBusyChange?: (busy: boolean) => void
}

function withoutExtension(fileName: string): string {
  const dot = fileName.lastIndexOf('.')
  return dot > 0 ? fileName.slice(0, dot) : fileName
}

// UNG-55/56/57: direktuppladdning till S3 med framsteg, sedan startar servern
// HLS-transkodningen. Inspelningar hör alltid till ett projekt (Anders,
// 2026-10-01) — därför finns uppladdningen bara här, inte som fristående bibliotek.
// UNG-102: alternativt en egen HLS-adress. Då kopieras ingenting; servern läser bara metadata ur spellistan.
function uploadProgressText(percent: number): string {
  return t`${percent} % — do not leave the page until the upload is done`
}

export function UploadPanel({ projectId, projectName, replacing, failed, onUploaded, onCancel, onBusyChange }: UploadPanelProps) {
  const [file, setFile] = useState<File | null>(null)
  const [name, setName] = useState('')
  const [status, setStatus] = useState<'idle' | 'uploading' | 'error'>('idle')
  const [progress, setProgress] = useState(0)
  const [error, setError] = useState('')
  const [dragging, setDragging] = useState(false)
  const [hlsUrl, setHlsUrl] = useState('')
  const [connecting, setConnecting] = useState(false)
  const [hlsError, setHlsError] = useState('')
  const uploading = status === 'uploading'
  const busy = uploading || connecting

  // En flera GB stor uppladdning hänger på den här fliken tills den är klar.
  useEffect(() => {
    if (!uploading) return
    const warn = (event: BeforeUnloadEvent) => event.preventDefault()
    window.addEventListener('beforeunload', warn)
    return () => window.removeEventListener('beforeunload', warn)
  }, [uploading])

  useEffect(() => {
    onBusyChange?.(busy)
  }, [busy])

  useEffect(() => () => onBusyChange?.(false), [])

  function choose(next: File | null) {
    if (next && !next.type.startsWith('video/')) {
      setError(t`That does not seem to be a video file.`)
      setStatus('error')
      return
    }
    setFile(next)
    setName(next ? withoutExtension(next.name) : '')
    setStatus('idle')
    setError('')
  }

  async function upload() {
    if (!file) return
    setStatus('uploading')
    setProgress(0)
    setError('')
    try {
      await client.recordings.upload(file, projectId, name.trim() || undefined, setProgress, { notifyByEmail: readNotifyByEmail() })
      setStatus('idle')
      setFile(null)
      setName('')
      onUploaded()
    } catch (err) {
      setStatus('error')
      setError(err instanceof Error ? err.message : t`The upload failed.`)
    }
  }

  async function connect() {
    const problem = validateHlsUrl(hlsUrl)
    if (problem) {
      setHlsError(problem)
      return
    }
    setConnecting(true)
    setHlsError('')
    try {
      await client.recordings.connectExternalHls(projectId, hlsUrl.trim())
      setHlsUrl('')
      onUploaded()
    } catch (err) {
      setHlsError(err instanceof Error ? err.message : t`The address could not be linked.`)
    } finally {
      setConnecting(false)
    }
  }

  return (
    <div class="od-upload" aria-label={t`Upload video`}>
      <p class="od-upload-title">
        {replacing ? t`Upload another video instead` : t`Upload a finished video to ${projectName}`}
      </p>
      {replacing && <p class="od-empty">{t`The current recording is replaced only when you have approved the new video.`}</p>}
      {failed && <p class="od-download-error">{t`Processing the uploaded video failed. Try again, or try another file.`}</p>}
      <label
        class={`od-dropzone${dragging ? ' is-dragging' : ''}${file ? ' has-file' : ''}${busy ? ' is-disabled' : ''}`}
        onDragOver={(event) => { event.preventDefault(); if (!busy) setDragging(true) }}
        onDragLeave={() => setDragging(false)}
        onDrop={(event) => {
          event.preventDefault()
          setDragging(false)
          if (!busy) choose(event.dataTransfer?.files?.[0] ?? null)
        }}
      >
        <input
          type="file"
          accept="video/*"
          aria-label={t`Choose video file`}
          disabled={busy}
          onChange={(event) => choose(event.currentTarget.files?.[0] ?? null)}
        />
        <Icon name="upload_file" size={28} />
        {file ? (
          <span><strong>{file.name}</strong> · {formatBytes(file.size)}</span>
        ) : (
          <span>{t`Drag a video file here, or click to choose`}</span>
        )}
      </label>
      {file && (
        <div class="od-upload-panel">
          <input
            type="text"
            placeholder={t`Name of the recording`}
            aria-label={t`Name of the recording`}
            value={name}
            disabled={busy}
            onInput={(event) => setName(event.currentTarget.value)}
          />
          <button class="btn btn-sm btn-primary" type="button" disabled={busy} onClick={() => void upload()}>
            {uploading ? t`Uploading…` : t`Upload`}
          </button>
          <NotifyCheckbox disabled={busy} />
        </div>
      )}
      {uploading && (
        <div class="od-upload-progress" role="status">
          <progress value={progress} max={1} />
          <span>{uploadProgressText(Math.round(progress * 100))}</span>
        </div>
      )}
      {status === 'error' && <span class="od-download-error">{error}</span>}

      <div class="od-hls" role="group" aria-label={t`Own HLS URL`}>
        <p class="od-upload-title">{t`Or enter your own HLS URL`}</p>
        <p class="od-empty">
          {t`If the video is already at an address of its own, it does not need to be uploaded. The playlist (.m3u8) is used as it is and the video stays where it is. Such a video cannot be trimmed or downloaded as MP4.`}
        </p>
        <div class="od-upload-panel">
          <input
            type="url"
            placeholder="https://…/master.m3u8"
            aria-label="HLS-URL"
            value={hlsUrl}
            disabled={busy}
            onInput={(event) => { setHlsUrl(event.currentTarget.value); setHlsError('') }}
            onKeyDown={(event) => { if (event.key === 'Enter') void connect() }}
          />
          <button class="btn btn-sm btn-primary" type="button" disabled={busy || !hlsUrl.trim()} onClick={() => void connect()}>
            {connecting ? t`Checking…` : t`Link address`}
          </button>
        </div>
        {hlsError && <span class="od-download-error" role="alert">{hlsError}</span>}
      </div>

      {onCancel && !busy && (
        <div class="od-upload-panel">
          <button class="btn btn-sm" type="button" onClick={onCancel}>{t`Cancel`}</button>
        </div>
      )}
    </div>
  )
}
