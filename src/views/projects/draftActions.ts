// UNG-245: ren logik för utkastet i redigeraren: vad som är osparat, vilka knappar som visas och vad som skickas vid Spara. Testas utan DOM.

export interface TrimValues {
  start: number
  end: number
  savedStart: number
  savedEnd: number
}

/** Trimningen i redigeraren skiljer sig från den sparade. */
export function trimChanged(trim: TrimValues | undefined): boolean {
  return Boolean(trim) && (trim!.start !== trim!.savedStart || trim!.end !== trim!.savedEnd)
}

interface ServerChapterLike {
  label: string
  offsetSeconds: number
}

/**
 * Det som sparas som trimutkast: intervallet och kapitellistan i serverns ordning (index = position i listan med alla kapitel, så att
 * ondemand-vyn kan fylla i sparade tider ur den). Kapitlen sparas i sin egen ordning, så listan ska läsas om efter en kapitelsparning.
 */
export function trimDraftPayload(start: number, end: number, serverChapters: readonly ServerChapterLike[]) {
  return {
    startOffsetSeconds: Math.round(start),
    endOffsetSeconds: Math.round(end),
    chapters: serverChapters.map((chapter, index) => ({ index, label: chapter.label, offsetSeconds: chapter.offsetSeconds })),
  }
}

interface TrimSource {
  startOffsetSeconds: number
  endOffsetSeconds: number
}

/**
 * UNG-290: trimningen som översikten utgår från. Ett sparat trimutkast vinner alltid över inspelningens trimning (annars hela
 * inspelningen), oavsett i vilken ordning projektet och inspelningen kommer. Null = inget att utgå från än (behåll det som visas).
 */
export function overviewTrim(
  draft: TrimSource | null | undefined,
  recording: { durationSeconds: number; trimRange?: TrimSource | null } | null | undefined,
): { start: number; end: number } | null {
  if (draft) return { start: draft.startOffsetSeconds, end: draft.endOffsetSeconds }
  if (!recording) return null
  return {
    start: recording.trimRange?.startOffsetSeconds ?? 0,
    end: recording.trimRange?.endOffsetSeconds ?? recording.durationSeconds,
  }
}

export interface HeaderInput {
  /** Projektet har publicerats (status från servern). */
  published: boolean
  /** Servern säger att utkastet skiljer sig från det publicerade. */
  serverChanges: boolean
  /** Något är osparat i redigeraren (undertexter, kapitel eller trim). */
  localDirty: boolean
  /** Spara, publicera eller något annat pågår. */
  busy: boolean
  readOnly: boolean
}

export interface HeaderActions {
  /** "Opublicerade ändringar" som märke i rubriken. */
  unpublishedBadge: boolean
  showPublishChanges: boolean
  publishChangesEnabled: boolean
  showDiscard: boolean
  discardEnabled: boolean
}

export function headerActions(input: HeaderInput): HeaderActions {
  const { published, serverChanges, localDirty, busy, readOnly } = input
  return {
    unpublishedBadge: localDirty || (published && serverChanges),
    showPublishChanges: published,
    // Det som är osparat sparas först, så knappen går att trycka även då.
    publishChangesEnabled: published && !busy && !readOnly && (serverChanges || localDirty),
    // Att förkasta gäller det som är sparat på servern; osparat ångras med Ångra.
    showDiscard: published && serverChanges,
    discardEnabled: published && serverChanges && !busy && !readOnly,
  }
}

/** Texten efter Publicera ändringar. */
export function publishChangesNotice(result: { captionsPublished: boolean }): string {
  return result.captionsPublished ? 'Kapitel och undertexter är publicerade.' : 'Ändringarna är publicerade.'
}

// ---- UNG-246: konflikt i utkastet ----

/** Det som gick att göra i redigeraren och som kan stoppas av en konflikt (och göras om efter "Skriv över"). */
export type DraftAction = 'save' | 'publish' | 'discard'

/** Felkoder som betyder att någon annan har sparat sedan redigeraren öppnades: utkastet (draft_conflict) eller undertexterna (version_conflict). */
export function isConflictCode(code: string | undefined): boolean {
  return code === 'draft_conflict' || code === 'version_conflict'
}

export interface ConflictInfo {
  action: DraftAction
  /** Undertexterna har en nyare version på servern än den redigeraren utgick från. */
  captionsChanged: boolean
  /** Vem som sparade undertexterna senast, om servern vet det. */
  captionsChangedBy?: string | null
}

/** Vad som har ändrats av den andre, så långt servern kan säga det. */
export function conflictDescription(info: ConflictInfo): string {
  if (info.captionsChanged) {
    const who = info.captionsChangedBy?.trim()
    return `${who || 'Någon annan'} har sparat undertexterna sedan du öppnade redigeraren.`
  }
  return 'Någon annan har ändrat kapitel eller trimning sedan du öppnade redigeraren.'
}

/** Knappen som gör om det som stoppades, med dina ändringar ovanpå det som nu finns på servern. */
export function overwriteLabel(action: DraftAction): string {
  switch (action) {
    case 'publish': return 'Skriv över och publicera'
    case 'discard': return 'Förkasta ändå'
    default: return 'Skriv över'
  }
}
