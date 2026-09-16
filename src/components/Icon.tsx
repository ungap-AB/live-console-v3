import './Icon.css'

interface IconProps {
  name: string
  size?: number
}

// Google Fonts Material Symbols (webbfont, se index.html) — ligatur-baserad,
// namnet skrivs ut som text och fonten ritar rätt glyf.
export function Icon({ name, size = 20 }: IconProps) {
  return (
    <span class="material-symbols-outlined" style={{ fontSize: `${size}px` }} aria-hidden="true">
      {name}
    </span>
  )
}
