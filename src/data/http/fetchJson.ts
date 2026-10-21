import { t } from '@lingui/core/macro'
// Liten fetch-wrapper mot live-server-v3. Se API-ENDPOINTS.md för
// grundkonventioner: bas /api/v1, JSON, felformat { error: { code, message } }.

import { serverLanguage } from '../../i18n'
import { isSessionLost } from './sessionLogic'

const BASE = (import.meta.env.VITE_API_BASE ?? '').replace(/\/+$/, '')

// ADR 001 (ungap-presenter/docs/adr-001-sso-bff-silent-frames.md): the console's session is an HttpOnly cookie on the
// API's host, set by the ungap login. The console never sees it: every call sends it (credentials: 'include') with the
// request header the API requires of cookie requests, and the console only knows whether it is signed in.
const REQUEST_HEADER = { 'X-Live-Request': '1' }
let signedIn = false

export function setSignedIn(value: boolean) {
  signedIn = value
}

// Tokens from before ADR 001 (sessionStorage) and before UNG-312 (localStorage) are removed.
function clearLegacyAuthTokens() {
  try {
    localStorage.removeItem('ungap-live-jwt')
    sessionStorage.removeItem('ungap-live-session')
  } catch {
    // Storage can be blocked.
  }
}

clearLegacyAuthTokens()

/** The absolute address of an API path, for full-page navigation (the ungap login). */
export function apiUrl(path: string): string {
  return new URL(BASE + path, window.location.origin).toString()
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

// An ended session (idle, lifetime, removed in Backoffice) shows at a call (UNG-128). Then the app is told, so it can show
// the login (or, framed, log in silently again) instead of every view showing its own error.
const sessionLostListeners = new Set<() => void>()

export function onSessionLost(listener: () => void): () => void {
  sessionLostListeners.add(listener)
  return () => sessionLostListeners.delete(listener)
}

function failFrom(response: Response, payload: unknown, wasSignedIn: boolean): ApiError {
  const error = (payload as { error?: { code?: string; message?: string } } | null)?.error
  const code = error?.code ?? 'unknown_error'
  if (isSessionLost(response.status, code, wasSignedIn)) {
    setSignedIn(false)
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
  const headers: Record<string, string> = { 'Accept-Language': serverLanguage(), ...REQUEST_HEADER }
  if (options.body !== undefined && !(options.body instanceof FormData)) headers['Content-Type'] = 'application/json'
  if (options.ifDraftRevision !== undefined) headers['If-Draft-Revision'] = String(options.ifDraftRevision)
  const wasSignedIn = signedIn

  const response = await fetch(buildUrl(path, options.query), {
    method: options.method ?? 'GET',
    headers,
    credentials: 'include',
    body: options.body instanceof FormData ? options.body : options.body !== undefined ? JSON.stringify(options.body) : undefined,
  })

  if (response.status === 204) return undefined as T

  const payload = await response.json().catch(() => null)

  if (!response.ok) throw failFrom(response, payload, wasSignedIn)

  return payload as T
}

// A file behind the login (a plain link would not carry the request header).
export async function apiBlob(path: string): Promise<Blob> {
  const wasSignedIn = signedIn
  const response = await fetch(buildUrl(path), { headers: { 'Accept-Language': serverLanguage(), ...REQUEST_HEADER }, credentials: 'include' })
  if (!response.ok) throw failFrom(response, await response.json().catch(() => null), wasSignedIn)
  return response.blob()
}
