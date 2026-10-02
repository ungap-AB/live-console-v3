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
      setError(err instanceof Error ? err.message : 'Länken kunde inte användas.')
    } finally {
      setBusy(false)
    }
  }

  const invite = (redeemed?.kind ?? info?.kind) === 'invite'
  return (
    <div class="login-screen">
      <div class="login-card">
        <img class="login-logo theme-light-only" src={logoLightUrl} alt="Ungap" />
        <img class="login-logo theme-dark-only" src={logoDarkUrl} alt="Ungap" />
        {redeemed ? (
          <>
            <p class="login-sub">{invite ? 'Ditt konto är aktiverat' : 'Din nya PIN-kod'}</p>
            <p>Din personliga PIN-kod:</p>
            <p class="login-pin-reveal" aria-live="polite">{redeemed.pin}</p>
            <p class="login-note">
              Anteckna den nu — den visas bara en gång. Du loggar in med {redeemed.email} och den här PIN-koden.
            </p>
            <button class="btn btn-primary login-submit" type="button" onClick={() => onDone(redeemed.email)}>
              Till inloggningen
            </button>
          </>
        ) : info === null ? (
          <p class="login-sub">Kontrollerar länken…</p>
        ) : !info.valid ? (
          <>
            <p class="login-sub">Länken fungerar inte</p>
            <p class="login-note">Länken har gått ut eller har redan använts. Be om en ny{info.kind === 'reset' ? ' återställning' : ' inbjudan'}.</p>
            <button class="btn login-submit" type="button" onClick={() => onDone(null)}>Till inloggningen</button>
          </>
        ) : (
          <>
            <p class="login-sub">{invite ? `Välkommen${info.name ? `, ${info.name}` : ''}!` : 'Återställ din PIN-kod'}</p>
            <p class="login-note">
              {invite
                ? 'Klicka på knappen för att aktivera ditt konto. Du får då din personliga PIN-kod.'
                : 'Klicka på knappen för att få en ny PIN-kod. Din gamla PIN-kod slutar då gälla.'}
            </p>
            {error && <div class="login-error">{error}</div>}
            <button class="btn btn-primary login-submit" type="button" disabled={busy} onClick={() => void reveal()}>
              {busy ? 'Skapar…' : 'Visa min PIN-kod'}
            </button>
          </>
        )}
      </div>
    </div>
  )
}
