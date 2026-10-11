export interface ProjectLink {
  /** Projektet som ska öppnas, eller null om länken bara ska öppna jobbfältet. */
  projectId: string | null
  openJobs: boolean
}

// Djuplänkar från mejl (UNG-80 steg 3): #/projects/{id} öppnar projektet och #/projects/{id}?jobs=1 öppnar
// dessutom jobbfältet. Allt annat (vanlig navigering, #/projects) är ingen djuplänk och ger null.
export function parseProjectLink(hash: string): ProjectLink | null {
  const [path, query = ''] = hash.replace(/^#/, '').split('?')
  const [, section, id] = path.split('/')
  if (section !== 'projects') return null
  const openJobs = new URLSearchParams(query).get('jobs') === '1'
  const projectId = id ? decodeURIComponent(id) : null
  return projectId || openJobs ? { projectId, openJobs } : null
}

// UNG-250: editorn har en egen adress per projekt, #/projects/{id}/edit, så att omladdning och delade länkar öppnar den direkt och
// bakåtknappen stänger den.
export function editorHref(projectId: string): string {
  return `#/projects/${encodeURIComponent(projectId)}/edit`
}

/** Projektet vars editor adressen pekar på, eller null. */
export function parseEditorLink(hash: string): string | null {
  const [path] = hash.replace(/^#/, '').split('?')
  const [, section, id, sub] = path.split('/')
  return section === 'projects' && id && sub === 'edit' ? decodeURIComponent(id) : null
}
