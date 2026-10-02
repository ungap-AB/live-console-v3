import { useState } from 'preact/hooks'
import { client } from '../data'
import type { CurrentUser } from '../data/types'
import logoLightUrl from '../images/ungap-presenter-2026-black.png'
import logoDarkUrl from '../images/ungap-presenter-2026-white.png'
import './LoginView.css'

interface LoginViewProps {
  onLogin: (user: CurrentUser) => void
  initialEmail?: string
}

export function LoginView({ onLogin, initialEmail = '' }: LoginViewProps) {
  const [email, setEmail] = useState(initialEmail)
  const [pin, setPin] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  // "Glömt PIN?": samma ruta byter till att be om en återställningslänk till e-postadressen.
  const [resetting, setResetting] = useState(false)
  const [resetSent, setResetSent] = useState(false)

  async function submit(e: Event) {
    e.preventDefault()
    setError(null)
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) {
      setError('Ange en giltig e-postadress.')
      return
    }
    setLoading(true)
    try {
      if (resetting) {
        await client.auth.requestPasswordReset(email.trim())
        setResetSent(true)
        return
      }
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
        <img class="login-logo theme-light-only" src={logoLightUrl} alt="ungap" />
        <img class="login-logo theme-dark-only" src={logoDarkUrl} alt="ungap" />
        <p class="login-sub">{resetting ? 'Glömt din PIN-kod?' : 'Välkommen att logga in'}</p>
        <label class="login-field">
          E-post
          <input
            type="email"
            required
            value={email}
            autoFocus={!initialEmail}
            onInput={(e) => setEmail(e.currentTarget.value)}
          />
        </label>
        {resetting ? (
          resetSent ? (
            <p class="login-note" role="status">
              Om adressen finns hos oss har vi skickat ett mejl med en länk. Länken gäller i en timme. Kontrollera även skräpposten.
            </p>
          ) : (
            <>
              <p class="login-note">Ange din e-postadress så skickar vi en länk där du får en ny PIN-kod.</p>
              {error && <div class="login-error">{error}</div>}
              <button class="btn btn-primary login-submit" type="submit" disabled={loading || !email}>
                {loading ? 'Skickar…' : 'Skicka återställningslänk'}
              </button>
            </>
          )
        ) : (
          <>
            <label class="login-field">
              PIN-kod
              <input
                class="login-pin"
                type="password"
                required
                inputMode="numeric"
                autoFocus={!!initialEmail}
                value={pin}
                onInput={(e) => setPin(e.currentTarget.value)}
              />
            </label>
            {error && <div class="login-error">{error}</div>}
            <button class="btn btn-primary login-submit" type="submit" disabled={loading || !email || !pin}>
              {loading ? 'Loggar in…' : 'Logga in'}
            </button>
          </>
        )}
        <button
          class="login-link"
          type="button"
          onClick={() => {
            setResetting((value) => !value)
            setResetSent(false)
            setError(null)
          }}
        >
          {resetting ? 'Tillbaka till inloggningen' : 'Glömt PIN-kod?'}
        </button>
      </form>
    </div>
  )
}
