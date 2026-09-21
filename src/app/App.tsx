import { useEffect, useState } from 'preact/hooks'
import { client } from '../data'
import type { CurrentUser } from '../data/types'
import { routeHref, useRoute } from './router'
import { Shell } from './Shell'
import { LoginView } from './LoginView'
import { ProjectsView, parseProjectScreen, type ProjectScreen } from '../views/projects/ProjectsView'
import { AgendasView } from '../views/agendas/AgendasView'
import { NameListsView } from '../views/namelists/NameListsView'
import { LiveResourcesView } from '../views/resources/LiveResourcesView'
import { VideoArchiveView } from '../views/archive/VideoArchiveView'
import { TrashView } from '../views/trash/TrashView'
import { UsersView } from '../views/users/UsersView'
import { readStoredSelection, storeSelection } from './selectionStorage'

type AuthState = { status: 'loading' } | { status: 'anon' } | { status: 'authed'; user: CurrentUser }

export function App() {
  const route = useRoute()
  const [auth, setAuth] = useState<AuthState>({ status: 'loading' })

  // Försök återuppta en aktiv session — misslyckas tyst till anon om ingen
  // giltig token finns i minnet eller sessionen gått ut.
  useEffect(() => {
    client.auth.me().then(
      (user) => {
        setActiveProjectId(readStoredSelection('project', user.domain.id))
        setProjectScreen(parseProjectScreen(readStoredSelection('project-screen', user.domain.id)))
        setAuth({ status: 'authed', user })
      },
      () => setAuth({ status: 'anon' }),
    )
  }, [])

  function login(user: CurrentUser) {
    setActiveProjectId(readStoredSelection('project', user.domain.id))
    setProjectScreen(parseProjectScreen(readStoredSelection('project-screen', user.domain.id)))
    setAuth({ status: 'authed', user })
  }

  function logout() {
    client.auth.logout().finally(() => {
      setActiveProjectId(null)
      setProjectScreen('detail')
      setAuth({ status: 'anon' })
    })
  }

  // Lyft upp ur ProjectsView så att vilket projekt/vy som senast visades
  // överlever att man navigerar bort och tillbaka — det är vad som gör
  // Playout-genvägen i sidomenyn meningsfull.
  const [activeProjectId, setActiveProjectId] = useState<string | null>(null)
  const [projectScreen, setProjectScreen] = useState<ProjectScreen>('detail')
  // Lyft hit av samma skäl som projectScreen — navmenyns "+ Ny"-knapp (bild 1)
  // måste kunna öppna ProjectsViews skapa-dialog utifrån, inte bara inifrån.
  const [creatingProject, setCreatingProject] = useState(false)

  useEffect(() => {
    if (auth.status === 'authed') storeSelection('project', activeProjectId, auth.user.domain.id)
  }, [activeProjectId, auth])

  useEffect(() => {
    if (auth.status === 'authed') storeSelection('project-screen', projectScreen, auth.user.domain.id)
  }, [projectScreen, auth])

  // Delad av Dagordningar/Videoarkiv för "gå till projekt"-snabblänkar.
  function openProject(id: string) {
    setActiveProjectId(id)
    setProjectScreen('detail')
    window.location.hash = routeHref('projects')
  }

  // Motsatt riktning — ProjectDetails "Öppna..." bredvid en kopplad
  // dagordning/namnlista. Engångs-förval: AgendasView/NameListsView
  // avmonteras/monteras om varje gång man navigerar bort och tillbaka, så
  // det räcker att konsumera det en gång vid montering (se onInitialSelectionConsumed).
  const [pendingAgendaId, setPendingAgendaId] = useState<string | null>(null)
  const [pendingNameListId, setPendingNameListId] = useState<string | null>(null)

  function openAgenda(id: string) {
    setPendingAgendaId(id)
    window.location.hash = routeHref('agendas')
  }

  function openNameList(id: string) {
    setPendingNameListId(id)
    window.location.hash = routeHref('namelists')
  }

  const isRootAdmin = auth.status === 'authed' && auth.user.roles.includes('rootAdmin')
  const routeAllowed = isRootAdmin || ['projects', 'agendas', 'namelists', 'trash'].includes(route)

  useEffect(() => {
    if (auth.status === 'authed' && !routeAllowed) {
      window.location.hash = routeHref('projects')
    }
  }, [auth.status, routeAllowed, route])

  if (auth.status === 'loading') return <div class="login-screen">Laddar…</div>
  if (auth.status === 'anon') return <LoginView onLogin={login} />

  // "Playout" vinner om en sändning redan är öppen (går att hoppa tillbaka
  // till den från vilken vy som helst) — annars "+ Nytt" bara medan man
  // faktiskt tittar på Projekt-listan/detaljvyn.
  const projectsNavAction =
    projectScreen === 'playout'
      ? { label: 'Playout', onClick: () => { window.location.hash = routeHref('projects') } }
      : route === 'projects'
        ? { label: '+ Nytt', onClick: () => setCreatingProject(true) }
        : null

  return (
    <Shell
      active={route}
      projectsNavAction={projectsNavAction}
      onLogout={logout}
      currentUserId={auth.user.id}
      currentUserRoles={auth.user.roles}
      contentLocked={route === 'projects' && projectScreen === 'playout'}
    >
      {routeAllowed && route === 'projects' && (
        <ProjectsView
          meetingDomain={auth.user.domain.host}
          selectionScope={auth.user.domain.id}
          selectedId={activeProjectId}
          onSelectedIdChange={setActiveProjectId}
          screen={projectScreen}
          onScreenChange={setProjectScreen}
          creating={creatingProject}
          onCreatingChange={setCreatingProject}
          onOpenAgenda={openAgenda}
          onOpenNameList={openNameList}
        />
      )}
      {routeAllowed && route === 'agendas' && (
        <AgendasView
          onOpenProject={openProject}
          selectionScope={auth.user.domain.id}
          initialSelectedId={pendingAgendaId}
          onInitialSelectionConsumed={() => setPendingAgendaId(null)}
        />
      )}
      {routeAllowed && route === 'namelists' && (
        <NameListsView
          selectionScope={auth.user.domain.id}
          initialSelectedId={pendingNameListId}
          onInitialSelectionConsumed={() => setPendingNameListId(null)}
        />
      )}
      {routeAllowed && route === 'live' && <LiveResourcesView />}
      {routeAllowed && route === 'archive' && <VideoArchiveView onOpenProject={openProject} />}
      {routeAllowed && route === 'trash' && <TrashView />}
      {routeAllowed && route === 'users' && isRootAdmin && (
        <UsersView currentDomainId={auth.user.domain.id} canManageDomains={isRootAdmin} />
      )}
    </Shell>
  )
}
