import { client } from '../../data'
import type { Recording } from '../../data/types'

// Delad av ProjectDetail och Playout — TrimDialog vill alltid ha originalet
// (en redan trimmad inspelning trimmas om från sin förälder, inte från sig själv).
export async function resolveOriginalRecordingForTrim(recordingId: string): Promise<Recording | null> {
  const recording = await client.recordings.get(recordingId)
  if (!recording) return null
  if (recording.kind === 'trimmed' && recording.parentId) {
    return (await client.recordings.get(recording.parentId)) ?? null
  }
  return recording
}
