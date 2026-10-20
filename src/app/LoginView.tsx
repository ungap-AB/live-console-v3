import { t } from '@lingui/core/macro'
import { useState } from 'preact/hooks'
import { rememberedLocale } from '../i18n'
import { LanguageSelect } from './LanguageSwitch'
import { client } from '../data'
import type { CurrentUser } from '../data/types'
import logoLightUrl from '../images/ungap-presenter-2026-black.png'
import logoDarkUrl from '../images/ungap-presenter-2026-white.png'
import './LoginView.css'

interface LoginViewProps {
  onLogin: (user: CurrentUser) => void
  initialEmail?: string
  /** The operator was logged out (expired session or inactivity): the subtitle says so instead of the welcome. */
  loggedOut?: boolean
  /** Step A3: why the ungap login did not complete, shown above the form. */
  ssoError?: string | null
  /** Step A3: starts "Log in with ungap account"; null hides the button (mock). */
  onSso?: (() => void) | null
}

/** Step A3: the error codes the server's ungap login returns with (#/sso?error=…). */
export function ssoErrorMessage(code: string): string {
  switch (code) {
    case 'no_access':
      return t`Your ungap account has no access to ungap Live. Contact your administrator.`
    case 'sso_not_enabled':
      return t`Your organisation does not log in with an ungap account yet. Log in with your PIN.`
    case 'several_organisations':
      return t`Your ungap account belongs to several organisations, which ungap Live does not support yet. Contact ungap.`
    case 'account_conflict':
      return t`Your ungap account cannot be connected to a user in ungap Live. Contact ungap.`
    default:
      return t`The login with your ungap account did not complete. Try again.`
  }
}

export function LoginView({ onLogin, initialEmail = '', loggedOut = false, ssoError = null, onSso = null }: LoginViewProps) {
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
      setError(t`Enter a valid email address.`)
      return
    }
    setLoading(true)
    try {
      if (resetting) {
        await client.auth.requestPasswordReset(email.trim())
        setResetSent(true)
        return
      }
      // UNG-306: a language chosen on this browser is saved on an account that has none yet.
      const user = await client.auth.login(email, pin, rememberedLocale() ?? undefined)
      onLogin(user)
    } catch (err) {
      setError(err instanceof Error ? err.message : t`Could not log in.`)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div class="login-screen">
      <form class="login-card" onSubmit={submit}>
        <img class="login-logo theme-light-only" src={logoLightUrl} alt="ungap" />
        <img class="login-logo theme-dark-only" src={logoDarkUrl} alt="ungap" />
        <p class="login-sub" role={loggedOut && !resetting ? 'status' : undefined}>
          {resetting ? t`Forgot your PIN?` : loggedOut ? t`You were logged out, please log in again` : t`Welcome, please log in`}
        </p>
        {ssoError && !resetting && (
          <div class="login-error" role="alert">
            {ssoError}
          </div>
        )}
        <label class="login-field">
          {t`Email`}
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
              {t`If we have the address, we have sent an email with a link. The link is valid for one hour. Check your spam folder too.`}
            </p>
          ) : (
            <>
              <p class="login-note">{t`Enter your email address and we will send you a link where you get a new PIN.`}</p>
              {error && <div class="login-error">{error}</div>}
              <button class="btn btn-primary login-submit" type="submit" disabled={loading || !email}>
                {loading ? t`Sending…` : t`Send reset link`}
              </button>
            </>
          )
        ) : (
          <>
            <label class="login-field">
              {t`PIN`}
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
              {loading ? t`Logging in…` : t`Log in`}
            </button>
            {onSso && (
              <button class="btn login-submit" type="button" onClick={onSso}>
                {t`Log in with ungap account`}
              </button>
            )}
          </>
        )}
        <div class="login-footer">
          <button
            class="login-link"
            type="button"
            onClick={() => {
              setResetting((value) => !value)
              setResetSent(false)
              setError(null)
            }}
          >
            {resetting ? t`Back to login` : t`Forgot PIN?`}
          </button>
          <LanguageSelect class="login-lang" />
        </div>
      </form>
    </div>
  )
}
