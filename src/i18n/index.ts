import { i18n } from '@lingui/core'
import type { Messages } from '@lingui/core'
import { messages as svMessages } from '../locales/sv.ts'

// UNG-221: the UI language. English is the source in the code (`t\`Publish\``); Swedish comes from sv.po and is the
// default. The choice is hidden until the language picker exists: only `?lang=en` (and `?lang=pseudo` in
// development) changes it, read once at start.

export type UiLocale = 'sv' | 'en' | 'pseudo'

/** Locales passed to `Intl` (dates, times, numbers): English uses en-GB for the 24-hour clock. */
const intlLocales: Record<UiLocale, string[]> = { sv: ['sv-SE'], en: ['en-GB'], pseudo: ['en-GB'] }

export function resolveLocale(search: string, allowPseudo: boolean): UiLocale {
  // Forgiving: `en`, `EN`, `en-GB`, `en_US` and `eng` all mean English (same for Swedish).
  const lang = new URLSearchParams(search).get('lang')?.trim().toLowerCase().split(/[-_]/)[0]
  if (lang === 'en' || lang === 'eng') return 'en'
  if (lang === 'sv' || lang === 'swe') return 'sv'
  if (lang === 'pseudo' && allowPseudo) return 'pseudo'
  return 'sv'
}

async function loadMessages(locale: UiLocale): Promise<Messages> {
  if (locale === 'en') return (await import('../locales/en.ts')).messages
  if (locale === 'pseudo' && import.meta.env.DEV) return (await import('../locales/pseudo.ts')).messages
  return svMessages
}

/** Activates the language from the URL and sets `<html lang>`. Call before the first render. */
export async function setupI18n(search: string): Promise<UiLocale> {
  const locale = resolveLocale(search, import.meta.env.DEV)
  i18n.loadAndActivate({ locale, locales: intlLocales[locale], messages: await loadMessages(locale) })
  document.documentElement.lang = locale === 'pseudo' ? 'en' : locale
  return locale
}

/** Tests run in Swedish (only the Swedish catalog is loaded synchronously). */
export function activateForTests(locale: 'sv'): void {
  i18n.loadAndActivate({ locale, locales: intlLocales[locale], messages: svMessages })
}

/** Number in the UI language's format (sv: `1 240`, en: `1,240`). */
export function formatNumber(value: number): string {
  return i18n.number(value)
}
