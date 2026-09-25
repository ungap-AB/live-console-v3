import { useEffect, useState } from 'preact/hooks'
import { client } from '../../data'
import type { Project } from '../../data/types'
import type { ProjectActions } from './actions'
import { BeforeWorkspace } from './BeforeWorkspace'
import { LiveWorkspace } from './LiveWorkspace'
import { ProjectHeader } from './ProjectHeader'
import { useLiveChannel } from './useLiveChannel'

interface LivesandningProps {
  project: Project
  actions: ProjectActions
  onBack: () => void
}

// Livesändning: gemensam header överst, innehållet beror på läget.
// Before är förberedelser, Live är ren sändningskontroll.
export function Livesandning({ project: p, actions, onBack }: LivesandningProps) {
  const live = useLiveChannel(p.channel?.id ?? null)
  // Delas mellan headerns "Ingest info"-knapp och BeforeWorkspaces
  // motsvarande menyval — en enda panel, oavsett vilken som öppnar den.
  const [showIngestInfo, setShowIngestInfo] = useState(false)

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

  // After/Ondemand hör till Ondemand-vyn; vyn byts av ProjectsView när läget ändrats.
  if (p.publicMode !== 'before' && p.publicMode !== 'live') return null

  return (
    <div class={`project-workspace doc${p.publicMode === 'before' ? ' before-project-workspace' : ''}`}>
      <ProjectHeader
        project={p}
        actions={actions}
        onBack={onBack}
        channel={live.channel}
        health={live.health}
        streamKey={live.streamKey}
        showIngestInfo={showIngestInfo}
        onShowIngestInfoChange={setShowIngestInfo}
      />
      {p.publicMode === 'before' ? (
        <BeforeWorkspace
          project={p}
          actions={actions}
          health={live.health}
          refresh={live.refresh}
          stopPolling={live.stopPolling}
          showIngestInfo={showIngestInfo}
          onShowIngestInfoChange={setShowIngestInfo}
        />
      ) : (
        <LiveWorkspace project={p} actions={actions} channel={live.channel} health={live.health} streamKey={live.streamKey} />
      )}
    </div>
  )
}
