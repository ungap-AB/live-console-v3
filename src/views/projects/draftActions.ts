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

export interface HeaderInput {
  /** Projektet har publicerats (status från servern). */
  published: boolean
  /** Servern säger att utkastet skiljer sig från det publicerade. */
  serverChanges: boolean
  /** Något är osparat i redigeraren (undertexter, kapitel eller trim). */
  localDirty: boolean
  /** Ett maskinellt undertextutkast väntar på godkännande. */
  needsApproval: boolean
  /** Spara, publicera eller något annat pågår. */
  busy: boolean
  readOnly: boolean
}

export interface HeaderActions {
  /** "Opublicerade ändringar" som märke i rubriken. */
  unpublishedBadge: boolean
  showApprove: boolean
  showPublishChanges: boolean
  publishChangesEnabled: boolean
  showDiscard: boolean
  discardEnabled: boolean
}

export function headerActions(input: HeaderInput): HeaderActions {
  const { published, serverChanges, localDirty, needsApproval, busy, readOnly } = input
  return {
    unpublishedBadge: localDirty || (published && serverChanges),
    showApprove: needsApproval,
    showPublishChanges: published,
    // Det som är osparat sparas först, så knappen går att trycka även då.
    publishChangesEnabled: published && !busy && !readOnly && (serverChanges || localDirty),
    // Att förkasta gäller det som är sparat på servern; osparat ångras med Ångra.
    showDiscard: published && serverChanges,
    discardEnabled: published && serverChanges && !busy && !readOnly,
  }
}

/** Texten efter Publicera ändringar. */
export function publishChangesNotice(result: { captionsPendingApproval: boolean; captionsPublished: boolean }): string {
  if (result.captionsPendingApproval) {
    return 'Ändringarna är publicerade. Undertexterna väntar på godkännande och följde inte med.'
  }
  return result.captionsPublished ? 'Kapitel och undertexter är publicerade.' : 'Ändringarna är publicerade.'
}
