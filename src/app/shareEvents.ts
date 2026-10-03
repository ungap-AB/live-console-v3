import type { ShareEvent } from '../data/types'
import { mailErrorText } from './shareRecipients.ts'

// En rad i delningens logg, för detaljvyn under Nedladdningar.
export function shareEventText(event: ShareEvent): string {
  const detail = event.detail ?? ''
  switch (event.kind) {
    case 'created':
      return `Delningen skapades (${detail})`
    case 'downloaded':
      return `Hämtade "${detail}"`
    case 'revoked':
      return `Återkallades av ${detail}`
    case 'mail_failed': {
      const [address, code] = detail.split(': ')
      return `Mejlet till ${address} gick inte iväg (${mailErrorText(code)})`
    }
  }
}
