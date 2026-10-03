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
      setError('Det där verkar inte vara en videofil.')
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
      setError(err instanceof Error ? err.message : 'Uppladdningen misslyckades.')
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
      setHlsError(err instanceof Error ? err.message : 'Adressen kunde inte kopplas.')
    } finally {
      setConnecting(false)
    }
  }

  return (
    <div class="od-upload" aria-label="Ladda upp video">
      <p class="od-upload-title">
        {replacing ? 'Ladda upp en annan video i stället' : `Ladda upp en färdig video till ${projectName}`}
      </p>
      {replacing && <p class="od-empty">Nuvarande inspelning ersätts först när du har godkänt den nya videon.</p>}
      {failed && <p class="od-download-error">Bearbetningen av den uppladdade videon misslyckades. Försök igen, eller prova en annan fil.</p>}
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
          aria-label="Välj videofil"
          disabled={busy}
          onChange={(event) => choose(event.currentTarget.files?.[0] ?? null)}
        />
        <Icon name="upload_file" size={28} />
        {file ? (
          <span><strong>{file.name}</strong> · {formatBytes(file.size)}</span>
        ) : (
          <span>Dra hit en videofil, eller klicka för att välja</span>
        )}
      </label>
      {file && (
        <div class="od-upload-panel">
          <input
            type="text"
            placeholder="Namn på inspelningen"
            aria-label="Namn på inspelningen"
            value={name}
            disabled={busy}
            onInput={(event) => setName(event.currentTarget.value)}
          />
          <button class="btn btn-sm btn-primary" type="button" disabled={busy} onClick={() => void upload()}>
            {uploading ? 'Laddar upp…' : 'Ladda upp'}
          </button>
          <NotifyCheckbox disabled={busy} />
        </div>
      )}
      {uploading && (
        <div class="od-upload-progress" role="status">
          <progress value={progress} max={1} />
          <span>{Math.round(progress * 100)} % — lämna inte sidan förrän uppladdningen är klar</span>
        </div>
      )}
      {status === 'error' && <span class="od-download-error">{error}</span>}

      <div class="od-hls" role="group" aria-label="Egen HLS-URL">
        <p class="od-upload-title">Eller ange en egen HLS-URL</p>
        <p class="od-empty">
          Om videon redan ligger på en egen adress behöver den inte laddas upp. Spellistan (.m3u8) används som den är och
          videon ligger kvar där den är. En sådan video kan inte trimmas och inte laddas ned som MP4.
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
            {connecting ? 'Kontrollerar…' : 'Koppla adress'}
          </button>
        </div>
        {hlsError && <span class="od-download-error" role="alert">{hlsError}</span>}
      </div>

      {onCancel && !busy && (
        <div class="od-upload-panel">
          <button class="btn btn-sm" type="button" onClick={onCancel}>Avbryt</button>
        </div>
      )}
    </div>
  )
}
