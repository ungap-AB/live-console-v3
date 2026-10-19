import { envelope, nextMessageId, parseShellMessage, SUPPORTED_VERSIONS, type InitMessage, type ShellDestination, type ShellLocale, type ShellMeeting, type ShellMessage, type ShellTheme } from './shellProtocol.ts'
import type { RouteKey } from './router.tsx'
import { parsePlayoutLink, playoutHref } from './projectLink.ts'

// Embed mode (UNG-322): the console framed by ungap Shell. The shell frames `/?surface=<surface>&shell=<shell origin>`;
// the console is embedded only when it really is framed AND the shell origin is on the allowlist. Then it hides its own
// menu and account box (the shell owns them) and follows the shell's language and theme through the shell API
// (UNG-321). Standalone on its own address the console works as before, also as the emergency route if the shell is down.

export interface EmbedContext {
  shellOrigin: string
  surface: string
}

/**
 * The shell origins allowed to frame the console: VITE_SHELL_ORIGINS (comma separated) at build time, plus the local
 * shell in development. A build without the variable (test and prod today) never enters embed mode.
 */
export function allowedShellOrigins(configured: string | undefined, dev: boolean): string[] {
  const origins = (configured ?? '').split(',').map((origin) => origin.trim()).filter(Boolean)
  if (dev) origins.push('https://localhost:5180')
  return origins
}

/** The embed context from the page address, or null when the console runs standalone. */
export function detectEmbed(search: string, framed: boolean, allowed: readonly string[]): EmbedContext | null {
  if (!framed) return null
  const params = new URLSearchParams(search)
  const shellOrigin = params.get('shell')
  if (!shellOrigin || !allowed.includes(shellOrigin)) return null
  return { shellOrigin, surface: params.get('surface') ?? '' }
}

/** The console view a surface opens; null for surfaces that are not a console view (the status strip). */
export function surfaceRoute(surface: string): RouteKey | null {
  // ungap Presenter spike B1: `playout` + a project id is that project's playout (UNG-268's view), above the meeting.
  if (surface === 'projects' || surface === 'playout') return 'projects'
  if (surface === 'jobs') return 'jobs'
  return null
}

/** The hash to start on for a surface, or null to keep the current one (a deep link into the surface's view stays). */
export function surfaceStartHash(surface: string, hash: string, id: string | null = null): string | null {
  if (surface === 'playout' && id) return parsePlayoutLink(hash) === id ? null : playoutHref(id)
  // Leaving the playout surface: its address must not keep the playout open under Broadcasts.
  if (surface === 'projects' && parsePlayoutLink(hash)) return '#/projects'
  const route = surfaceRoute(surface)
  if (!route) return null
  const current = hash.slice(1).split('/').filter(Boolean)[0]
  return current === route ? null : `#/${route}`
}

export interface ShellClientHandlers {
  onInit: (payload: InitMessage['payload']) => void
  onLocale: (locale: ShellLocale) => void
  onTheme: (theme: ShellTheme) => void
  /** The shell moved this frame to another surface (one frame per service): switch view, keep state. id: the object in
   * the shell's address (`#/broadcasts/<id>`, `#/projects/<id>`), or null for the list. */
  onSurface: (surface: string, id: string | null) => void
  /** Ends the console's session; the shell is answered when the returned promise settles. */
  onLogout: () => Promise<unknown>
  /** UNG-332: the meeting open in Meeting's frame (null: none), passed on by the shell. */
  onMeetingContext: (meeting: ShellMeeting | null) => void
}

// UNG-332 / flows-and-views.md: links to other views go through the shell, which owns the addresses. Set while the
// console is embedded and connected; views show their cross-service links only then.
let shellActions: { navigate: (destination: ShellDestination, id: string | null) => void; projectMeeting: (meetingId: string | null) => void } | null = null
export function setShellActions(actions: typeof shellActions): void {
  shellActions = actions
}
export function canNavigate(): boolean {
  return shellActions !== null
}
// The surface the shell shows this frame as (spike B1: the playout's Close goes back to the broadcast through the shell).
let currentSurface = ''
export function setCurrentSurface(surface: string): void {
  currentSurface = surface
}
export function isPlayoutSurface(): boolean {
  return shellActions !== null && currentSurface === 'playout'
}
/** Asks the shell to go to a destination (or one object in it): `navigate('projects', id)` opens the combined view. */
export function navigate(destination: ShellDestination, id: string | null = null): void {
  shellActions?.navigate(destination, id)
}
/** Tells the shell which meeting the project shown in the combined view uses; the shell opens it in Meeting. */
export function reportProjectMeeting(meetingId: string | null): void {
  shellActions?.projectMeeting(meetingId)
}

export interface ShellWindow {
  postMessage(message: unknown, targetOrigin: string): void
}

/**
 * The console's side of the shell API: says `ready` to the shell and handles what the shell sends. Only messages from
 * the shell window and the allowed shell origin are accepted; everything else is ignored.
 */
export class ShellClient {
  private readyId: string | null = null
  private connected = false
  private readonly shell: ShellWindow
  private readonly context: EmbedContext
  private readonly handlers: ShellClientHandlers

  constructor(shell: ShellWindow, context: EmbedContext, handlers: ShellClientHandlers) {
    this.shell = shell
    this.context = context
    this.handlers = handlers
  }

  get isConnected(): boolean {
    return this.connected
  }

  ready(): void {
    this.readyId = nextMessageId()
    this.send({ type: 'ready', id: this.readyId, payload: { versions: [...SUPPORTED_VERSIONS], surface: this.context.surface } })
  }

  handleMessage(event: { origin: string; source: unknown; data: unknown }): void {
    if (event.origin !== this.context.shellOrigin || event.source !== this.shell) return
    const message = parseShellMessage(event.data)
    if (!message) return
    if (message.type === 'init') {
      if (message.replyTo !== this.readyId || !SUPPORTED_VERSIONS.includes(message.payload.version)) return
      this.connected = true
      this.handlers.onInit(message.payload)
      return
    }
    // Nothing but the handshake answer before the handshake.
    if (!this.connected) return
    if (message.type === 'setLocale') this.handlers.onLocale(message.payload.locale)
    else if (message.type === 'setTheme') this.handlers.onTheme(message.payload.theme)
    else if (message.type === 'setSurface') this.handlers.onSurface(message.payload.surface, message.payload.id)
    else if (message.type === 'meetingContext') this.handlers.onMeetingContext(message.payload.meeting)
    else if (message.type === 'logout') {
      const replyTo = message.id
      void this.handlers.onLogout().finally(() => this.send({ type: 'loggedOut', replyTo }))
    }
  }

  /** Asks the shell to navigate. Only once connected. */
  navigate(destination: ShellDestination, id: string | null): void {
    if (this.connected) this.send({ type: 'navigate', payload: { destination, id } })
  }

  /** The meeting of the project in the combined view (null: none). Only once connected. */
  projectMeeting(meetingId: string | null): void {
    if (this.connected) this.send({ type: 'projectMeeting', payload: { meetingId } })
  }

  private send(message: ShellMessage): void {
    this.shell.postMessage(envelope(message), this.context.shellOrigin)
  }
}
