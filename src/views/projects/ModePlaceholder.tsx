import type { Project, PublicMode } from '../../data/types'
import type { ProjectActions } from './actions'
import { ProjectHeader } from './ProjectHeader'
import type { ProjectScreen } from './ProjectsView'

interface ModePlaceholderProps {
  project: Project
  kind: 'livesandning' | 'ondemand'
  actions: ProjectActions
  onBack: () => void
  onModeChanged: (mode: PublicMode) => void
  onOpenLegacy: (screen: ProjectScreen) => void
}

// Tillfälligt skal tills Livesändning och Ondemand byggs på riktigt. Länkar
// till dagens vyer så att inga funktioner blir onåbara under tiden.
export function ModePlaceholder({ project, kind, actions, onBack, onModeChanged, onOpenLegacy }: ModePlaceholderProps) {
  const title = kind === 'livesandning' ? 'Livesändning' : 'Ondemand'
  return (
    <div class="project-workspace doc">
      <ProjectHeader project={project} actions={actions} onBack={onBack} onModeChanged={onModeChanged} />
      <div class="mode-placeholder">
        <p class="mode-placeholder-title">{title}</p>
        <p>Den här vyn är inte byggd än.</p>
        <div class="mode-placeholder-actions">
          {kind === 'livesandning' && (
            <button class="btn" type="button" onClick={() => onOpenLegacy('playout')}>
              Öppna dagens Playout
            </button>
          )}
          <button class="btn" type="button" onClick={() => onOpenLegacy('detail')}>
            Öppna dagens projektvy
          </button>
        </div>
      </div>
    </div>
  )
}
