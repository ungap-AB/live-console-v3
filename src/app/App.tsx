import { useEffect, useState } from 'preact/hooks'
import { client } from '../data'
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

  // Håller koll på om någon sändning pågår just nu, så Playout-genvägen i
  // sidomenyn bara syns när den faktiskt leder någonstans (se HANDOVER §11
  // om pollingintervall för kanalstatus).
  const [liveProjectId, setLiveProjectId] = useState<string | null>(null)

  useEffect(() => {
    if (!loggedIn) return
    let cancelled = false
    async function poll() {
      try {
        const projects = await client.projects.list()
        if (!cancelled) setLiveProjectId(projects.find((p) => p.channel?.state === 'live')?.id ?? null)
      } catch {
        // Nästa poll försöker igen.
      }
    }
    poll()
    const id = setInterval(poll, 5000)
    return () => {
      cancelled = true
      clearInterval(id)
    }
  }, [loggedIn])

  function goToLivePlayout() {
    if (!liveProjectId) return
    setActiveProjectId(liveProjectId)
    setProjectScreen('playout')
  }

  if (!loggedIn) return <LoginView onLogin={login} />

  return (
    <Shell active={route} onPlayoutShortcut={goToLivePlayout} showPlayoutShortcut={liveProjectId !== null} onLogout={logout}>
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
