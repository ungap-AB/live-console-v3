import { useEffect } from 'preact/hooks'
import { client } from '../../data'
import type { Project, PublicMode } from '../../data/types'
import type { ProjectActions } from './actions'
import { BeforeWorkspace } from './BeforeWorkspace'
import { LiveWorkspace } from './LiveWorkspace'
import { ModePlaceholder } from './ModePlaceholder'
import { ProjectHeader } from './ProjectHeader'
import type { ProjectScreen } from './ProjectsView'
import { useLiveChannel } from './useLiveChannel'

interface LivesandningProps {
  project: Project
  actions: ProjectActions
  onBack: () => void
  onModeChanged: (mode: PublicMode) => void
  onOpenLegacy: (screen: ProjectScreen) => void
}

// Livesändning: gemensam header överst, innehållet beror på läget.
// Before är förberedelser, Live är ren sändningskontroll.
export function Livesandning({ project: p, actions, onBack, onModeChanged, onOpenLegacy }: LivesandningProps) {
  const live = useLiveChannel(p.channel?.id ?? null)

  // Samma pollning som Playout: håller utspelningsläget i synk mellan operatörer.
  useEffect(() => {
    let cancelled = false
    const poll = () => {
      if (cancelled) return
      void client.projects.touchPlayout(p.id).catch(() => undefined)
      void actions.refreshPlayout().catch(() => undefined)
    }
    poll()
    const interval = window.setInterval(poll, 2000)
    return () => {
      cancelled = true
      window.clearInterval(interval)
    }
  }, [p.id])

  // After/Ondemand hör till Ondemand-vyn; det här är bara en övergångsrendering
  // medan vyn byts efter ett lägesbyte.
  if (p.publicMode !== 'before' && p.publicMode !== 'live') {
    return (
      <ModePlaceholder
        project={p}
        kind="livesandning"
        actions={actions}
        onBack={onBack}
        onModeChanged={onModeChanged}
        onOpenLegacy={onOpenLegacy}
      />
    )
  }

  return (
    <div class="project-workspace doc">
      <ProjectHeader project={p} actions={actions} onBack={onBack} onModeChanged={onModeChanged} />
      {p.publicMode === 'before' ? (
        <BeforeWorkspace
          project={p}
          actions={actions}
          channel={live.channel}
          health={live.health}
          streamKey={live.streamKey}
          refresh={live.refresh}
          stopPolling={live.stopPolling}
        />
      ) : (
        <LiveWorkspace project={p} actions={actions} channel={live.channel} health={live.health} streamKey={live.streamKey} />
      )}
    </div>
  )
}
