import type { Client } from './client'
import { mockClient } from './mock/mockClient'

// Steg 2 väljer här mellan mockClient och en fetch-baserad klient, t.ex. via
// import.meta.env.VITE_API_BASE. Ingen vy ska importera mockClient direkt.
export const client: Client = mockClient
