import { formatHms } from '../../app/time.ts'
import type { Project } from '../../data/types'

// UNG-190: videons längd i projektlistan, hh:mm:ss. Bara en kopplad inspelning med känd längd har någon; annars tomt.
// Servern ger längden för den version som visas (trimmad om en sådan finns, annars originalet).
export function recordingDurationLabel(recording: Project['recording']): string {
  const seconds = recording?.durationSeconds
  return seconds !== undefined && seconds > 0 ? formatHms(seconds) : ''
}
