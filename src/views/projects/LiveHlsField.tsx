import { useState } from 'preact/hooks'
import { Icon } from '../../components/Icon'

// UNG-198: livesändningens HLS-adress (.m3u8) att dela med en TV-uppspelare (t.ex. Quicktime i fullskärm i ett församlingshem).
// Det är sändningens adress, inte inspelningens. Samma varning som i ingest-panelen finns som hjälptext på knappen.
export const LIVE_HLS_WARNING =
  'Den som har adressen kan se sändningen även när projektet inte är öppet för publik. Adressen gäller så länge projektets kanal finns, och ges ut på nytt för varje projekt som börjar sända. En TV-uppspelare som tappat strömmen (till exempel över natten) måste startas om av den som sköter TV:n.'

interface LiveHlsFieldProps {
  url: string
  /** Rubriken över fältet. */
  label?: string
  /** Varningsikonen med förklaring visas bara för live-adressen. */
  warning?: string | null
  copyLabel?: string
}

// Fältet delas av live-HLS-adressen (läge Live) och den publicerade videons HLS-adress (läge Ondemand), på samma plats i huvudet.
export function LiveHlsField({ url, label = 'Live-HLS (TV, uppspelare)', warning = LIVE_HLS_WARNING, copyLabel = 'Kopiera live-HLS-adressen' }: LiveHlsFieldProps) {
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
        <button class="pv-icon-btn" type="button" aria-label={copied ? 'Adressen kopierad' : copyLabel} title={copyLabel} onClick={() => void copy()}>
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
