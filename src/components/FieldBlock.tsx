import type { ComponentChildren } from 'preact'
import './FieldBlock.css'

interface FieldBlockProps {
  label?: string
  children: ComponentChildren
  grow?: boolean
  /** Streckad kant för att signalera ett tomt/okopplat fält (t.ex. ingen dagordning kopplad). */
  dashed?: boolean
}

// Det delade "etikett ovanför fältet"-mönstret — se granskningen 2026-09-17
// (Live Console Dark Mode - take 2): Spelarlänk, Dagordning och Namnlista
// hade tre olika layouter för samma sak. CopyField använder den här skalen
// internt; nya fält (Dagordning/Namnlista-koppling m.fl.) använder den direkt.
export function FieldBlock({ label, children, grow = false, dashed = false }: FieldBlockProps) {
  return (
    <div class={`field-block ${grow ? 'grow' : ''}`}>
      {label && <div class="field-block-label">{label}</div>}
      <div class={`field-block-row ${dashed ? 'dashed' : ''}`}>{children}</div>
    </div>
  )
}
