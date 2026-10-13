import { t } from '@lingui/core/macro'
import { useEffect, useState } from 'preact/hooks'
import { client } from '../data'
import type { CredentialLinkInfo, CredentialLinkRedeemed } from '../data/types'
import logoLightUrl from '../images/ungap-presenter-2026-black.png'
import logoDarkUrl from '../images/ungap-presenter-2026-white.png'
import './LoginView.css'

interface CredentialLinkViewProps {
  token: string
  /** Användaren har noterat sin PIN och går vidare till inloggningen (med e-posten förifylld). */
  onDone: (email: string | null) => void
}

// Engångslänken i inbjudnings- och återställningsmejlen. Sidan hämtar bara information (GET, ändrar
// inget); PIN:en skapas först när användaren själv klickar på knappen, så att virusskannrar som
// öppnar länken i förväg inte förbrukar den.
export function CredentialLinkView({ token, onDone }: CredentialLinkViewProps) {
  const [info, setInfo] = useState<CredentialLinkInfo | null>(null)
  const [redeemed, setRedeemed] = useState<CredentialLinkRedeemed | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    client.auth.credentialLinkInfo(token)
      .then((result) => { if (!cancelled) setInfo(result) })
      .catch(() => { if (!cancelled) setInfo({ valid: false }) })
    return () => { cancelled = true }
  }, [token])

  async function reveal() {
    setBusy(true)
    setError(null)
    try {
      setRedeemed(await client.auth.redeemCredentialLink(token))
    } catch (err) {
      setError(err instanceof Error ? err.message : t`The link could not be used.`)
    } finally {
      setBusy(false)
    }
  }

  const invite = (redeemed?.kind ?? info?.kind) === 'invite'
  return (
    <div class="login-screen">
      <div class="login-card">
        <img class="login-logo theme-light-only" src={logoLightUrl} alt="ungap" />
        <img class="login-logo theme-dark-only" src={logoDarkUrl} alt="ungap" />
        {redeemed ? (
          <>
            <p class="login-sub">{invite ? t`Your account is activated` : t`Your new PIN`}</p>
            <p>{t`Your personal PIN:`}</p>
            <p class="login-pin-reveal" aria-live="polite">{redeemed.pin}</p>
            <p class="login-note">
              {t`Write it down now — it is only shown once. You log in with ${{ email: redeemed.email }} and this PIN.`}
            </p>
            <button class="btn btn-primary login-submit" type="button" onClick={() => onDone(redeemed.email)}>
              {t`To login`}
            </button>
          </>
        ) : info === null ? (
          <p class="login-sub">{t`Checking the link…`}</p>
        ) : !info.valid ? (
          <>
            <p class="login-sub">{t`The link does not work`}</p>
            <p class="login-note">{info.kind === 'reset' ? t`The link has expired or has already been used. Ask for a new reset.` : t`The link has expired or has already been used. Ask for a new invitation.`}</p>
            <button class="btn login-submit" type="button" onClick={() => onDone(null)}>{t`To login`}</button>
          </>
        ) : (
          <>
            <p class="login-sub">{invite ? (info.name ? t`Welcome, ${{ name: info.name }}!` : t`Welcome!`) : t`Reset your PIN`}</p>
            <p class="login-note">
              {invite
                ? t`Click the button to activate your account. You will then get your personal PIN.`
                : t`Click the button to get a new PIN. Your old PIN then stops working.`}
            </p>
            {error && <div class="login-error">{error}</div>}
            <button class="btn btn-primary login-submit" type="button" disabled={busy} onClick={() => void reveal()}>
              {busy ? t`Creating…` : t`Show my PIN`}
            </button>
          </>
        )}
      </div>
    </div>
  )
}
