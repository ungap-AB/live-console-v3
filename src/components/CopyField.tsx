import { useState } from 'preact/hooks'
import './CopyField.css'

interface CopyFieldProps {
  label?: string
  value: string | null
  placeholder?: string
  monospace?: boolean
  mask?: boolean
}

export function CopyField({ label, value, placeholder = '–', monospace = false, mask = false }: CopyFieldProps) {
  const [copied, setCopied] = useState(false)

  async function copy() {
    if (value == null) return
    try {
      await navigator.clipboard.writeText(value)
      setCopied(true)
      setTimeout(() => setCopied(false), 1500)
    } catch {
      // clipboard access denied — nothing sensible to show the user beyond leaving the button unchanged
    }
  }

  const displayValue =
    value == null ? placeholder : mask ? '•'.repeat(Math.min(value.length, 24)) : value

  return (
    <div class="copy-field">
      {label && <div class="copy-field-label">{label}</div>}
      <div class="copy-field-row">
        <span class={`copy-field-value ${monospace ? 'mono' : ''} ${value == null ? 'placeholder' : ''}`}>
          {displayValue}
        </span>
        <button
          class="ib"
          type="button"
          onClick={copy}
          disabled={value == null}
          title="Kopiera"
          aria-label={`Kopiera ${label ?? 'värde'}`}
        >
          {copied ? '✓' : '⧉'}
        </button>
      </div>
    </div>
  )
}
