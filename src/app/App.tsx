import { t } from '@lingui/core/macro'
import { Fragment } from 'preact'
import { useEffect, useRef, useState } from 'preact/hooks'
import { client } from '../data'
import { onSessionLost } from '../data/http/fetchJson'
import type { CurrentUser } from '../data/types'
import { parseEditorLink, parsePlayoutLink, parseProjectLink } from './projectLink'
import { routeHref, useCredentialToken, useRoute, useShareToken } from './router'
import { Shell } from './Shell'
import { CredentialLinkView } from './CredentialLinkView'
import { SharedDownloadsView } from './SharedDownloadsView'
import { LoginView } from './LoginView'
import { InactivityWarning } from './InactivityWarning'
import { useInactivityLogout } from './useInactivityLogout'
import { useUiLocale } from './useUiLocale'
import { applyShellLanguage, hasLanguageOverride, switchLanguage } from '../i18n'
import { ShellClient, surfaceStartHash, type EmbedContext } from './embed'
import { applyThemePreference } from './theme'
import { ProjectsView, parseProjectScreen, type ProjectScreen } from '../views/projects/ProjectsView'
import { AgendasView } from '../views/agendas/AgendasView'
import { NameListsView } from '../views/namelists/NameListsView'
import { LiveResourcesView } from '../views/resources/LiveResourcesView'
import { VideoArchiveView } from '../views/archive/VideoArchiveView'
import { JobsView } from '../views/jobs/JobsView'
import { TrashView } from '../views/trash/TrashView'
import { UsersView } from '../views/users/UsersView'
import { readStoredSelection, storeSelection } from './selectionStorage'
import { nextLastOpened } from '../views/projects/projectListFocus'
import { IsRootAdminContext } from './currentUserContext'

type AuthState = { status: 'loading' } | { status: 'anon' } | { status: 'authed'; user: CurrentUser }

// UNG-306: after login the account's language applies (unless ?lang= overrides it).
function applyAccountLanguage(user: CurrentUser) {
  if (user.language && !hasLanguageOverride(window.location.search)) void switchLanguage(user.language)
}

interface AppProps {
  /** UNG-322: set when ungap Shell frames the console (see main.tsx); null standalone. */
  embed: EmbedContext | null
}

export function App({ embed }: AppProps) {
  // UNG-306: a language switch re-renders the app; the views below the shell are remounted (keyed) so data labels follow.
  const locale = useUiLocale()
  const route = useRoute()
  const credentialToken = useCredentialToken()
  const shareToken = useShareToken()
  // E-posten från en aktiverad inbjudan/återställning förifylls på inloggningen.
  const [loginEmail, setLoginEmail] = useState<string | null>(null)
  const [auth, setAuth] = useState<AuthState>({ status: 'loading' })

  // Försök återuppta en aktiv session — misslyckas tyst till anon om ingen
  // giltig token finns i fliklagringen (UNG-312) eller sessionen gått ut.
  useEffect(() => {
    client.auth.me().then(
      (user) => {
        // Embedded, the shell decides the language (UNG-322).
        if (!embed) applyAccountLanguage(user)
        setActiveProjectId(readStoredSelection('project', user.domain.id))
        setProjectScreen(parseProjectScreen(readStoredSelection('project-screen', user.domain.id)))
        setAuth({ status: 'authed', user })
      },
      () => setAuth({ status: 'anon' }),
    )
  }, [])

  // UNG-128: ett ogiltigt token märks först vid ett anrop. Då visas inloggningen med en förklaring; valt projekt och vy
  // ligger kvar i tillståndet och lagrat urval, så operatören hamnar där hen var efter ny inloggning.
  const [loggedOut, setLoggedOut] = useState(false)
  const loggingOut = useRef(false)
  useEffect(
    () =>
      onSessionLost(() => {
        if (loggingOut.current) return
        setAuth((current) => {
          if (current.status !== 'authed') return current
          setLoginEmail(current.user.email)
          setLoggedOut(true)
          return { status: 'anon' }
        })
      }),
    [],
  )

  // UNG-312: logged out after 2 h without activity. Like an expired session (UNG-128) the selected project and view are
  // kept, so the operator continues where they were after logging in again.
  const inactivity = useInactivityLogout(auth.status === 'authed', () => {
    if (auth.status !== 'authed') return
    const email = auth.user.email
    loggingOut.current = true
    client.auth.logout().finally(() => {
      loggingOut.current = false
      setLoginEmail(email)
      setLoggedOut(true)
      setAuth({ status: 'anon' })
    })
  })

  function login(user: CurrentUser) {
    if (!embed) applyAccountLanguage(user)
    setLoggedOut(false)
    // Ingen markering i listan efter inloggning: det senast öppnade gällde förra inloggningen (överlever annars en utloggning).
    setLastOpenedProjectId(null)
    setActiveProjectId(readStoredSelection('project', user.domain.id))
    setProjectScreen(parseProjectScreen(readStoredSelection('project-screen', user.domain.id)))
    setAuth({ status: 'authed', user })
  }

  function logout(): Promise<void> {
    loggingOut.current = true
    return client.auth.logout().finally(() => {
      loggingOut.current = false
      setLoggedOut(false)
      setActiveProjectId(null)
      setProjectScreen('livesandning')
      setAuth({ status: 'anon' })
    })
  }

  // UNG-321/322: the shell API in embed mode. Set up once; the ref always holds the logout of the current session, which
  // the shell asks for when the user logs out in the shell.
  const shellLogout = useRef<() => Promise<unknown>>(() => Promise.resolve())
  // The shell keeps one console frame and moves it between its destinations: the surface changes without a reload.
  const [surface, setSurface] = useState(embed?.surface ?? '')
  function showSurface(next: string) {
    setSurface(next)
    // replace, not a new entry: a framed page's history entries would end up in the shell's back button.
    const hash = surfaceStartHash(next, window.location.hash)
    if (hash) window.location.replace(hash)
  }
  shellLogout.current = auth.status === 'authed' ? logout : () => Promise.resolve()
  useEffect(() => {
    if (!embed) return
    const shellClient = new ShellClient(window.parent, embed, {
      onInit: ({ locale, theme, surface }) => {
        applyThemePreference(theme)
        void applyShellLanguage(locale)
        showSurface(surface)
      },
      onSurface: showSurface,
      onLocale: (locale) => void applyShellLanguage(locale),
      onTheme: applyThemePreference,
      onLogout: () => shellLogout.current(),
    })
    const onMessage = (event: MessageEvent) => shellClient.handleMessage(event)
    window.addEventListener('message', onMessage)
    shellClient.ready()
    return () => window.removeEventListener('message', onMessage)
    // embed is fixed for the page's lifetime
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Lyft upp ur ProjectsView så att vilket projekt/vy som senast visades
  // överlever att man navigerar bort och tillbaka — det är vad som gör
  // genvägen i sidomenyn meningsfull.
  const [activeProjectId, setActiveProjectId] = useState<string | null>(null)
  // UNG-183: projektet man senast hade öppet. Behålls när man går tillbaka till listan, så det kan markeras och scrollas fram där.
  const [lastOpenedProjectId, setLastOpenedProjectId] = useState<string | null>(null)
  useEffect(() => {
    setLastOpenedProjectId((previous) => nextLastOpened(previous, activeProjectId))
  }, [activeProjectId])
  const [projectScreen, setProjectScreen] = useState<ProjectScreen>('livesandning')
  // Lyft hit av samma skäl som projectScreen — navmenyns "+ Ny"-knapp (bild 1)
  // måste kunna öppna ProjectsViews skapa-dialog utifrån, inte bara inifrån.
  const [creatingProject, setCreatingProject] = useState(false)

  useEffect(() => {
    if (auth.status === 'authed') storeSelection('project', activeProjectId, auth.user.domain.id)
  }, [activeProjectId, auth])

  // UNG-250: editorns adress gäller bara sitt projekt. Lämnar man det projektet (till listan eller ett annat) tas den bort, annars
  // öppnas editorn av sig själv nästa gång projektet öppnas. Bara vid byte FRÅN projektet, så att länken hinner följas vid inloggning.
  const previousProjectId = useRef<string | null>(null)
  useEffect(() => {
    // UNG-268: samma sak för utspelningsvyns adress.
    const editorProjectId = parseEditorLink(window.location.hash) ?? parsePlayoutLink(window.location.hash)
    if (editorProjectId && previousProjectId.current === editorProjectId && activeProjectId !== editorProjectId) {
      window.history.replaceState(null, '', routeHref('projects'))
    }
    previousProjectId.current = activeProjectId
  }, [activeProjectId])

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

  // Djuplänk från ett jobbmejl (#/projects/{id}[?jobs=1]): ?jobs=1 öppnar Jobb-vyn (UNG-100), annars öppnas projektet, och
  // hashen byts sedan så länken inte körs om. Väntar på inloggning — hashen finns kvar under inloggningen.
  const authed = auth.status === 'authed'
  useEffect(() => {
    if (!authed) return
    function followLink() {
      // UNG-250: editorns adress ligger kvar (den följer editorn); projektet öppnas i ondemand-vyn där editorn finns.
      const editorProjectId = parseEditorLink(window.location.hash)
      if (editorProjectId) {
        setActiveProjectId(editorProjectId)
        setProjectScreen('ondemand')
        return
      }
      // UNG-268: utspelningsvyns adress ligger också kvar; vyn finns i livesändningsskärmen.
      const playoutProjectId = parsePlayoutLink(window.location.hash)
      if (playoutProjectId) {
        setActiveProjectId(playoutProjectId)
        setProjectScreen('livesandning')
        return
      }
      const link = parseProjectLink(window.location.hash)
      if (!link) return
      if (link.openJobs) window.location.hash = routeHref('jobs')
      else if (link.projectId) openProject(link.projectId)
      else window.location.hash = routeHref('projects')
    }
    followLink()
    window.addEventListener('hashchange', followLink)
    return () => window.removeEventListener('hashchange', followLink)
    // openProject läser bara stabila setters
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [authed])

  const isRootAdmin = auth.status === 'authed' && auth.user.roles.includes('rootAdmin')
  const routeAllowed = isRootAdmin || ['projects', 'agendas', 'namelists', 'jobs', 'trash'].includes(route)

  useEffect(() => {
    if (auth.status === 'authed' && !routeAllowed) {
      window.location.hash = routeHref('projects')
    }
  }, [auth.status, routeAllowed, route])

  // Delningslänk (UNG-80 steg 4): publik sida utan inloggning, även om en operatör råkar vara inloggad i webbläsaren.
  if (shareToken) return <SharedDownloadsView token={shareToken} />

  // UNG-322: the status strip for Combined view is not built yet; until then the surface shows where it will be.
  if (embed && surface === 'status') return <div class="embed-status-placeholder">{t`ungap Presenter · status strip (coming in UNG-322)`}</div>

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
  if (auth.status === 'loading') return <div class="login-screen">{t`Loading…`}</div>
  if (auth.status === 'anon') return <LoginView onLogin={login} initialEmail={loginEmail ?? ''} loggedOut={loggedOut} />

  // UNG-186: projektraden i menyn har bara "+ Nytt", och den syns alltid. Från en annan sida går den först till Projekt-vyn och öppnar
  // sedan skapa-dialogen (tillståndet ligger här, så dialogen följer med när vyn monteras). Menyvalet "Projekt" går till listan med det
  // senast öppnade projektet markerat (UNG-183), inte tillbaka in i projektet.
  const projectsNavAction = {
    label: '+ Nytt',
    onClick: () => {
      window.location.hash = routeHref('projects')
      setCreatingProject(true)
    },
  }

  return (
    <IsRootAdminContext.Provider value={isRootAdmin}>
    <Shell
      embedded={embed !== null}
      active={route}
      projectsNavAction={projectsNavAction}
      onLogout={logout}
      onOpenProject={openProject}
      onOpenProjectList={() => setActiveProjectId(null)}
      currentUserId={auth.user.id}
      currentUserRoles={auth.user.roles}
    >
      <Fragment key={locale}>
      {routeAllowed && route === 'projects' && (
        <ProjectsView
          meetingDomain={auth.user.domain.host}
          meetingEnabled={auth.user.domain.meetingEnabled ?? false}
          selectionScope={auth.user.domain.id}
          selectedId={activeProjectId}
          lastOpenedId={lastOpenedProjectId}
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
      {routeAllowed && route === 'jobs' && <JobsView onOpenProject={openProject} />}
      {routeAllowed && route === 'trash' && <TrashView />}
      {routeAllowed && route === 'users' && isRootAdmin && (
        <UsersView currentDomainId={auth.user.domain.id} canManageDomains={isRootAdmin} />
      )}
      </Fragment>
      {inactivity.phase === 'warning' && <InactivityWarning remainingMs={inactivity.remainingMs} />}
    </Shell>
    </IsRootAdminContext.Provider>
  )
}
