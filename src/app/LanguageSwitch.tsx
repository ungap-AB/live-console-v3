import { t } from '@lingui/core/macro'
import { currentLocale, switchLanguage, type ChosenLocale } from '../i18n'
import { useUiLocale } from './useUiLocale'
import './LanguageSwitch.css'

// UNG-306: the language names are written in their own language, so they can be found whatever the current language is.
const LANGUAGES: { value: ChosenLocale; label: string; lang: string }[] = [
  { value: 'sv', label: 'Svenska', lang: 'sv' },
  { value: 'en', label: 'English', lang: 'en' },
]

interface LanguageSwitchProps {
  class?: string
  /** Called after the switch (My account saves the language on the account). */
  onChange?: (locale: ChosenLocale) => void
}

/** The same choice as a compact dropdown (the login card, UNG-306). */
export function LanguageSelect({ class: className, onChange }: LanguageSwitchProps) {
  useUiLocale()
  const active = currentLocale()
  return (
    <select
      class={`lang-select${className ? ` ${className}` : ''}`}
      aria-label={t`Language`}
      value={active}
      onChange={(e) => {
        const value = e.currentTarget.value as ChosenLocale
        if (value !== active) void switchLanguage(value).then(() => onChange?.(value))
      }}
    >
      {LANGUAGES.map((language) => (
        <option key={language.value} value={language.value} lang={language.lang}>
          {language.label}
        </option>
      ))}
    </select>
  )
}

export function LanguageSwitch({ class: className, onChange }: LanguageSwitchProps) {
  useUiLocale()
  const active = currentLocale()
  return (
    <div class={`lang-switch${className ? ` ${className}` : ''}`} role="group" aria-label={t`Language`}>
      {LANGUAGES.map((language) => (
        <button
          key={language.value}
          type="button"
          lang={language.lang}
          aria-pressed={active === language.value}
          onClick={() => {
            if (active === language.value) return
            void switchLanguage(language.value).then(() => onChange?.(language.value))
          }}
        >
          {language.label}
        </button>
      ))}
    </div>
  )
}
