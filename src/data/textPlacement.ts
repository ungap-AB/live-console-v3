import type { TextPlacement } from './types'

// UNG-96: servern skickar "top", "middle" eller "bottom". Saknas fältet (äldre server) eller är värdet okänt är det mitten.
export function toTextPlacement(value: unknown): TextPlacement {
  return value === 'top' || value === 'bottom' ? value : 'middle'
}
