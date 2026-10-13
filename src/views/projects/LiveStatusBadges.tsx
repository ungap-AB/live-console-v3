import { plural, t } from '@lingui/core/macro'
import { Icon } from '../../components/Icon'
import type { EncoderStatus } from './liveStatus'
import { formatNumber } from '../../i18n'

// Signalstatus och tittarantal som små märken. Används av projektets huvud och av utspelningsvyn i Live (UNG-179, UNG-269).
function viewersText(count: number): string {
  const viewers = formatNumber(count)
  return plural(count, { one: `${viewers} viewer`, other: `${viewers} viewers` })
}

export function EncoderStatusChip({ status }: { status: EncoderStatus }) {
  return (
    <div class={`pv-encoder-status is-${status.tone}`} role="status">
      <span class="pv-encoder-dot" aria-hidden="true" />
      <span>{status.label}</span>
    </div>
  )
}

export function ViewersChip({ count }: { count: number }) {
  return (
    <div class="pv-viewers" role="status" title={t`Concurrent viewers according to IVS. The number is an estimate with a few seconds' delay.`}>
      <Icon name="visibility" size={17} />
      <span>{viewersText(count)}</span>
    </div>
  )
}
