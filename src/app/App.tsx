import { useState } from 'preact/hooks'
import { useRoute } from './router'
import { Shell } from './Shell'
import { ProjectsView, type ProjectScreen } from '../views/projects/ProjectsView'
import { AgendasView } from '../views/agendas/AgendasView'
import { NameListsView } from '../views/namelists/NameListsView'
import { LiveResourcesView } from '../views/resources/LiveResourcesView'
import { VideoArchiveView } from '../views/archive/VideoArchiveView'
import { TrashView } from '../views/trash/TrashView'
import { UsersView } from '../views/users/UsersView'

export function App() {
  const route = useRoute()

  // Lyft upp ur ProjectsView så att vilket projekt/vy som senast visades
  // överlever att man navigerar bort och tillbaka — det är vad som gör
  // Playout-genvägen i sidomenyn meningsfull.
  const [activeProjectId, setActiveProjectId] = useState<string | null>(null)
  const [projectScreen, setProjectScreen] = useState<ProjectScreen>('detail')

  return (
    <Shell active={route} onPlayoutShortcut={() => setProjectScreen('playout')}>
      {route === 'projects' && (
        <ProjectsView
          selectedId={activeProjectId}
          onSelectedIdChange={setActiveProjectId}
          screen={projectScreen}
          onScreenChange={setProjectScreen}
        />
      )}
      {route === 'agendas' && <AgendasView />}
      {route === 'namelists' && <NameListsView />}
      {route === 'live' && <LiveResourcesView />}
      {route === 'archive' && <VideoArchiveView />}
      {route === 'trash' && <TrashView />}
      {route === 'users' && <UsersView />}
    </Shell>
  )
}
