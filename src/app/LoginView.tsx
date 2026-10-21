import { t } from '@lingui/core/macro'
import { useState } from 'preact/hooks'
import { LanguageSelect } from './LanguageSwitch'
import logoLightUrl from '../images/ungap-presenter-2026-black.png'
import logoDarkUrl from '../images/ungap-presenter-2026-white.png'
import './LoginView.css'

interface LoginViewProps {
  /** The operator was logged out (expired session or inactivity): the subtitle says so instead of the welcome. */
  loggedOut?: boolean
  /** Why the ungap login did not complete, shown above the button. */
  ssoError?: string | null
  /** Starts "Log in with ungap account" (ADR 001: the only login). */
  onSso: () => void
}

/** Step A3: the error codes the server's ungap login returns with (#/sso?error=…). */
export function ssoErrorMessage(code: string): string {
  switch (code) {
    case 'no_access':
      return t`Your ungap account has no access to ungap Live. Contact your administrator.`
    case 'several_organisations':
      return t`Your ungap account belongs to several organisations, which ungap Live does not support yet. Contact ungap.`
    case 'access_unavailable':
      return t`ungap's access service cannot be reached, so you cannot log in with an ungap account right now. Try again later.`
    case 'account_conflict':
      return t`Your ungap account cannot be connected to a user in ungap Live. Contact ungap.`
    default:
      return t`The login with your ungap account did not complete. Try again.`
  }
}

export function LoginView({ loggedOut = false, ssoError = null, onSso }: LoginViewProps) {
  const [starting, setStarting] = useState(false)
  return (
    <div class="login-screen">
      <div class="login-card">
        <img class="login-logo theme-light-only" src={logoLightUrl} alt="ungap" />
        <img class="login-logo theme-dark-only" src={logoDarkUrl} alt="ungap" />
        <p class="login-sub" role={loggedOut ? 'status' : undefined}>
          {loggedOut ? t`You were logged out, please log in again` : t`Welcome, please log in`}
        </p>
        {ssoError && (
          <div class="login-error" role="alert">
            {ssoError}
          </div>
        )}
        <button
          class="btn btn-primary login-submit"
          type="button"
          disabled={starting}
          onClick={() => {
            setStarting(true)
            onSso()
          }}
        >
          {starting ? t`Logging in…` : t`Log in with ungap account`}
        </button>
        <div class="login-footer">
          <LanguageSelect class="login-lang" />
        </div>
      </div>
    </div>
  )
}
