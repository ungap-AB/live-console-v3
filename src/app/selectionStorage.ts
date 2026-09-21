const STORAGE_PREFIX = 'ungap-live-console:selected:'

export type SelectionKey = 'project' | 'agenda' | 'namelist' | 'project-screen'

export function readStoredSelection(key: SelectionKey, scope?: string): string | null {
  return localStorage.getItem(storageKey(key, scope))
}

export function storeSelection(key: SelectionKey, id: string | null, scope?: string): void {
  const keyName = storageKey(key, scope)
  if (id) localStorage.setItem(keyName, id)
  else localStorage.removeItem(keyName)
}

function storageKey(key: SelectionKey, scope?: string): string {
  return `${STORAGE_PREFIX}${scope ? `${scope}:` : ''}${key}`
}