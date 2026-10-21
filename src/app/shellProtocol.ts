// Shell API v1 (UNG-321): the postMessage protocol between ungap Shell and the services it frames. This file is COPIED,
// not shared, into every party (ungap-shell, live-console-v3, meeting-web, live-backoffice's frontend); keep the copies
// identical.
// The protocol is documented in ungap-shell/docs/shell-api.md.

export const SHELL_PROTOCOL = 'ungap-shell'
/** The major versions this copy speaks. Within a major version, changes are additive only. */
export const SUPPORTED_VERSIONS: readonly number[] = [1]

export type ShellLocale = 'sv' | 'en'
export type ShellTheme = 'light' | 'dark' | 'auto'
export type ShellLayout = 'single' | 'combined'

/** Service → shell: the service has loaded and listens. The shell answers with `init` (replyTo = this id). */
export interface ReadyMessage {
  type: 'ready'
  id: string
  payload: { versions: number[]; surface: string }
}

/** Shell → service: the answer to `ready`, with the agreed version and the shell's current settings. */
export interface InitMessage {
  type: 'init'
  replyTo: string
  payload: { version: number; surface: string; layout: ShellLayout; locale: ShellLocale; theme: ShellTheme; id: string | null }
}

/** Shell → service: the user changed language in the shell. */
export interface SetLocaleMessage {
  type: 'setLocale'
  payload: { locale: ShellLocale }
}

/** Shell → service: the user changed appearance in the shell. */
export interface SetThemeMessage {
  type: 'setTheme'
  payload: { theme: ShellTheme }
}

/**
 * Shell → service: show another surface in the same frame (the shell keeps one frame per service and moves it between
 * the destinations that use it). Not a reload: the service switches view and keeps its state.
 */
export interface SetSurfaceMessage {
  type: 'setSurface'
  /** id: the object the surface shows (from the shell's address, e.g. `#/broadcasts/<id>`), or null for its list. */
  payload: { surface: string; layout: ShellLayout; id: string | null }
}

/** Shell → service: the user logs out in the shell. The service ends its session and answers `loggedOut`. */
export interface LogoutMessage {
  type: 'logout'
  id: string
}

/** Service → shell: the answer to `logout`, sent when the service's session has ended (or failed to end). */
export interface LoggedOutMessage {
  type: 'loggedOut'
  replyTo: string
}

/** A meeting open in ungap Meeting, as the shell passes it on (UNG-332). */
export interface ShellMeeting {
  id: string
  title: string
}

/**
 * Where `navigate` can go. The shell owns the addresses: `#/<destination>/<id>`. `organisation` (step A7b): the customer
 * administration (ungap Backoffice's members and invitations), for an org.admin.
 */
export type ShellDestination = 'projects' | 'broadcasts' | 'meetings' | 'namelists' | 'jobs' | 'organisation'
export const SHELL_DESTINATIONS: readonly ShellDestination[] = ['projects', 'broadcasts', 'meetings', 'namelists', 'jobs', 'organisation']

/**
 * Service → shell: go to a destination, optionally one object in it (flows-and-views.md). A service never opens another
 * service's address itself. `projects` + a project id opens the combined playout view for that project.
 */
export interface NavigateMessage {
  type: 'navigate'
  payload: { destination: ShellDestination; id: string | null }
}

/**
 * Service → shell: the project shown in this frame uses this meeting (null: it has none). Presenter sends it for the
 * combined view's project; the shell answers by sending `showMeeting` to Meeting's frame. The shell never looks it up.
 */
export interface ProjectMeetingMessage {
  type: 'projectMeeting'
  payload: { meetingId: string | null }
}

/** Shell → service: open this meeting (null: the meeting list). Sent to Meeting's frame after `projectMeeting`. */
export interface ShowMeetingMessage {
  type: 'showMeeting'
  payload: { meetingId: string | null }
}

/**
 * Both directions (UNG-332). Service → shell: the meeting now open in this frame (null: none). Shell → service: the same,
 * passed on to the other frames, and sent again after their handshake, so the status strip can say whether the open
 * meeting is the one that drives the project's graphics.
 */
export interface MeetingContextMessage {
  type: 'meetingContext'
  payload: { meeting: ShellMeeting | null }
}

/**
 * Shell → service (step A6): who is logged in to the shell, sent after `init` and again when it changes. The service
 * compares it with its own session: another person means the service's session is not this user's (it logs out and
 * asks for a login); another organisation is handled as `orgChanged`. Null fields: unknown to the shell.
 */
export interface SessionMessage {
  type: 'session'
  payload: { personId: string | null; organisationId: string | null }
}

/**
 * Service → shell (step A6): the service has no session for the shell's user. The shell runs the service's login in the
 * whole window (a relay through the service's own login and back), at most once per shell session, then reloads.
 */
export interface LoginRequiredMessage {
  type: 'loginRequired'
}

/** Shell → service (step A6): the user switched organisation in the shell. The service switches too, or says it cannot. */
export interface OrgChangedMessage {
  type: 'orgChanged'
  payload: { organisationId: string }
}

export type ShellMessage =
  | ReadyMessage
  | InitMessage
  | SetLocaleMessage
  | SetThemeMessage
  | SetSurfaceMessage
  | LogoutMessage
  | LoggedOutMessage
  | NavigateMessage
  | ProjectMeetingMessage
  | ShowMeetingMessage
  | MeetingContextMessage
  | SessionMessage
  | LoginRequiredMessage
  | OrgChangedMessage

type Envelope<M> = M & { protocol: typeof SHELL_PROTOCOL }

export function envelope<M extends ShellMessage>(message: M): Envelope<M> {
  return { protocol: SHELL_PROTOCOL, ...message }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

const isString = (value: unknown): value is string => typeof value === 'string' && value.length > 0
const isLocale = (value: unknown): value is ShellLocale => value === 'sv' || value === 'en'
const isTheme = (value: unknown): value is ShellTheme => value === 'light' || value === 'dark' || value === 'auto'
/** An object id from an address: absent, null or a short string without path or query characters. */
const isOptionalId = (value: unknown): value is string | null | undefined =>
  value === undefined || value === null || (isString(value) && value.length <= 100 && /^[A-Za-z0-9_-]+$/.test(value))
const isMeetingId = (value: unknown): value is string | null => value === null || isString(value)
const isLayout = (value: unknown): value is ShellLayout => value === 'single' || value === 'combined'

/**
 * A message of this protocol, or null for anything else (other protocols, unknown types, malformed fields): unknown
 * messages are ignored, never answered. Fields that a later minor change adds are allowed and dropped here.
 * The ORIGIN is not checked here; the receiver checks it against its allowlist before calling this.
 */
export function parseShellMessage(data: unknown): ShellMessage | null {
  if (!isRecord(data) || data.protocol !== SHELL_PROTOCOL) return null
  const payload = isRecord(data.payload) ? data.payload : {}
  switch (data.type) {
    case 'ready':
      if (!isString(data.id) || !isString(payload.surface) || !Array.isArray(payload.versions)) return null
      return {
        type: 'ready',
        id: data.id,
        payload: { versions: payload.versions.filter((v): v is number => Number.isInteger(v)), surface: payload.surface },
      }
    case 'init':
      if (!isString(data.replyTo) || !Number.isInteger(payload.version) || !isString(payload.surface)) return null
      if (!isLayout(payload.layout) || !isLocale(payload.locale) || !isTheme(payload.theme) || !isOptionalId(payload.id)) return null
      return {
        type: 'init',
        replyTo: data.replyTo,
        payload: { version: payload.version as number, surface: payload.surface, layout: payload.layout, locale: payload.locale, theme: payload.theme, id: payload.id ?? null },
      }
    case 'setLocale':
      return isLocale(payload.locale) ? { type: 'setLocale', payload: { locale: payload.locale } } : null
    case 'setTheme':
      return isTheme(payload.theme) ? { type: 'setTheme', payload: { theme: payload.theme } } : null
    case 'setSurface':
      return isString(payload.surface) && isLayout(payload.layout) && isOptionalId(payload.id)
        ? { type: 'setSurface', payload: { surface: payload.surface, layout: payload.layout, id: payload.id ?? null } }
        : null
    case 'logout':
      return isString(data.id) ? { type: 'logout', id: data.id } : null
    case 'loggedOut':
      return isString(data.replyTo) ? { type: 'loggedOut', replyTo: data.replyTo } : null
    case 'navigate':
      if (!SHELL_DESTINATIONS.includes(payload.destination as ShellDestination) || !isOptionalId(payload.id)) return null
      return { type: 'navigate', payload: { destination: payload.destination as ShellDestination, id: payload.id ?? null } }
    case 'projectMeeting':
      return isMeetingId(payload.meetingId) ? { type: 'projectMeeting', payload: { meetingId: payload.meetingId } } : null
    case 'showMeeting':
      return isMeetingId(payload.meetingId) ? { type: 'showMeeting', payload: { meetingId: payload.meetingId } } : null
    case 'meetingContext': {
      if (payload.meeting === null) return { type: 'meetingContext', payload: { meeting: null } }
      const meeting = isRecord(payload.meeting) ? payload.meeting : null
      if (!meeting || !isString(meeting.id) || typeof meeting.title !== 'string') return null
      return { type: 'meetingContext', payload: { meeting: { id: meeting.id, title: meeting.title } } }
    }
    case 'session': {
      const person = payload.personId === null || isString(payload.personId) ? payload.personId : undefined
      const org = payload.organisationId === null || isString(payload.organisationId) ? payload.organisationId : undefined
      return person === undefined || org === undefined ? null : { type: 'session', payload: { personId: person as string | null, organisationId: org as string | null } }
    }
    case 'loginRequired':
      return { type: 'loginRequired' }
    case 'orgChanged':
      return isString(payload.organisationId) ? { type: 'orgChanged', payload: { organisationId: payload.organisationId } } : null
    default:
      return null
  }
}

/** The highest major version both sides speak, or null when there is none (then the shell does not answer). */
export function negotiateVersion(offered: readonly number[]): number | null {
  const common = offered.filter((v) => SUPPORTED_VERSIONS.includes(v))
  return common.length > 0 ? Math.max(...common) : null
}

let counter = 0
/** A message id, unique within this window; answers are matched on it. */
export function nextMessageId(): string {
  counter += 1
  return `${Date.now().toString(36)}-${counter}`
}
