import type { ComponentChildren } from 'preact'
import './SplitPane.css'

interface SplitPaneProps {
  list: ComponentChildren
  detail: ComponentChildren
  listLabel: string
  detailLabel: string
  /** Valfri extra klass på list-panen, för vy-specifik styling (t.ex. Projekt-listans full-bleed-läge). */
  listClassName?: string
}

export function SplitPane({ list, detail, listLabel, detailLabel, listClassName }: SplitPaneProps) {
  return (
    <div class="split">
      <section class={`pane ${listClassName ?? ''}`} aria-label={listLabel}>
        {list}
      </section>
      <section class="doc" aria-label={detailLabel}>
        {detail}
      </section>
    </div>
  )
}
