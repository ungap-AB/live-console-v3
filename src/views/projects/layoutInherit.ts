import type { Project } from '../../data/types.ts'

// UNG-180: spelarens layout som ett värdeobjekt även i konsolen. Listan över fält hålls i takt med serverns `PlayerLayout`
// (Models/Projects/PlayerLayout.cs): ett nytt layoutattribut läggs till i båda, och testet nedan fångar att listan och typen går ihop.

export type LayoutKey = 'beforeText' | 'liveText' | 'afterText' | 'ondemandText' | 'textPlacement' | 'muxEnabled' | 'muxRespectDoNotTrack' | 'posterUrl'

export const LAYOUT_FIELDS: { key: LayoutKey; label: string }[] = [
  { key: 'beforeText', label: 'Text före sändningen (Before)' },
  { key: 'liveText', label: 'Text under livesändningen (Live)' },
  { key: 'afterText', label: 'Text efter sändningen (After)' },
  { key: 'ondemandText', label: 'Text för inspelningen (Ondemand)' },
  { key: 'textPlacement', label: 'Textens placering' },
  { key: 'muxEnabled', label: 'Uppspelningsmätning (Mux)' },
  { key: 'muxRespectDoNotTrack', label: 'Respektera Do Not Track' },
  // Posterbilden kopieras som fil på servern; här jämförs bara om projekten har en bild (adresserna skiljer sig alltid åt).
  { key: 'posterUrl', label: 'Posterbild' },
]

export type LayoutFields = Pick<Project, Exclude<LayoutKey, 'posterUrl'>> & { posterUrl?: string | null }

export function layoutOf(project: LayoutFields): LayoutFields {
  return {
    beforeText: project.beforeText,
    liveText: project.liveText,
    afterText: project.afterText,
    ondemandText: project.ondemandText,
    textPlacement: project.textPlacement,
    muxEnabled: project.muxEnabled,
    muxRespectDoNotTrack: project.muxRespectDoNotTrack,
    posterUrl: project.posterUrl ?? null,
  }
}

export interface LayoutSourceOption {
  id: string
  name: string
}

/** Projekten man kan utgå från, senast skapade först. Det projekt som själv ska få layouten (om det finns) utelämnas. */
export function layoutSourceOptions(projects: readonly Pick<Project, 'id' | 'name' | 'createdAt'>[], excludeId?: string): LayoutSourceOption[] {
  return projects
    .filter((project) => project.id !== excludeId)
    .sort((left, right) => Date.parse(right.createdAt) - Date.parse(left.createdAt))
    .map((project) => ({ id: project.id, name: project.name }))
}

/** Förvalt: det senast skapade projektet. Finns inget projekt att utgå från är svaret null. */
export function defaultLayoutSource(options: readonly LayoutSourceOption[]): string | null {
  return options[0]?.id ?? null
}

const PLACEMENT_LABEL: Record<Project['textPlacement'], string> = { top: 'Överkant', middle: 'Mitten', bottom: 'Underkant' }

/** Ett fälts värde som text i bekräftelsen: tom text visas som "(tom)", långa texter kortas. */
export function describeLayoutValue(key: LayoutKey, value: LayoutFields[LayoutKey]): string {
  if (key === 'textPlacement') return PLACEMENT_LABEL[value as Project['textPlacement']] ?? String(value)
  if (key === 'muxEnabled' || key === 'muxRespectDoNotTrack') return value ? 'På' : 'Av'
  if (key === 'posterUrl') return value ? 'Bild' : 'Ingen bild'
  const text = String(value ?? '').trim()
  if (text === '') return '(tom)'
  return text.length > 70 ? `${text.slice(0, 70)}…` : text
}

export interface LayoutChange {
  key: LayoutKey
  label: string
  from: string
  to: string
}

/** Vad som ersätts när layouten hämtas: bara fälten som skiljer sig åt, med gammalt och nytt värde. */
export function layoutDiff(current: LayoutFields, source: LayoutFields): LayoutChange[] {
  // Posterbilden är en fil som kopieras: den ersätts så snart någon av dem har en bild, även om båda har det (adresserna skiljer sig alltid).
  const differs = (key: LayoutKey) => (key === 'posterUrl' ? Boolean(current.posterUrl) || Boolean(source.posterUrl) : current[key] !== source[key])
  return LAYOUT_FIELDS.filter((field) => differs(field.key)).map((field) => ({
    key: field.key,
    label: field.label,
    from: describeLayoutValue(field.key, current[field.key]),
    to: describeLayoutValue(field.key, source[field.key]),
  }))
}
