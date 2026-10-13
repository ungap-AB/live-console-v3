import { t } from '@lingui/core/macro'
// Varifrån projektets video kommer. "upload" och "external" är videor som operatören själv tillfört (de godkänns innan de
// ersätter något och deras kapitel förankras med guiden); en extern HLS-adress kopieras inte och kan därför inte trimmas
// eller laddas ned förrän den kopierats (UNG-102).
export function isOperatorSupplied(source: string | undefined | null): boolean {
  return source === 'upload' || source === 'external'
}

export function isExternalSource(source: string | undefined | null): boolean {
  return source === 'external'
}

// Snabb kontroll i webbläsaren innan anropet; servern avgör värd (tillåtna värdar) och läser själv spellistan.
export function validateHlsUrl(raw: string): string | null {
  const value = raw.trim()
  if (!value) return t`Enter the address of an HLS playlist.`
  let url: URL
  try {
    url = new URL(value)
  } catch {
    return t`That is not a valid address.`
  }
  if (url.protocol !== 'https:') return t`The address must start with https://.`
  if (url.username || url.password) return t`The address must not contain a user name or password.`
  if (!url.pathname.toLowerCase().endsWith('.m3u8')) return t`The address must point to a .m3u8 file.`
  return null
}
