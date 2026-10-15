// Shell API v1 (UNG-321): the postMessage protocol between ungap Shell and the services it frames. This file is COPIED,
// not shared, into every party (ungap-shell, live-console-v3, later meeting-web); keep the copies identical.
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
  payload: { version: number; surface: string; layout: ShellLayout; locale: ShellLocale; theme: ShellTheme }
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

export type ShellMessage = ReadyMessage | InitMessage | SetLocaleMessage | SetThemeMessage | LogoutMessage | LoggedOutMessage

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
      if (!isLayout(payload.layout) || !isLocale(payload.locale) || !isTheme(payload.theme)) return null
      return {
        type: 'init',
        replyTo: data.replyTo,
        payload: { version: payload.version as number, surface: payload.surface, layout: payload.layout, locale: payload.locale, theme: payload.theme },
      }
    case 'setLocale':
      return isLocale(payload.locale) ? { type: 'setLocale', payload: { locale: payload.locale } } : null
    case 'setTheme':
      return isTheme(payload.theme) ? { type: 'setTheme', payload: { theme: payload.theme } } : null
    case 'logout':
      return isString(data.id) ? { type: 'logout', id: data.id } : null
    case 'loggedOut':
      return isString(data.replyTo) ? { type: 'loggedOut', replyTo: data.replyTo } : null
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
