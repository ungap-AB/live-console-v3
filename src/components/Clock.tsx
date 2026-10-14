import { t } from '@lingui/core/macro'
import { i18n } from '@lingui/core'
import { useEffect, useState } from 'preact/hooks'
import { formatHms } from '../app/time'

interface ClockProps {
  /** UNG-308: when the signal started; the clock then also shows the broadcast duration ("08:45:29 / 00:02:47"). */
  since?: string | null
}

// Bara tid, inget datum — en stödklocka för operatören under en pågående sändning.
export function Clock({ since = null }: ClockProps) {
  const [now, setNow] = useState(() => new Date())

  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 1000)
    return () => clearInterval(id)
  }, [])

  const time = now.toLocaleTimeString(i18n.locales, { hour: '2-digit', minute: '2-digit', second: '2-digit' })
  if (!since) return <span class="clock">{time}</span>
  const duration = formatHms(Math.max(0, Math.floor((now.getTime() - Date.parse(since)) / 1000)))
  return (
    <span class="clock" title={t`Time / time since the signal started`}>
      {time} / {duration}
    </span>
  )
}
