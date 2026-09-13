import type { Client } from './client'
import { httpClient } from './http/httpClient'
import { mockClient } from './mock/mockClient'

// VITE_API_BASE satt (t.ex. i .env.local) → prata med live-server-v3 över
// riktig HTTP. Osatt → mockClient.ts, som tidigare. Ingen vy ska importera
// mockClient eller httpClient direkt.
export const client: Client = import.meta.env.VITE_API_BASE ? httpClient : mockClient
