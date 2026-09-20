const STORAGE_PREFIX = 'ungap-live-console:selected:'

export type SelectionKey = 'project' | 'agenda' | 'namelist' | 'project-screen'

export function readStoredSelection(key: SelectionKey): string | null {
  return localStorage.getItem(`${STORAGE_PREFIX}${key}`)
}

export function storeSelection(key: SelectionKey, id: string | null): void {
  const storageKey = `${STORAGE_PREFIX}${key}`
  if (id) localStorage.setItem(storageKey, id)
  else localStorage.removeItem(storageKey)
}