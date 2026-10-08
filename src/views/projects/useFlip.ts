import { useLayoutEffect, useRef } from 'preact/hooks'
import type { RefObject } from 'preact'

// UNG-178: flyttar raderna i en lista mjukt när ordningen ändras (FLIP): före ändringen sparas varje rads läge, efter den animeras raden
// från sitt gamla till sitt nya läge. `ids` är raderna i visad ordning, i samma ordning som <li>-elementen i behållaren. Ingen animation
// vid reducerad rörelse.
export function useFlip(container: RefObject<HTMLElement>, ids: readonly string[], durationMs = 260) {
  const previous = useRef<Map<string, number>>(new Map())
  const key = ids.join('\u0000')

  useLayoutEffect(() => {
    const root = container.current
    if (!root) return
    const rows = Array.from(root.querySelectorAll<HTMLElement>(':scope > ol > li, :scope > li'))
    const next = new Map<string, number>()
    rows.forEach((row, index) => {
      const id = ids[index]
      if (id !== undefined && row.offsetParent !== null) next.set(id, row.offsetTop)
    })
    const reduced = typeof window.matchMedia === 'function' && window.matchMedia('(prefers-reduced-motion: reduce)').matches
    if (!reduced && previous.current.size > 0) {
      rows.forEach((row, index) => {
        const id = ids[index]
        const before = id === undefined ? undefined : previous.current.get(id)
        const after = id === undefined ? undefined : next.get(id)
        if (before === undefined || after === undefined || before === after || typeof row.animate !== 'function') return
        row.animate([{ transform: `translateY(${before - after}px)` }, { transform: 'translateY(0)' }], { duration: durationMs, easing: 'ease' })
      })
    }
    previous.current = next
  }, [key])
}
