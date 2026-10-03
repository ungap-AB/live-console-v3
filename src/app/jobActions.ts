import { client } from '../data'
import type { MediaJob } from '../data/types'

// Hämtar en färsk länk och låter webbläsaren spara filen (Content-Disposition styr filnamnet). Kastar ett
// läsbart fel om filen gått ut — då får operatören förbereda en ny nedladdning själv.
export async function downloadJobFile(job: MediaJob): Promise<void> {
  const link = await client.jobs.downloadLink(job.id)
  const anchor = document.createElement('a')
  anchor.href = link.url
  anchor.download = ''
  anchor.rel = 'noopener'
  document.body.appendChild(anchor)
  anchor.click()
  anchor.remove()
}

export function jobTitle(job: MediaJob): string {
  const what = job.kind === 'download' ? 'Nedladdning' : 'Uppladdning'
  return `${what} · ${job.projectName ?? job.recordingName ?? 'okänd inspelning'}`
}
