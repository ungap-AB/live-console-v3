import { t } from '@lingui/core/macro'
import { useState } from 'preact/hooks'
import { Icon } from '../../components/Icon'

// UNG-198: livesändningens HLS-adress (.m3u8) att dela med en TV-uppspelare (t.ex. Quicktime i fullskärm i ett församlingshem).
// Det är sändningens adress, inte inspelningens. Samma varning som i ingest-panelen finns som hjälptext på knappen.
export const liveHlsWarning = () =>
  t`Anyone who has the address can watch the broadcast even when the project is not open to the public. The address is valid as long as the project's channel exists, and is issued anew for every project that starts broadcasting. A TV player that has lost the stream (for example overnight) must be restarted by whoever runs the TV.`

interface LiveHlsFieldProps {
  url: string
  /** Rubriken över fältet. */
  label?: string
  /** Varningsikonen med förklaring visas bara för live-adressen. */
  warning?: string | null
  copyLabel?: string
}

// Fältet delas av live-HLS-adressen (läge Live) och den publicerade videons HLS-adress (läge Ondemand), på samma plats i huvudet.
export function LiveHlsField({ url, label = t`Live HLS (TV, player)`, warning = liveHlsWarning(), copyLabel = t`Copy the live HLS address` }: LiveHlsFieldProps) {
  const [copied, setCopied] = useState(false)

  async function copy() {
    try {
      await navigator.clipboard.writeText(url)
      setCopied(true)
      setTimeout(() => setCopied(false), 1500)
    } catch {
      // Kopieringen misslyckas tyst; adressen är synlig och går att markera.
    }
  }

  return (
    <div class="pv-field pv-link-field pv-live-hls">
      <div class="pv-label">{label}</div>
      <div class="pv-link">
        <span class="pv-link-url" title={url}>{url.replace(/^https?:\/\//, '')}</span>
        <button class="pv-icon-btn" type="button" aria-label={copied ? t`The address is copied` : copyLabel} title={copyLabel} onClick={() => void copy()}>
          <Icon name={copied ? 'check' : 'content_copy'} size={18} />
        </button>
        {warning && (
          <span class="pv-icon-btn pv-hint" role="note" tabIndex={0} aria-label={warning} title={warning}>
            <Icon name="warning" size={18} />
          </span>
        )}
      </div>
    </div>
  )
}
