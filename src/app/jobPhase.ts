import { t } from '@lingui/core/macro'
// Fas för ett mediajobb (MediaConvert), som servern rapporterar i versaler.
function phaseLabels(): Record<string, string> {
  return {
    QUEUED: t`Queued`,
    PROBING: t`Reading the file`,
    TRANSCODING: t`Converting`,
    UPLOADING: t`Saving the result`,
    // Undertextjobb (UNG-124): ljudet görs av MediaConvert, sedan tar en undertextmotor över.
    AUDIO: t`Preparing the audio`,
    DOWNLOADING: t`Fetching the audio`,
    PREPARING: t`Preparing the transcription`,
    TRANSCRIBING: t`Transcribing`,
    PROCESSING: t`Correcting and building captions`,
    // Talarbyten (UNG-205).
    SPEAKERS: t`Analysing speaker changes`,
  }
}

export function jobPhaseLabel(phase?: string | null): string {
  return (phase && phaseLabels()[phase]) || t`Processing`
}
