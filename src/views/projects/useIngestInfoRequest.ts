import { useEffect, useRef } from 'preact/hooks'

/**
 * Rubrikens Ingest info-knapp räknar upp en siffra (Livesandning); arbetsvyn öppnar spelarinställningarnas flik Ingest vid varje ny siffra.
 * Bara nya klick räknas: Before och Live monteras om när läget byts, och då ska en gammal siffra inte öppna dialogen.
 */
export function useIngestInfoRequest(request: number, open: () => void) {
  const seen = useRef(request)
  useEffect(() => {
    if (request === seen.current) return
    seen.current = request
    open()
  }, [request])
}
