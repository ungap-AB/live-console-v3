import { t } from '@lingui/core/macro'
import { useState } from 'preact/hooks'
import { Icon } from '../../components/Icon'
import type { ForkResult, Project } from '../../data/types'
import { ForkDialog } from './ForkDialog'
import { forkSource } from './forkLogic'

interface ForkButtonProps {
  project: Project
  livePhase: string | undefined
  onForked: (result: ForkResult) => void
}

// UNG-198: Skapa ondemand-projekt av sändningen (eller inspelningen). Låg i projektets huvud, ligger nu bland knapparna längst ner i
// vänsterspalten. Visas bara när det finns något att skapa ett projekt av.
export function ForkButton({ project: p, livePhase, onForked }: ForkButtonProps) {
  const [open, setOpen] = useState(false)
  const source = forkSource(p, livePhase)
  if (!source) return null
  return (
    <>
      <button class="btn" type="button" title={t`Create on-demand project: creates a new project from the broadcast (or the recording) to trim and publish as on demand`} onClick={() => setOpen(true)}>
        <Icon name="call_split" size={18} /> {t`Fork…`}
      </button>
      {open && <ForkDialog project={p} source={source} onClose={() => setOpen(false)} onForked={(result) => { setOpen(false); onForked(result) }} />}
    </>
  )
}
