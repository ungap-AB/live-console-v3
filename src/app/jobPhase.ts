// Fas för ett mediajobb (MediaConvert), som servern rapporterar i versaler.
const PHASE_LABEL: Record<string, string> = {
  QUEUED: 'Köad',
  PROBING: 'Läser filen',
  TRANSCODING: 'Konverterar',
  UPLOADING: 'Sparar resultatet',
  // Undertextjobb (UNG-124): ljudet görs av MediaConvert, sedan tar en undertextmotor över.
  AUDIO: 'Förbereder ljudet',
  DOWNLOADING: 'Hämtar ljudet',
  PREPARING: 'Förbereder transkriberingen',
  TRANSCRIBING: 'Transkriberar',
  PROCESSING: 'Rättar och bygger undertexter',
  // Talarbyten (UNG-205).
  SPEAKERS: 'Analyserar talarbyten',
}

export function jobPhaseLabel(phase?: string | null): string {
  return (phase && PHASE_LABEL[phase]) || 'Bearbetas'
}
