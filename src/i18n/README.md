# UI texts (i18n, UNG-221)

English is written in the code; Swedish is a translation in `src/locales/sv.po` and is the default language.
Library: [Lingui](https://lingui.dev) (`@lingui/core` and its macros, no React bindings).

## Writing texts

```ts
import { plural, t } from '@lingui/core/macro'

t`Publish`                                                   // a plain text
t`The step “${stepLabel}” failed.`                           // variables become {stepLabel}: name them well
plural(count, { 0: 'No chapters', one: '# chapter', other: '# chapters' })
t({ message: 'Close', context: 'caption editor' })           // same English, different meaning
```

- Call `t` when the text is shown (inside a function or component), never at module level: the language is
  chosen at start and module-level texts would be evaluated before that. For constants use `msg` and
  `i18n._(descriptor)` when shown.
- One sentence is one message with variables, never pieces glued together.
- No `n === 1 ? …` in code: use `plural`. Numbers via `formatNumber` (or `#` in `plural`), dates via `Intl` with
  `i18n.locales`.
- Swedish wording is changed in `sv.po`, not in the code. Changing the English text gives the message a new id,
  so its Swedish translation is "missing" until it is filled in again.

## Commands

| Command | What it does |
| --- | --- |
| `npm run i18n:extract` | Updates `src/locales/*.po` from the code (run after adding or changing texts) |
| `npm run i18n:compile` | Compiles the catalogs to `src/locales/*.ts` (generated, not in git; runs before dev/build/test) |
| `npm run i18n:check` | CI: catalogs in sync with the code, no missing Swedish, no collisions, same variables |

**Collisions:** a message used in more than one file shares one Swedish translation. The check fails until it
is listed in `src/locales/shared.json` (`"English": "Svenska"`) after checking that every place means the same
thing; otherwise give one of them a `context`.

## Language

The operator chooses Svenska/English on the login page and under My account (UNG-306). The choice is saved on the
account (`PATCH /auth/me`) and remembered in the browser. Order: `?lang=en` / `?lang=sv` (override for test and
support; `?lang=pseudo` in development gives accented English, to find texts that are not yet translatable) > the
account's language after login > the language remembered in this browser > the browser's languages (en → English,
sv/nb/nn/no/da → Swedish) > Swedish.

Switching happens without a reload (a reload logs the operator out): `switchLanguage` activates the catalogue,
`useUiLocale` re-renders, and the views under the shell are remounted (keyed on the language) so labels made in the
data layer follow. The console sends its language to the server as `Accept-Language`. Tests run in Swedish
(`scripts/test-setup.mjs`).
