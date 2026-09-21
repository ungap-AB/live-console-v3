// Liten fetch-wrapper mot live-server-v3. Se API-ENDPOINTS.md för
// grundkonventioner: bas /api/v1, JSON, felformat { error: { code, message } }.

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
  constructor(code: string, message: string) {
    super(message)
    this.code = code
  }
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
  if (authToken) headers['Authorization'] = `Bearer ${authToken}`

  const response = await fetch(buildUrl(path, options.query), {
    method: options.method ?? 'GET',
    headers,
    body: options.body instanceof FormData ? options.body : options.body !== undefined ? JSON.stringify(options.body) : undefined,
  })

  if (response.status === 204) return undefined as T

  const payload = await response.json().catch(() => null)

  if (!response.ok) {
    const error = (payload as { error?: { code?: string; message?: string } } | null)?.error
    throw new ApiError(error?.code ?? 'unknown_error', error?.message ?? `Serverfel (${response.status}).`)
  }

  return payload as T
}
