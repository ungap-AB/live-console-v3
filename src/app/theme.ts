export type ThemePreference = 'light' | 'dark' | 'auto'

const STORAGE_KEY = 'ungap-console-theme'

export function getStoredThemePreference(): ThemePreference {
  const stored = localStorage.getItem(STORAGE_KEY)
  return stored === 'light' || stored === 'dark' ? stored : 'auto'
}

export function applyThemePreference(preference: ThemePreference) {
  if (preference === 'auto') {
    delete document.documentElement.dataset.theme
  } else {
    document.documentElement.dataset.theme = preference
  }
}

export function setThemePreference(preference: ThemePreference) {
  if (preference === 'auto') {
    localStorage.removeItem(STORAGE_KEY)
  } else {
    localStorage.setItem(STORAGE_KEY, preference)
  }
  applyThemePreference(preference)
}
