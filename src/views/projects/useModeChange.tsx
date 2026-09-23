import { useState } from 'preact/hooks'
import type { Project, PublicMode } from '../../data/types'
import type { ProjectActions } from './actions'
import { ModeChangeDialog } from './ModeChangeDialog'
import { afterReasonFor, modeChangePlan, requiresConfirmation } from './projectMode'

// Gemensam lägeshantering för headern och genvägarna i vyerna: bekräftelse
// där den krävs, sparande av After-meddelandet och rätt serveranrop per byte.
export function useModeChange(project: Project, actions: ProjectActions, onApplied?: (from: PublicMode, to: PublicMode) => void | Promise<void>) {
  const [pending, setPending] = useState<PublicMode | null>(null)

  async function apply(to: PublicMode, afterText?: string) {
    const from = project.publicMode
    if (afterText !== undefined && afterText !== project.afterText) {
      if (!(await actions.rename(project.name, { afterText }))) return
    }
    for (const step of modeChangePlan(from, to)) {
      // Ett misslyckat steg avbryter resten; felet visas redan som toast.
      const ok =
        step === 'publish'
          ? await actions.publish()
          : step === 'unpublish'
            ? await actions.unpublish()
            : step === 'returnToLive'
              ? await actions.returnToLive()
              : await actions.setPublicMode(to, afterReasonFor(from, to))
      if (!ok) return
    }
    await onApplied?.(from, to)
  }

  function selectMode(to: PublicMode) {
    if (to === project.publicMode) return
    if (requiresConfirmation(project.publicMode, to)) setPending(to)
    else void apply(to)
  }

  const dialog = pending ? (
    <ModeChangeDialog
      from={project.publicMode}
      to={pending}
      afterText={project.afterText}
      onCancel={() => setPending(null)}
      onConfirm={(afterText) => {
        const to = pending
        setPending(null)
        void apply(to, afterText)
      }}
    />
  ) : null

  return { selectMode, dialog }
}
