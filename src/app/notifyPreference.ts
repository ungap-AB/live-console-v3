// UNG-80 steg 3: operatörens val "Mejla mig när det är klart" för nedladdning och uppladdning. Kommer ihåg
// senaste valet i webbläsaren (bekvämlighet — servern avgör per jobb, och det som sparas där är det som gäller).
const KEY = 'ungap-live-console:notify-by-email'

export function readNotifyByEmail(): boolean {
  try {
    return localStorage.getItem(KEY) === '1'
  } catch {
    return false
  }
}

export function storeNotifyByEmail(value: boolean): void {
  try {
    if (value) localStorage.setItem(KEY, '1')
    else localStorage.removeItem(KEY)
  } catch {
    // Privat läge eller blockerad lagring: valet gäller bara den här sidvisningen.
  }
}
