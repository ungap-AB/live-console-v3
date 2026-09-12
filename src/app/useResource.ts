import { useCallback, useEffect, useState } from 'preact/hooks'

interface ResourceState<T> {
  data: T | undefined
  loading: boolean
  error: Error | undefined
}

// Generisk data-hämtning mot data/client.ts. Ersätter en global state-hanterare
// för mockup-fasen — varje vy äger sitt eget anrop och sin egen laddning/fel.
export function useResource<T>(fn: () => Promise<T>, deps: unknown[]) {
  const [state, setState] = useState<ResourceState<T>>({
    data: undefined,
    loading: true,
    error: undefined,
  })
  const [tick, setTick] = useState(0)

  useEffect(() => {
    let cancelled = false
    setState((s) => ({ ...s, loading: true, error: undefined }))
    fn().then(
      (data) => {
        if (!cancelled) setState({ data, loading: false, error: undefined })
      },
      (error: Error) => {
        if (!cancelled) setState({ data: undefined, loading: false, error })
      },
    )
    return () => {
      cancelled = true
    }
    // fn läses fritt — anroparen styr omhämtning via deps och reload()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [...deps, tick])

  const reload = useCallback(() => setTick((t) => t + 1), [])

  return { ...state, reload }
}
