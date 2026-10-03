// UNG-80 steg 4: tolkar mottagarfältet i delningsdialogen. Adresser kan klistras in åtskilda av komma, semikolon,
// radbrytning eller mellanslag, eller som "Namn <adress>" (som i en e-postklient). Samma regel som servern.
const VALID = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

export interface ParsedRecipients {
  valid: string[]
  invalid: string[]
}

export function parseRecipients(text: string): ParsedRecipients {
  const valid: string[] = []
  const invalid: string[] = []
  for (const part of text.split(/[,;\n]+/)) {
    const angle = part.match(/<([^<>\s]+)>/)
    const tokens = angle ? [angle[1]] : part.trim().split(/\s+/).filter(Boolean)
    for (const token of tokens) {
      const address = token.toLowerCase()
      const list = VALID.test(address) ? valid : invalid
      if (!list.includes(address)) list.push(address)
    }
  }
  return { valid, invalid }
}

// Varför ett mejl inte gick iväg, för resultatvyn.
export function mailErrorText(code?: string): string {
  switch (code) {
    case 'email_rate_limited':
      return 'för många mejl till adressen den senaste timmen'
    case 'invalid_email':
      return 'ogiltig adress'
    default:
      return 'mejlet kunde inte köas'
  }
}
