// Fas för ett mediajobb (MediaConvert), som servern rapporterar i versaler.
const PHASE_LABEL: Record<string, string> = {
  QUEUED: 'Köad',
  PROBING: 'Läser filen',
  TRANSCODING: 'Konverterar',
  UPLOADING: 'Sparar resultatet',
}

export function jobPhaseLabel(phase?: string | null): string {
  return (phase && PHASE_LABEL[phase]) || 'Bearbetas'
}
