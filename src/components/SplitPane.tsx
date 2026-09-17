import type { ComponentChildren } from 'preact'
import './SplitPane.css'

interface SplitPaneProps {
  list: ComponentChildren
  detail: ComponentChildren
  listLabel: string
  detailLabel: string
}

export function SplitPane({ list, detail, listLabel, detailLabel }: SplitPaneProps) {
  return (
    <div class="split">
      <section class="pane" aria-label={listLabel}>
        {list}
      </section>
      <section class="doc" aria-label={detailLabel}>
        {detail}
      </section>
    </div>
  )
}
