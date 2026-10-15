import { i18n } from '@lingui/core'
import type { Messages } from '@lingui/core'
import { messages as svMessages } from '../locales/sv.ts'

// UNG-221: the UI language. English is the source in the code (`t\`Publish\``); Swedish comes from sv.po and is the
// default. UNG-306: the operator chooses it on the login page and under My account; it is saved on the account (and
// remembered in this browser). Order: `?lang=` (override for test and support, `pseudo` only in development) > the
// account's language after login > the language remembered in this browser > the browser's languages > Swedish.

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

/** A language the operator can choose (pseudo is only a development override). */
export type ChosenLocale = 'sv' | 'en'

const STORAGE_KEY = 'ungap-console-language'

/** True when `?lang=` overrides the language: then neither the account nor the browser decides. */
export function hasLanguageOverride(search: string): boolean {
  return new URLSearchParams(search).get('lang') !== null
}

/** The browser's languages with the player's rule: English → English, Scandinavian → Swedish, nothing matching → Swedish. */
export function browserLocale(languages: readonly string[]): ChosenLocale {
  for (const tag of languages) {
    const lang = tag.trim().toLowerCase().split(/[-_]/)[0]
    if (lang === 'en') return 'en'
    if (['sv', 'nb', 'nn', 'no', 'da'].includes(lang)) return 'sv'
  }
  return 'sv'
}

/** The language the operator has chosen in this browser (login page or My account), if any. */
export function rememberedLocale(): ChosenLocale | null {
  try {
    const stored = localStorage.getItem(STORAGE_KEY)
    return stored === 'en' || stored === 'sv' ? stored : null
  } catch {
    return null
  }
}

function remember(locale: ChosenLocale) {
  try {
    localStorage.setItem(STORAGE_KEY, locale)
  } catch {
    // localStorage kan vara blockerat; valet gäller då bara tills sidan laddas om.
  }
}

async function activate(locale: UiLocale) {
  i18n.loadAndActivate({ locale, locales: intlLocales[locale], messages: await loadMessages(locale) })
  document.documentElement.lang = locale === 'pseudo' ? 'en' : locale
}

/** Activates the start language (see the order above, before login) and sets `<html lang>`. Call before the first render. */
export async function setupI18n(search: string): Promise<UiLocale> {
  const locale = hasLanguageOverride(search)
    ? resolveLocale(search, import.meta.env.DEV)
    : rememberedLocale() ?? browserLocale(navigator.languages ?? [navigator.language])
  await activate(locale)
  return locale
}

/** The active language as the operator's choice (pseudo counts as English). */
export function currentLocale(): ChosenLocale {
  return i18n.locale === 'sv' ? 'sv' : 'en'
}

/**
 * Switches the UI language while the console runs (a reload would log the operator out) and remembers it in this browser.
 * Components re-render through `useUiLocale`. A `?lang=` override keeps its language.
 */
export async function switchLanguage(locale: ChosenLocale): Promise<void> {
  remember(locale)
  if (hasLanguageOverride(window.location.search) || i18n.locale === locale) return
  await activate(locale)
}

/**
 * Embed mode (UNG-322): the shell decides the language. Switches without remembering it in this browser, so the
 * standalone console keeps the operator's own choice. A `?lang=` override keeps its language.
 */
export async function applyShellLanguage(locale: ChosenLocale): Promise<void> {
  if (hasLanguageOverride(window.location.search) || i18n.locale === locale) return
  await activate(locale)
}

/** Tests run in Swedish (only the Swedish catalog is loaded synchronously). */
export function activateForTests(locale: 'sv'): void {
  i18n.loadAndActivate({ locale, locales: intlLocales[locale], messages: svMessages })
}

/** The UI language sent to the server as Accept-Language, so its error messages match the console. */
export function serverLanguage(): 'sv' | 'en' {
  return i18n.locale === 'sv' ? 'sv' : 'en'
}

/** Number in the UI language's format (sv: `1 240`, en: `1,240`). */
export function formatNumber(value: number): string {
  return i18n.number(value)
}
