import { useEffect, useState } from 'preact/hooks'

// Bara tid, inget datum — en stödklocka för operatören under en pågående sändning.
export function Clock() {
  const [now, setNow] = useState(() => new Date())

  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 1000)
    return () => clearInterval(id)
  }, [])

  return (
    <span class="clock">
      {now.toLocaleTimeString('sv-SE', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
    </span>
  )
}
