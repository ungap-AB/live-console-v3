// UNG-175: en replik med fler än 145 tecken markeras i redigeraren. Bara en markering, ingen varning (överfulla repliker är normalläge
// under första genomgången, se UNG-161; varningsregler med räknare och pilar är UNG-144). Gränsen ligger här så den kan ändras på ett ställe.

export const LONG_CUE_CHARS = 145

/** Antal tecken i repliken. Radbrytningar räknas inte (de är layout, inte text). */
export function cueCharCount(text: string): number {
  return text.replace(/[\r\n]/g, '').length
}

export function isLongCue(text: string): boolean {
  return cueCharCount(text) > LONG_CUE_CHARS
}
