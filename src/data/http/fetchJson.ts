// Liten fetch-wrapper mot live-server-v3. Se API-ENDPOINTS.md för
// grundkonventioner: bas /api/v1, JSON, felformat { error: { code, message } }.

import { isSessionLost } from './sessionLogic'

const BASE = (import.meta.env.VITE_API_BASE ?? '').replace(/\/+$/, '')

let authToken: string | null = null

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
}

export function getAuthToken(): string | null {
  return authToken
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
    authToken = null
    for (const listener of [...sessionLostListeners]) listener()
    return new ApiError(code, 'Din session har gått ut. Logga in igen.', response.status)
  }
  return new ApiError(code, error?.message ?? `Serverfel (${response.status}).`, response.status)
}

interface RequestOptions {
  method?: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE'
  body?: unknown
  query?: Record<string, string | number | undefined>
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
  const headers: Record<string, string> = {}
  if (options.body !== undefined && !(options.body instanceof FormData)) headers['Content-Type'] = 'application/json'
  const sentToken = authToken !== null
  if (authToken) headers['Authorization'] = `Bearer ${authToken}`

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
  const headers: Record<string, string> = {}
  const sentToken = authToken !== null
  if (authToken) headers['Authorization'] = `Bearer ${authToken}`
  const response = await fetch(buildUrl(path), { headers })
  if (!response.ok) throw failFrom(response, await response.json().catch(() => null), sentToken)
  return response.blob()
}
