// UNG-211: "Slå på ljudet" över videon i undertextredigeraren. Det är lätt att råka trycka på mute medan en textruta justeras, och undertexten
// ligger över spelarens egna kontroller. Samma tanke som den publika spelaren (VideoStage): en tydlig knapp när det inte hörs något.

export interface SoundState {
  muted: boolean
  volume: number
}

/** Knappen visas när videon är mutad, eller har volym noll (då hörs inget heller). */
export function showUnmute(sound: SoundState): boolean {
  return sound.muted || sound.volume === 0
}

/** Vad ett klick gör: tar bort mute och, om volymen stod på noll, höjer den till full (annars blir det fortfarande tyst). */
export function unmuted(sound: SoundState): SoundState {
  return { muted: false, volume: sound.volume === 0 ? 1 : sound.volume }
}
