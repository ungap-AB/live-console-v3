import { Icon } from '../../components/Icon'
import type { EncoderStatus } from './liveStatus'

// Signalstatus och tittarantal som små märken. Används av projektets huvud och av det expanderade live-läget (UNG-179).
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
    <div class="pv-viewers" role="status" title="Samtidiga tittare enligt IVS. Siffran är en uppskattning med några sekunders fördröjning.">
      <Icon name="visibility" size={17} />
      <span>{count.toLocaleString('sv-SE')} tittare</span>
    </div>
  )
}
