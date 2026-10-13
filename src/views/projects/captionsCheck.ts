import { t } from '@lingui/core/macro'
import type { ProjectCaptions } from '../../data/types'

export const MAX_CAPTION_FILE_BYTES = 2 * 1024 * 1024

/** Klientsidans förkontroll av filen — servern kontrollerar innehållet (WEBVTT-huvud, tidsangivelser, UTF-8). */
export function validateCaptionFile(file: { name: string; size: number }): string | null {
  if (!/\.vtt$/i.test(file.name)) return t`Choose a VTT file (the file name must end in .vtt).`
  if (file.size <= 0) return t`The file is empty.`
  if (file.size > MAX_CAPTION_FILE_BYTES) return t`The file is too large. At most 2 MB.`
  return null
}

function hms(seconds: number): string {
  const total = Math.round(seconds)
  const h = Math.floor(total / 3600)
  const m = Math.floor((total % 3600) / 60)
  const s = total % 60
  return h > 0 ? `${h} h ${m} min` : m > 0 ? `${m} min ${s} s` : `${s} s`
}

/**
 * Varning (inget hinder) när undertextens längd inte stämmer med den publicerade videons — oftast för att filen gjorts
 * från originalet i stället för från den trimmade versionen. Null när längderna rimligen hör ihop.
 */
export function captionsLengthWarning(captions: Pick<ProjectCaptions, 'lastCueEndSeconds'>, videoDurationSeconds: number | undefined): string | null {
  if (!videoDurationSeconds || videoDurationSeconds <= 0) return null
  const end = captions.lastCueEndSeconds
  if (end > videoDurationSeconds + 10) {
    return t`The captions end after the end of the video (${hms(end)} against ${hms(videoDurationSeconds)}). Is the file made from the trimmed, published video?`
  }
  if (videoDurationSeconds > 120 && end < videoDurationSeconds * 0.5) {
    return t`The captions end long before the end of the video (${hms(end)} against ${hms(videoDurationSeconds)}). Check that they belong to this video.`
  }
  return null
}
