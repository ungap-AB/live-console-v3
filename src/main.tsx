import { render } from 'preact'
import './styles/tokens.css'
import './styles/base.css'
import './styles/detail-patterns.css'
import './styles/data-list.css'
import { App } from './app/App'
import { allowedShellOrigins, detectEmbed, surfaceStartHash } from './app/embed'
import { applyThemePreference, getStoredThemePreference } from './app/theme'
import { setupI18n } from './i18n'

// UNG-322: framed by an allowed ungap Shell → embed mode; the surface picks the view to start on.
const embed = detectEmbed(window.location.search, window.top !== window, allowedShellOrigins(import.meta.env.VITE_SHELL_ORIGINS, import.meta.env.DEV))
if (embed) {
  const hash = surfaceStartHash(embed.surface, window.location.hash)
  if (hash) window.history.replaceState(null, '', hash)
}

// Until the shell's handshake answers, the console's own theme and language apply (then the shell's).
applyThemePreference(getStoredThemePreference())

await setupI18n(window.location.search)
render(<App embed={embed} />, document.getElementById('app')!)
