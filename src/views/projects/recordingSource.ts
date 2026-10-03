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
  if (!value) return 'Ange adressen till en HLS-spellista.'
  let url: URL
  try {
    url = new URL(value)
  } catch {
    return 'Det där är ingen giltig adress.'
  }
  if (url.protocol !== 'https:') return 'Adressen måste börja med https://.'
  if (url.username || url.password) return 'Adressen får inte innehålla användarnamn eller lösenord.'
  if (!url.pathname.toLowerCase().endsWith('.m3u8')) return 'Adressen ska peka på en .m3u8-fil.'
  return null
}
