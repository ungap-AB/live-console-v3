import { i18n } from '@lingui/core'
import { useEffect, useState } from 'preact/hooks'

/** UNG-306: the active UI language; the component re-renders when it is switched (see switchLanguage). */
export function useUiLocale(): string {
  const [locale, setLocale] = useState(i18n.locale)
  useEffect(() => i18n.on('change', () => setLocale(i18n.locale)), [])
  return locale
}
