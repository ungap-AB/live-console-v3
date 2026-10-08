import { client } from '../../data'
import type { Chapter } from '../../data/types'
import { videoWindowOf, type VideoWindow } from './chapterExport'

export interface ChapterExportData {
  chapters: Chapter[]
  window: VideoWindow
}

// UNG-193: hämtar det exporten behöver — kapitellistan och den publicerade videons fönster. Läses vid behov (inte i projektlistan), så att
// listan inte får en fråga per rad; en genväg i ...-menyn laddar först när man klickar.
export async function loadChapterExportData(projectId: string, recordingId: string): Promise<ChapterExportData> {
  const [chapters, recording] = await Promise.all([client.projects.chapters(projectId), client.recordings.get(recordingId)])
  if (!recording) throw new Error('Videon hittades inte.')
  return { chapters, window: videoWindowOf(recording) }
}
