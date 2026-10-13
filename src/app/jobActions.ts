import { t } from '@lingui/core/macro'
import { client } from '../data'
import type { MediaJob } from '../data/types'
import { exportFileName } from '../views/projects/chapterExport'
import { saveFile } from '../views/projects/ExportImportDialog'

// Hämtar en färsk länk och låter webbläsaren spara filen (Content-Disposition styr filnamnet). Kastar ett
// läsbart fel om filen gått ut — då får operatören förbereda en ny nedladdning själv.
export async function downloadJobFile(job: MediaJob): Promise<void> {
  const link = await client.jobs.downloadLink(job.id)
  startBrowserDownload(link.url)
}

// Låter webbläsaren spara filen bakom en kortlivad länk (Content-Disposition styr filnamnet). En osynlig
// ankarlänk, inte window.open — ett sent popup-anrop efter en väntan blockeras ofta tyst.
export function startBrowserDownload(url: string): void {
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = ''
  anchor.rel = 'noopener'
  document.body.appendChild(anchor)
  anchor.click()
  anchor.remove()
}

export function jobTitle(job: MediaJob): string {
  const name = job.projectName ?? job.recordingName ?? t`unknown recording`
  if (job.kind === 'download') return t`Download · ${name}`
  if (job.kind === 'captions') return t`Captions · ${name}`
  if (job.kind === 'speakers') return t`Speaker changes · ${name}`
  return t`Upload · ${name}`
}

// UNG-296: ett klart talarbytesjobb ger Word-manuset med talare (publicerad del om projektet är trimmat, annars hela inspelningen).
export async function downloadManuscriptFile(job: MediaJob): Promise<void> {
  if (!job.projectId) return
  const blob = await client.projects.exportManuscriptDocx(job.projectId, 'published')
  saveFile(exportFileName(job.projectName ?? 'manus', 'manus', 'docx'), blob, 'application/vnd.openxmlformats-officedocument.wordprocessingml.document')
}
