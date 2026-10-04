// UNG-105: optimistiska uppdateringar. Ändringen visas direkt; anropet körs efteråt. Går det bra ersätter serverns svar den
// optimistiska kopian, går det fel återställs det gamla värdet och felet visas.
//
// Samma `key` (en post, t.ex. "project:p1") gör att ett äldre anrops svar eller fel ignoreras när ett nyare anrop för samma post
// startat sedan dess, så ett sent svar aldrig skriver över ett nyare namn.
//
// Begränsning: återställningen sätter tillbaka det som visades *före* just det anropet. Misslyckas två snabba ändringar efter
// varandra kan det återställda värdet därför vara det första, optimistiska, namnet — nästa hämtning från servern rättar det.

const latest = new Map<string, number>()
let sequence = 0

export interface OptimisticOptions<R> {
  key: string
  /** Visar ändringen direkt och returnerar en funktion som återställer den. */
  apply: () => () => void
  request: () => Promise<R>
  /** Serverns svar; anropas bara om det fortfarande är det senaste anropet för posten. */
  onSuccess?: (result: R) => void
  onError: (error: unknown) => void
}

/** Resolvar true när anropet lyckades (och inte hunnit bli inaktuellt), annars false. */
export async function runOptimistic<R>(options: OptimisticOptions<R>): Promise<boolean> {
  const id = ++sequence
  latest.set(options.key, id)
  const undo = options.apply()
  try {
    const result = await options.request()
    if (latest.get(options.key) !== id) return true
    options.onSuccess?.(result)
    return true
  } catch (error) {
    if (latest.get(options.key) === id) undo()
    options.onError(error)
    return false
  } finally {
    if (latest.get(options.key) === id) latest.delete(options.key)
  }
}

export function errorMessage(error: unknown, fallback = 'Något gick fel.'): string {
  return error instanceof Error && error.message ? error.message : fallback
}
