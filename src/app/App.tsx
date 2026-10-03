import { useEffect, useState } from 'preact/hooks'
import { client } from '../data'
import type { CurrentUser } from '../data/types'
import { openJobTray } from './jobsBus'
import { parseProjectLink } from './projectLink'
import { routeHref, useCredentialToken, useRoute, useShareToken } from './router'
import { Shell } from './Shell'
import { CredentialLinkView } from './CredentialLinkView'
import { SharedDownloadsView } from './SharedDownloadsView'
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
  const credentialToken = useCredentialToken()
  const shareToken = useShareToken()
  // E-posten från en aktiverad inbjudan/återställning förifylls på inloggningen.
  const [loginEmail, setLoginEmail] = useState<string | null>(null)
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
      setProjectScreen('livesandning')
      setAuth({ status: 'anon' })
    })
  }

  // Lyft upp ur ProjectsView så att vilket projekt/vy som senast visades
  // överlever att man navigerar bort och tillbaka — det är vad som gör
  // genvägen i sidomenyn meningsfull.
  const [activeProjectId, setActiveProjectId] = useState<string | null>(null)
  const [projectScreen, setProjectScreen] = useState<ProjectScreen>('livesandning')
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
    // Rätt vy väljs av ProjectsView när projektet laddats, utifrån dess läge.
    setProjectScreen('livesandning')
    window.location.hash = routeHref('projects')
  }

  // Motsatt riktning — ProjectDetails "Öppna..." bredvid en kopplad
  // dagordning/namnlista. Engångs-förval: AgendasView/NameListsView
  // avmonteras/monteras om varje gång man navigerar bort och tillbaka, så
  // det räcker att konsumera det en gång vid montering (se onInitialSelectionConsumed).
  const [pendingAgendaId, setPendingAgendaId] = useState<string | null>(null)
  const [pendingNameListId, setPendingNameListId] = useState<string | null>(null)

  // Djuplänk från ett jobbmejl (#/projects/{id}[?jobs=1]): öppna projektet/jobbfältet och byt sedan hashen till
  // den vanliga projektvyn, så länken inte körs om. Väntar på inloggning — hashen finns kvar under inloggningen.
  const authed = auth.status === 'authed'
  useEffect(() => {
    if (!authed) return
    function followLink() {
      const link = parseProjectLink(window.location.hash)
      if (!link) return
      if (link.projectId) openProject(link.projectId)
      else window.location.hash = routeHref('projects')
      if (link.openJobs) openJobTray()
    }
    followLink()
    window.addEventListener('hashchange', followLink)
    return () => window.removeEventListener('hashchange', followLink)
    // openProject läser bara stabila setters
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [authed])

  const isRootAdmin = auth.status === 'authed' && auth.user.roles.includes('rootAdmin')
  const routeAllowed = isRootAdmin || ['projects', 'agendas', 'namelists', 'trash'].includes(route)

  useEffect(() => {
    if (auth.status === 'authed' && !routeAllowed) {
      window.location.hash = routeHref('projects')
    }
  }, [auth.status, routeAllowed, route])

  // Delningslänk (UNG-80 steg 4): publik sida utan inloggning, även om en operatör råkar vara inloggad i webbläsaren.
  if (shareToken) return <SharedDownloadsView token={shareToken} />

  // Engångslänk från ett mejl (inbjudan/återställning) går före allt annat, även när någon är inloggad.
  if (credentialToken) {
    return (
      <CredentialLinkView
        token={credentialToken}
        onDone={(email) => {
          setLoginEmail(email)
          window.location.hash = '#/'
        }}
      />
    )
  }
  if (auth.status === 'loading') return <div class="login-screen">Laddar…</div>
  if (auth.status === 'anon') return <LoginView onLogin={login} initialEmail={loginEmail ?? ''} />

  // Genvägen till det öppna projektets vy vinner när man står på en annan sida.
  // "+ Nytt" visas bara när Projekt-vyn faktiskt visar projektlistan — inte när
  // ett projekt redan är öppet där (man tittar ju redan på det).
  const projectsNavAction =
    activeProjectId && route !== 'projects'
      ? {
          label: projectScreen === 'ondemand' ? 'Ondemand' : 'Livesändning',
          onClick: () => { window.location.hash = routeHref('projects') },
        }
      : route === 'projects' && !activeProjectId
        ? { label: '+ Nytt', onClick: () => setCreatingProject(true) }
        : null

  return (
    <Shell
      active={route}
      projectsNavAction={projectsNavAction}
      onLogout={logout}
      onOpenProject={openProject}
      currentUserId={auth.user.id}
      currentUserRoles={auth.user.roles}
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
