export function formatHms(totalSeconds: number): string {
  const s = Math.max(0, Math.round(totalSeconds))
  const h = Math.floor(s / 3600)
  const m = Math.floor((s % 3600) / 60)
  const sec = s % 60
  return [h, m, sec].map((v) => String(v).padStart(2, '0')).join(':')
}

export function parseHms(text: string): number | null {
  const parts = text.split(':').map(Number)
  if (parts.some((p) => Number.isNaN(p))) return null
  if (parts.length === 3) return parts[0] * 3600 + parts[1] * 60 + parts[2]
  if (parts.length === 2) return parts[0] * 60 + parts[1]
  if (parts.length === 1) return parts[0]
  return null
}

export function formatGb(bytes: number): string {
  return (bytes / (1024 * 1024 * 1024)).toFixed(1) + ' GB'
}

// Väljer enhet efter storlek — formatGb visar 0.0 GB för allt under ~50 MB.
export function formatBytes(bytes: number): string {
  const units = ['B', 'KB', 'MB', 'GB', 'TB']
  let value = bytes
  let unit = 0
  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024
    unit++
  }
  return `${unit === 0 ? value : value.toFixed(value >= 100 ? 0 : 1)} ${units[unit]}`
}

export function formatDateTime(iso: string): string {
  return new Date(iso).toLocaleString('sv-SE', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}

export function formatLocalTime(iso: string): string {
  return new Date(iso).toLocaleTimeString('sv-SE', {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  })
}

export function formatDate(iso: string | undefined): string {
  if (!iso) return '–'
  return new Date(iso).toLocaleDateString('sv-SE', { day: 'numeric', month: 'short', year: 'numeric' })
}

// Kompakt datum för listrader ("idag"/"17 sep") — se Live Console Dark Mode
// - take 2 (Projekt-listans nya datumkolumn).
export function formatShortDate(iso: string): string {
  const d = new Date(iso)
  if (d.toDateString() === new Date().toDateString()) return 'idag'
  return d.toLocaleDateString('sv-SE', { day: 'numeric', month: 'short' })
}
