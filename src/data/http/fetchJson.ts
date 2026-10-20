import { t } from '@lingui/core/macro'
// Liten fetch-wrapper mot live-server-v3. Se API-ENDPOINTS.md för
// grundkonventioner: bas /api/v1, JSON, felformat { error: { code, message } }.

import { serverLanguage } from '../../i18n'
import { isSessionLost, renewalDue } from './sessionLogic'

const BASE = (import.meta.env.VITE_API_BASE ?? '').replace(/\/+$/, '')

// UNG-312: the login is kept per tab (sessionStorage): it survives a reload but not a closed tab, and does not follow into
// new tabs. The token is short-lived and renewed while the console is in use (renewAuthTokenIfDue).
const TOKEN_KEY = 'ungap-live-session'

function readStoredToken(): string | null {
  try {
    return sessionStorage.getItem(TOKEN_KEY)
  } catch {
    return null
  }
}

let authToken: string | null = readStoredToken()

function clearLegacyAuthToken() {
  try {
    localStorage.removeItem('ungap-live-jwt')
  } catch {
    // localStorage kan vara blockerat.
  }
}

clearLegacyAuthToken()

export function setAuthToken(token: string | null) {
  authToken = token
  try {
    if (token) sessionStorage.setItem(TOKEN_KEY, token)
    else sessionStorage.removeItem(TOKEN_KEY)
  } catch {
    // sessionStorage kan vara blockerat: då gäller inloggningen bara tills sidan laddas om.
  }
}

/** The absolute address of an API path, for full-page navigation (step A3: the ungap login). */
export function apiUrl(path: string): string {
  return new URL(BASE + path, window.location.origin).toString()
}

export function getAuthToken(): string | null {
  return authToken
}

// UNG-312: the app says when renewal is allowed (not after the inactivity limit), so a request after a long sleep does
// not renew the token of a session that is about to be logged out.
let renewalAllowed: () => boolean = () => true

export function setRenewalGuard(guard: () => boolean) {
  renewalAllowed = guard
}

let renewing: Promise<void> | null = null

/** Renews the token once half its lifetime has passed. Failures are left to the next attempt; a 401 ends the session. */
export function renewAuthTokenIfDue(now = Date.now()): Promise<void> {
  if (renewing) return renewing
  const token = authToken
  if (!token || !renewalAllowed() || !renewalDue(token, now)) return Promise.resolve()
  renewing = api<{ token: string }>('/auth/refresh', { method: 'POST' })
    .then(
      (dto) => {
        // A logout while the request was under way wins.
        if (authToken === token) setAuthToken(dto.token)
      },
      () => undefined,
    )
    .finally(() => {
      renewing = null
    })
  return renewing
}

export class ApiError extends Error {
  code: string
  status: number
  constructor(code: string, message: string, status = 0) {
    super(message)
    this.code = code
    this.status = status
  }
}

// En ogiltig session (utgånget token, borttagen användare) märks först vid ett anrop (UNG-128). Då nollställs token och appen
// får veta det, så den kan visa inloggningen i stället för att varje vy visar sitt eget fel.
const sessionLostListeners = new Set<() => void>()

export function onSessionLost(listener: () => void): () => void {
  sessionLostListeners.add(listener)
  return () => sessionLostListeners.delete(listener)
}

function failFrom(response: Response, payload: unknown, sentToken: boolean): ApiError {
  const error = (payload as { error?: { code?: string; message?: string } } | null)?.error
  const code = error?.code ?? 'unknown_error'
  if (isSessionLost(response.status, code, sentToken)) {
    setAuthToken(null)
    for (const listener of [...sessionLostListeners]) listener()
    return new ApiError(code, t`Your session has expired. Log in again.`, response.status)
  }
  return new ApiError(code, error?.message ?? t`Server error (${response.status}).`, response.status)
}

interface RequestOptions {
  method?: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE'
  body?: unknown
  query?: Record<string, string | number | undefined>
  /** UNG-241: villkorar skrivningen på utkastets versionsnummer (headern If-Draft-Revision). Konflikt ger 409 draft_conflict. */
  ifDraftRevision?: number
}

function buildUrl(path: string, query?: RequestOptions['query']): string {
  const url = new URL(BASE + path, window.location.origin)
  if (query) {
    for (const [key, value] of Object.entries(query)) {
      if (value !== undefined && value !== '') url.searchParams.set(key, String(value))
    }
  }
  return url.toString()
}

export async function api<T>(path: string, options: RequestOptions = {}): Promise<T> {
  if (path !== '/auth/refresh') await renewAuthTokenIfDue()
  const headers: Record<string, string> = { 'Accept-Language': serverLanguage() }
  if (options.body !== undefined && !(options.body instanceof FormData)) headers['Content-Type'] = 'application/json'
  const sentToken = authToken !== null
  if (authToken) headers['Authorization'] = `Bearer ${authToken}`
  if (options.ifDraftRevision !== undefined) headers['If-Draft-Revision'] = String(options.ifDraftRevision)

  const response = await fetch(buildUrl(path, options.query), {
    method: options.method ?? 'GET',
    headers,
    body: options.body instanceof FormData ? options.body : options.body !== undefined ? JSON.stringify(options.body) : undefined,
  })

  if (response.status === 204) return undefined as T

  const payload = await response.json().catch(() => null)

  if (!response.ok) throw failFrom(response, payload, sentToken)

  return payload as T
}

// Hämtar en fil bakom inloggning (en vanlig länk skickar ingen Authorization-header).
export async function apiBlob(path: string): Promise<Blob> {
  await renewAuthTokenIfDue()
  const headers: Record<string, string> = { 'Accept-Language': serverLanguage() }
  const sentToken = authToken !== null
  if (authToken) headers['Authorization'] = `Bearer ${authToken}`
  const response = await fetch(buildUrl(path), { headers })
  if (!response.ok) throw failFrom(response, await response.json().catch(() => null), sentToken)
  return response.blob()
}
