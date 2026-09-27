export type ThemePreference = 'light' | 'dark' | 'auto'

const STORAGE_KEY = 'ungap-console-theme'

export function getStoredThemePreference(): ThemePreference {
  const stored = localStorage.getItem(STORAGE_KEY)
  if (stored === 'light' || stored === 'dark' || stored === 'auto') return stored
  // Nyckeln saknas helt (ny användare/ny webbläsare, aldrig gjort ett val)
  // — mörkt läge är standard. Ett explicit val av "Auto" sparas som eget
  // värde nedan, så det inte kan förväxlas med "inget val gjort".
  return 'dark'
}

export function applyThemePreference(preference: ThemePreference) {
  if (preference === 'auto') {
    delete document.documentElement.dataset.theme
  } else {
    document.documentElement.dataset.theme = preference
  }
}

export function setThemePreference(preference: ThemePreference) {
  localStorage.setItem(STORAGE_KEY, preference)
  applyThemePreference(preference)
}
