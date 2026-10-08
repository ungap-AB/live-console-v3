// UNG-178: sorteringen av namnlistan i live-vyn är en vy, inte en ändring av listan. "Listans ordning" visar den lagrade ordningen;
// "Namn A–Ö" och "Mest utspelade" ordnar bara det som visas och följer utspelningen löpande. Raden som just spelats ut flyttas inte
// under pekaren: omsorteringen väntar tills pekaren lämnat listan (eller varit stilla en stund) och flyttas sedan mjukt.

export type PersonSort = 'manual' | 'name' | 'playCount'

export const PERSON_SORT_OPTIONS: { value: PersonSort; label: string }[] = [
  { value: 'manual', label: 'Listans ordning' },
  { value: 'name', label: 'Namn A–Ö' },
  { value: 'playCount', label: 'Mest utspelade' },
]

export function parsePersonSort(value: string | null | undefined): PersonSort {
  return value === 'name' || value === 'playCount' ? value : 'manual'
}

/** Så länge pekaren varit stilla över listan innan en väntande omsortering får flytta raderna (ms). */
export const IDLE_REORDER_MS = 3000

/** Ordningen som ska visas. Stabil: lika antal sorteras på namn (svenskt alfabet), och "Listans ordning" lämnar listan som den är. */
export function orderPeople<T extends { id: string; name: string }>(people: readonly T[], sort: PersonSort, playCount: (id: string) => number): T[] {
  if (sort === 'manual') return [...people]
  return [...people].sort((left, right) => {
    if (sort === 'playCount') {
      const difference = playCount(right.id) - playCount(left.id)
      if (difference !== 0) return difference
    }
    return left.name.localeCompare(right.name, 'sv')
  })
}

/**
 * Vilken ordning som visas just nu. Med `hold` (pekaren är över listan och rör sig) behålls den som visas: bara medlemskapet stäms av,
 * så borttagna rader försvinner och nya läggs sist i målordningen. Utan `hold` gäller målordningen.
 */
export function resolveShown(shown: readonly string[], target: readonly string[], hold: boolean): string[] {
  if (!hold) return [...target]
  const targetSet = new Set(target)
  const kept = shown.filter((id) => targetSet.has(id))
  const keptSet = new Set(kept)
  return [...kept, ...target.filter((id) => !keptSet.has(id))]
}
