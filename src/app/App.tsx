import { useState } from 'preact/hooks'
import { routeHref, useRoute } from './router'
import { Shell } from './Shell'
import { LoginView } from './LoginView'
import { ProjectsView, type ProjectScreen } from '../views/projects/ProjectsView'
import { AgendasView } from '../views/agendas/AgendasView'
import { NameListsView } from '../views/namelists/NameListsView'
import { LiveResourcesView } from '../views/resources/LiveResourcesView'
import { VideoArchiveView } from '../views/archive/VideoArchiveView'
import { TrashView } from '../views/trash/TrashView'
import { UsersView } from '../views/users/UsersView'

const AUTH_KEY = 'ungap-live-fake-auth'

export function App() {
  const route = useRoute()
  const [loggedIn, setLoggedIn] = useState(() => {
    try {
      return localStorage.getItem(AUTH_KEY) === '1'
    } catch {
      return false
    }
  })

  function login() {
    setLoggedIn(true)
    try {
      localStorage.setItem(AUTH_KEY, '1')
    } catch {
      // localStorage otillgängligt — fejkad inloggning håller ändå för sessionen.
    }
  }

  function logout() {
    setLoggedIn(false)
    try {
      localStorage.removeItem(AUTH_KEY)
    } catch {
      // se ovan
    }
  }

  // Lyft upp ur ProjectsView så att vilket projekt/vy som senast visades
  // överlever att man navigerar bort och tillbaka — det är vad som gör
  // Playout-genvägen i sidomenyn meningsfull.
  const [activeProjectId, setActiveProjectId] = useState<string | null>(null)
  const [projectScreen, setProjectScreen] = useState<ProjectScreen>('detail')

  // Delad av Dagordningar/Videoarkiv för "gå till projekt"-snabblänkar.
  function openProject(id: string) {
    setActiveProjectId(id)
    setProjectScreen('detail')
    window.location.hash = routeHref('projects')
  }

  if (!loggedIn) return <LoginView onLogin={login} />

  return (
    <Shell active={route} showPlayoutShortcut={projectScreen === 'playout'} onLogout={logout}>
      {route === 'projects' && (
        <ProjectsView
          selectedId={activeProjectId}
          onSelectedIdChange={setActiveProjectId}
          screen={projectScreen}
          onScreenChange={setProjectScreen}
        />
      )}
      {route === 'agendas' && <AgendasView onOpenProject={openProject} />}
      {route === 'namelists' && <NameListsView />}
      {route === 'live' && <LiveResourcesView />}
      {route === 'archive' && <VideoArchiveView onOpenProject={openProject} />}
      {route === 'trash' && <TrashView />}
      {route === 'users' && <UsersView />}
    </Shell>
  )
}
