import type { PublicMode } from '../../data/types'

// UNG-107: vilket läge ett projekt är på väg till. Lägesbyten startas från flera ställen (headern, arbetsytorna och genvägarna)
// som var och en har sin egen hook, så pågående byte hålls i en liten delad butik i stället för i en enskild komponent.
// Det ger direkt feedback (knappen blir vald, en snurra visas), och spärrar ett andra byte tills det första är klart.

type Listener = () => void

const switching = new Map<string, PublicMode>()
const listeners = new Set<Listener>()

function emit() {
  listeners.forEach((listener) => listener())
}

export function currentModeSwitch(projectId: string): PublicMode | null {
  return switching.get(projectId) ?? null
}

/** Startar ett byte. Returnerar false (och gör inget) om projektet redan byter läge. */
export function beginModeSwitch(projectId: string, to: PublicMode): boolean {
  if (switching.has(projectId)) return false
  switching.set(projectId, to)
  emit()
  return true
}

export function endModeSwitch(projectId: string): void {
  if (switching.delete(projectId)) emit()
}

export function subscribeModeSwitch(listener: Listener): () => void {
  listeners.add(listener)
  return () => listeners.delete(listener)
}
