import { useState } from 'preact/hooks'
import { client } from '../data'
import type { CurrentUser } from '../data/types'
import logoLightUrl from '../images/ungap-presenter-2026-black.png'
import logoDarkUrl from '../images/ungap-presenter-2026-white.png'
import './LoginView.css'

interface LoginViewProps {
  onLogin: (user: CurrentUser) => void
}

export function LoginView({ onLogin }: LoginViewProps) {
  const [email, setEmail] = useState('')
  const [pin, setPin] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  async function submit(e: Event) {
    e.preventDefault()
    setError(null)
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) {
      setError('Ange en giltig e-postadress.')
      return
    }
    setLoading(true)
    try {
      const user = await client.auth.login(email, pin)
      onLogin(user)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Kunde inte logga in.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div class="login-screen">
      <form class="login-card" onSubmit={submit}>
        <img class="login-logo theme-light-only" src={logoLightUrl} alt="Ungap" />
        <img class="login-logo theme-dark-only" src={logoDarkUrl} alt="Ungap" />
        <p class="login-sub">Välkommen att logga in</p>
        <label class="login-field">
          E-post
          <input
            type="email"
            required
            value={email}
            autoFocus
            onInput={(e) => setEmail(e.currentTarget.value)}
          />
        </label>
        <label class="login-field">
          PIN-kod
          <input
            type="password"
            required
            inputMode="numeric"
            value={pin}
            onInput={(e) => setPin(e.currentTarget.value)}
          />
        </label>
        {error && <div class="login-error">{error}</div>}
        <button class="btn btn-primary login-submit" type="submit" disabled={loading || !email || !pin}>
          {loading ? 'Loggar in…' : 'Logga in'}
        </button>
      </form>
    </div>
  )
}
