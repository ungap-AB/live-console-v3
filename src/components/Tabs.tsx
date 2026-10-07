import { useRef } from 'preact/hooks'
import './Tabs.css'

export interface TabItem {
  id: string
  label: string
}

interface TabsProps {
  tabs: readonly TabItem[]
  active: string
  onChange: (id: string) => void
  label: string
  /** Prefix för id:n, så att tabpanel kan peka tillbaka (aria-labelledby) och fliken peka på panelen (aria-controls). */
  idPrefix: string
}

// Flikrad (WAI-ARIA tabs): pil vänster/höger flyttar mellan flikar, Home/End hoppar till första/sista, bara den aktiva fliken har
// tabindex 0. Panelerna renderas av anroparen (med role="tabpanel", id `${idPrefix}-panel-${id}` och hidden när de inte är aktiva), så
// att en inaktiv panel kan stå kvar monterad (t.ex. en pågående uppladdning).
export function Tabs({ tabs, active, onChange, label, idPrefix }: TabsProps) {
  const refs = useRef(new Map<string, HTMLButtonElement>())

  function onKeyDown(event: KeyboardEvent, index: number) {
    let next = index
    if (event.key === 'ArrowRight') next = (index + 1) % tabs.length
    else if (event.key === 'ArrowLeft') next = (index - 1 + tabs.length) % tabs.length
    else if (event.key === 'Home') next = 0
    else if (event.key === 'End') next = tabs.length - 1
    else return
    event.preventDefault()
    onChange(tabs[next].id)
    refs.current.get(tabs[next].id)?.focus()
  }

  return (
    <div class="tabs" role="tablist" aria-label={label}>
      {tabs.map((tab, index) => (
        <button
          key={tab.id}
          ref={(element) => {
            if (element) refs.current.set(tab.id, element)
            else refs.current.delete(tab.id)
          }}
          id={`${idPrefix}-tab-${tab.id}`}
          class={`tab${tab.id === active ? ' is-active' : ''}`}
          role="tab"
          type="button"
          aria-selected={tab.id === active}
          aria-controls={`${idPrefix}-panel-${tab.id}`}
          tabIndex={tab.id === active ? 0 : -1}
          onClick={() => onChange(tab.id)}
          onKeyDown={(event) => onKeyDown(event, index)}
        >
          {tab.label}
        </button>
      ))}
    </div>
  )
}
