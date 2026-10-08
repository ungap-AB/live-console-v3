import { useState } from 'preact/hooks'
import { client } from '../../data'
import { notifyJobsChanged } from '../../app/jobsBus'
import { readNotifyByEmail } from '../../app/notifyPreference'
import type { DownloadState } from './RecordingDownload'

// MP4-nedladdning av en inspelning (original eller trimmad, id:t avgör). Servern kör jobbet; ligger en färdig fil redan där får knappen
// länken direkt, annars visas framsteget i jobbfältet och en avisering kommer när filen är klar. En synlig länk (inte window.open), eftersom
// ett sent popup-anrop ofta blockeras tyst efter en flerminuters väntan. Flyttad hit från Ondemand-vyn (UNG-193-uppföljningen).
export function useRecordingDownloads() {
  const [downloads, setDownloads] = useState<Record<string, DownloadState>>({})

  async function start(recordingId: string) {
    setDownloads((prev) => ({ ...prev, [recordingId]: { status: 'starting' } }))
    try {
      const job = await client.recordings.startDownload(recordingId, { notifyByEmail: readNotifyByEmail() })
      if (job.url) {
        setDownloads((prev) => ({ ...prev, [recordingId]: { status: 'ready', url: job.url } }))
      } else {
        setDownloads((prev) => ({ ...prev, [recordingId]: { status: 'queued' } }))
        notifyJobsChanged()
      }
    } catch (error) {
      setDownloads((prev) => ({
        ...prev,
        [recordingId]: { status: 'error', message: error instanceof Error ? error.message : 'Nedladdningen kunde inte förberedas.' },
      }))
    }
  }

  return { downloads, start }
}
