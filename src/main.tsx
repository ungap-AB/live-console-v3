import { render } from 'preact'
import './styles/tokens.css'
import './styles/base.css'
import './styles/detail-patterns.css'
import './styles/data-list.css'
import { App } from './app/App'
import { applyThemePreference, getStoredThemePreference } from './app/theme'
import { setupI18n } from './i18n'

applyThemePreference(getStoredThemePreference())

await setupI18n(window.location.search)
render(<App />, document.getElementById('app')!)
