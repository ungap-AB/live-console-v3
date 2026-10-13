import { t } from '@lingui/core/macro'
import type { ShareEvent } from '../data/types'
import { mailErrorText } from './shareRecipients.ts'

// En rad i delningens logg, för detaljvyn under Nedladdningar.
export function shareEventText(event: ShareEvent): string {
  const detail = event.detail ?? ''
  switch (event.kind) {
    case 'created':
      return t`The share was created (${detail})`
    case 'downloaded':
      return t`Downloaded "${detail}"`
    case 'revoked':
      return t`Revoked by ${detail}`
    case 'mail_failed': {
      const [address, code] = detail.split(': ')
      return t`The email to ${address} was not sent (${mailErrorText(code)})`
    }
  }
}
