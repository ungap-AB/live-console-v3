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
