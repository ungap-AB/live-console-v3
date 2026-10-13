import { useEffect, useState } from 'preact/hooks'
import { client } from '../../data'
import type { ForkResult, Project } from '../../data/types'
import type { ProjectActions } from './actions'
import { BeforeWorkspace } from './BeforeWorkspace'
import { LiveWorkspace } from './LiveWorkspace'
import { ProjectHeader } from './ProjectHeader'
import { usePlayoutAddress } from './PlayoutOverlay'
import { PlayoutWorkOverlay } from './PlayoutWorkOverlay'
import { useLiveChannel } from './useLiveChannel'

interface LivesandningProps {
  project: Project
  actions: ProjectActions
  meetingDomain: string
  onBack: () => void
  onForked?: (result: ForkResult) => void
}

// Livesändning: gemensam header överst, innehållet beror på läget.
// Before är förberedelser, Live är sändningsöversikt; utspelningen sker i den överlagrade vyn i båda.
export function Livesandning({ project: p, actions, meetingDomain, onBack, onForked }: LivesandningProps) {
  const live = useLiveChannel(p.channel?.id ?? null)
  // Delas mellan headerns "Ingest info"-knapp och BeforeWorkspaces motsvarande menyval — en enda panel i vänsterspalten, oavsett vilken
  // som öppnar den.
  const [showIngestInfo, setShowIngestInfo] = useState(false)
  // UNG-268/269: utspelningsvyn (överlagrad, egen adress) är densamma i Before och Live och står kvar öppen när läget byts mellan dem.
  const playout = usePlayoutAddress(p.id)
  // Rubrikens Ingest info-knapp: räknaren ökar vid varje klick och arbetsvyn öppnar spelarinställningarnas flik Ingest.
  const [ingestInfoRequest, setIngestInfoRequest] = useState(0)

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

  const header = (
    <ProjectHeader
      project={p}
      actions={actions}
      onBack={onBack}
      channel={live.channel}
      health={live.health}
      showIngestInfo={showIngestInfo}
      onShowIngestInfoChange={setShowIngestInfo}
      onIngestInfo={() => setIngestInfoRequest((count) => count + 1)}
    />
  )

  // UNG-268/269: Before och Live ligger i översiktsskalet; utspelningsvyn är densamma i båda och ligger över vyn.
  const view = p.publicMode === 'before' ? (
    <BeforeWorkspace
      header={header}
      project={p}
      actions={actions}
      channel={live.channel}
      health={live.health}
      streamKey={live.streamKey}
      refresh={live.refresh}
      stopPolling={live.stopPolling}
      showIngestInfo={showIngestInfo}
      onShowIngestInfoChange={setShowIngestInfo}
      meetingDomain={meetingDomain}
      playout={playout}
      onForked={onForked}
      ingestInfoRequest={ingestInfoRequest}
    />
  ) : (
    <LiveWorkspace
      header={header}
      project={p}
      actions={actions}
      channel={live.channel}
      health={live.health}
      playout={playout}
      streamKey={live.streamKey}
      onForked={onForked}
      ingestInfoRequest={ingestInfoRequest}
    />
  )

  return (
    <>
      {view}
      {playout.open && <PlayoutWorkOverlay project={p} actions={actions} channel={live.channel} health={live.health} onClose={playout.closePlayout} />}
    </>
  )
}
