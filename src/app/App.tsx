import { useEffect, useState } from 'preact/hooks'
import { client } from '../data'
import type { CurrentUser } from '../data/types'
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

type AuthState = { status: 'loading' } | { status: 'anon' } | { status: 'authed'; user: CurrentUser }

export function App() {
  const route = useRoute()
  const [auth, setAuth] = useState<AuthState>({ status: 'loading' })

  // Försök återuppta en tidigare session (token sparad i localStorage av
  // httpClient) — misslyckas tyst till anon om ingen finns eller den gått ut.
  useEffect(() => {
    client.auth.me().then(
      (user) => setAuth({ status: 'authed', user }),
      () => setAuth({ status: 'anon' }),
    )
  }, [])

  function login(user: CurrentUser) {
    setAuth({ status: 'authed', user })
  }

  function logout() {
    client.auth.logout().finally(() => setAuth({ status: 'anon' }))
  }

  // Lyft upp ur ProjectsView så att vilket projekt/vy som senast visades
  // överlever att man navigerar bort och tillbaka — det är vad som gör
  // Playout-genvägen i sidomenyn meningsfull.
  const [activeProjectId, setActiveProjectId] = useState<string | null>(null)
  const [projectScreen, setProjectScreen] = useState<ProjectScreen>('detail')
  // Lyft hit av samma skäl som projectScreen — navmenyns "+ Ny"-knapp (bild 1)
  // måste kunna öppna ProjectsViews skapa-dialog utifrån, inte bara inifrån.
  const [creatingProject, setCreatingProject] = useState(false)

  // Delad av Dagordningar/Videoarkiv för "gå till projekt"-snabblänkar.
  function openProject(id: string) {
    setActiveProjectId(id)
    setProjectScreen('detail')
    window.location.hash = routeHref('projects')
  }

  if (auth.status === 'loading') return <div class="login-screen">Laddar…</div>
  if (auth.status === 'anon') return <LoginView onLogin={login} />

  // "Playout" vinner om en sändning redan är öppen (går att hoppa tillbaka
  // till den från vilken vy som helst) — annars "+ Ny" bara medan man
  // faktiskt tittar på Projekt-listan/detaljvyn.
  const projectsNavAction =
    projectScreen === 'playout'
      ? { label: 'Playout', onClick: () => { window.location.hash = routeHref('projects') } }
      : route === 'projects'
        ? { label: '+ Ny', onClick: () => setCreatingProject(true) }
        : null

  return (
    <Shell
      active={route}
      projectsNavAction={projectsNavAction}
      onLogout={logout}
      currentUserId={auth.user.id}
    >
      {route === 'projects' && (
        <ProjectsView
          selectedId={activeProjectId}
          onSelectedIdChange={setActiveProjectId}
          screen={projectScreen}
          onScreenChange={setProjectScreen}
          creating={creatingProject}
          onCreatingChange={setCreatingProject}
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
