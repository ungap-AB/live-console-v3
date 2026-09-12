import { useEffect, useState } from 'preact/hooks'

// Tvingar fram en omritning varje sekund så att härledd sändningstid (som
// läses av Date.now() vid varje render) känns levande i UI:t.
export function useTick(active: boolean) {
  const [, setTick] = useState(0)

  useEffect(() => {
    if (!active) return
    const id = setInterval(() => setTick((t) => t + 1), 1000)
    return () => clearInterval(id)
  }, [active])
}
