import { t } from '@lingui/core/macro'
import { Fragment } from 'preact'
import { useEffect, useRef, useState } from 'preact/hooks'
import { client } from '../data'
import { onSessionLost } from '../data/http/fetchJson'
import type { CurrentUser } from '../data/types'
import { parseEditorLink, parsePlayoutLink, parseProjectLink } from './projectLink'
import { readSsoReturn, routeHref, useRoute, useShareToken } from './router'
import { Shell } from './Shell'
import { SharedDownloadsView } from './SharedDownloadsView'
import { LoginView, ssoErrorMessage } from './LoginView'
import { InactivityWarning } from './InactivityWarning'
import { useInactivityLogout } from './useInactivityLogout'
import { useUiLocale } from './useUiLocale'
import { applyShellLanguage, hasLanguageOverride, switchLanguage } from '../i18n'
import { navigate, reportProjectMeeting, setCurrentSurface, setShellActions, ShellClient, surfaceStartHash, type EmbedContext } from './embed'
import { claimSilentLogin, resetSilentLogins } from './silentLogin'
import { ProjectPlayoutsView } from '../views/playouts/ProjectPlayoutsView'
import type { ShellMeeting } from './shellProtocol'
import { StatusStrip } from '../views/status/StatusStrip'
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
  const shareToken = useShareToken()
  const [auth, setAuth] = useState<AuthState>({ status: 'loading' })
  // ADR 001: a login that did not end in a session returns to #/sso?error=…&return=…; read once, then the page is restored.
  const [ssoReturn] = useState(readSsoReturn)
  // Step A6: framed, the shell's user and organisation; the console says when its own session does not match.
  const [shellOrg, setShellOrg] = useState<string | null>(null)
  const [shellPerson, setShellPerson] = useState<string | null>(null)
  const shellClientRef = useRef<ShellClient | null>(null)
  const needsLogin = useRef(false)
  const [ssoError] = useState<string | null>(
    ssoReturn && ssoReturn.error !== 'login_required' ? ssoErrorMessage(ssoReturn.error) : null,
  )

  // ADR 001: the session is a cookie on the API's host; ask whether there is one. Framed without one, log in silently
  // (Keycloak shows no page); if Keycloak has no session either, the shell is asked for a login (below).
  useEffect(() => {
    if (ssoReturn) window.history.replaceState(null, '', window.location.pathname + window.location.search + (ssoReturn.returnHash || routeHref('projects')))
    client.auth.me().then(
      (user) => {
        resetSilentLogins()
        // Embedded, the shell decides the language (UNG-322).
        if (!embed) applyAccountLanguage(user)
        setActiveProjectId(readStoredSelection('project', user.domain.id))
        setProjectScreen(parseProjectScreen(readStoredSelection('project-screen', user.domain.id)))
        setAuth({ status: 'authed', user })
      },
      () => {
        if (embed && !ssoReturn && claimSilentLogin()) {
          client.auth.startSso({ silent: true })
          return
        }
        setAuth({ status: 'anon' })
      },
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
        // Framed: Keycloak's session usually still exists, so a silent login gives a new session.
        if (embed && claimSilentLogin()) {
          client.auth.startSso({ silent: true })
          return
        }
        setAuth((current) => {
          if (current.status !== 'authed') return current
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
    loggingOut.current = true
    client.auth.logout().finally(() => {
      loggingOut.current = false
      setLoggedOut(true)
      setAuth({ status: 'anon' })
    })
  })

  function logout(): Promise<void> {
    loggingOut.current = true
    // Logging out also ends the ungap login (Keycloak), which returns to the console. Framed, the shell ends it.
    const ssoLogout = auth.status === 'authed' && !embed ? client.auth.ssoLogoutUrl() : null
    return client.auth.logout().finally(() => {
      if (ssoLogout) {
        window.location.assign(ssoLogout)
        return
      }
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
  // UNG-332: the meeting open in Meeting's frame, for the status strip.
  const [shellMeeting, setShellMeeting] = useState<ShellMeeting | null>(null)
  // The project in the combined view, from the shell's address (#/projects/<id>). Kept apart from the project open under
  // Broadcasts, so opening a project does not change what Broadcasts shows.
  const [statusProjectId, setStatusProjectId] = useState<string | null>(null)
  // ungap Presenter spike B1: the project whose playout the `playout` surface shows (its meeting goes to the shell).
  const [playoutProjectId, setPlayoutProjectId] = useState<string | null>(null)
  function showSurface(next: string, id: string | null = null) {
    setSurface(next)
    setCurrentSurface(next)
    if (next === 'status') setStatusProjectId(id)
    setPlayoutProjectId(next === 'playout' ? id : null)
    // #/broadcasts/<id>: that broadcast's admin. Without an id, Broadcasts keeps what it showed.
    if (next === 'projects' && id) openProject(id)
    // replace, not a new entry: a framed page's history entries would end up in the shell's back button.
    const hash = surfaceStartHash(next, window.location.hash, id)
    if (hash) window.location.replace(hash)
  }
  useReportPlayoutMeeting(auth.status === 'authed' ? playoutProjectId : null)
  shellLogout.current = auth.status === 'authed' ? logout : () => Promise.resolve()
  useEffect(() => {
    if (!embed) return
    const shellClient = new ShellClient(window.parent, embed, {
      onInit: ({ locale, theme, surface, id }) => {
        applyThemePreference(theme)
        void applyShellLanguage(locale)
        showSurface(surface, id)
        setShellActions({
          navigate: (destination, target) => shellClient.navigate(destination, target),
          projectMeeting: (meetingId) => shellClient.projectMeeting(meetingId),
        })
        if (needsLogin.current) shellClient.loginRequired()
      },
      // Step A6: the shell's user. Another person than this session's means the session is not theirs: it ends and the
      // shell is asked for a login. A Live user belongs to one domain (the organisation), so another organisation is
      // shown as not available here.
      onSession: (personId, organisationId) => {
        setShellOrg(organisationId)
        setShellPerson(personId)
      },
      onOrgChanged: setShellOrg,
      onMeetingContext: setShellMeeting,
      onSurface: showSurface,
      onLocale: (locale) => void applyShellLanguage(locale),
      onTheme: applyThemePreference,
      onLogout: () => shellLogout.current(),
    })
    const onMessage = (event: MessageEvent) => shellClient.handleMessage(event)
    window.addEventListener('message', onMessage)
    shellClientRef.current = shellClient
    shellClient.ready()
    return () => {
      window.removeEventListener('message', onMessage)
      setShellActions(null)
    }
    // embed is fixed for the page's lifetime
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])
  // Step A6: compared once both are known (the shell's message usually arrives before the console has read its session):
  // a session of another person than the shell's user ends, and the shell is asked for a login.
  useEffect(() => {
    if (!embed || auth.status !== 'authed' || !shellPerson || !auth.user.personId || auth.user.personId === shellPerson) return
    // ADR 001: end it and log in silently, which gives the shell's user (Keycloak's session is theirs).
    loggingOut.current = true
    void client.auth.logout().finally(() => {
      loggingOut.current = false
      if (claimSilentLogin()) client.auth.startSso({ silent: true })
      else setAuth({ status: 'anon' })
    })
  }, [auth, shellPerson])
  // Framed and Keycloak needs the person (or the silent login gave up): ask the shell to log in in the whole window (once
  // connected; the shell does it at most once a minute). Not for a refusal such as no_access: the frame shows why.
  useEffect(() => {
    if (!embed || auth.status !== 'anon' || (ssoReturn && ssoReturn.error !== 'login_required')) return
    needsLogin.current = true
    shellClientRef.current?.loginRequired()
  }, [auth.status])

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

  // UNG-322: the status strip at the top of Combined view. Same console instance as Projects, so it follows the open project.
  if (embed && surface === 'status') {
    return (
      <Fragment key={locale}>
        <StatusStrip auth={auth.status} projectId={statusProjectId} meeting={shellMeeting} inactivityRemainingMs={inactivity.phase === 'warning' ? inactivity.remainingMs : null} />
      </Fragment>
    )
  }

  if (auth.status === 'loading') return <div class="login-screen">{t`Loading…`}</div>
  if (embed && auth.status === 'authed' && shellOrg && shellOrg !== auth.user.domain.id)
    return <div class="login-screen">{t`ungap Live is not available in the organisation chosen in ungap Presenter.`}</div>
  if (auth.status === 'anon')
    return (
      <LoginView
        loggedOut={loggedOut}
        ssoError={ssoError}
        // Framed, Keycloak's page cannot show in the frame: ungap Presenter logs in in the whole window.
        onSso={
          embed
            ? () => {
                needsLogin.current = true
                shellClientRef.current?.loginRequired()
              }
            : () => client.auth.startSso()
        }
      />
    )

  // UNG-332: "Projects" in ungap Shell, the connected broadcasts. Opening one makes it the console's open project (so the
  // status strip above the meeting shows it) and asks the shell for the combined view with its meeting.
  if (embed && surface === 'playouts') {
    return (
      <Fragment key={locale}>
        <ProjectPlayoutsView
          onOpen={({ project }) => navigate('projects', project.id)}
          meetingEnabled={auth.user.domain.meetingEnabled ?? false}
        />
      </Fragment>
    )
  }

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

const PLAYOUT_LINK_POLL_MS = 10_000

/**
 * ungap Presenter spike B1: the `playout` surface tells the shell which meeting its project is linked to (as the status
 * strip does), so the shell shows that meeting below, or Live alone when there is none. Polled, reported on change.
 */
function useReportPlayoutMeeting(projectId: string | null) {
  useEffect(() => {
    if (!projectId) return
    let cancelled = false
    let reported: string | null | undefined
    const load = () =>
      client.projects.getMeetingLink(projectId).then(
        (state) => {
          const meetingId = state.link?.meetingId ?? null
          if (cancelled || meetingId === reported) return
          reported = meetingId
          reportProjectMeeting(meetingId)
        },
        () => {
          // The next poll tries again.
        },
      )
    void load()
    const timer = window.setInterval(() => void load(), PLAYOUT_LINK_POLL_MS)
    return () => {
      cancelled = true
      window.clearInterval(timer)
    }
  }, [projectId])
}
