import { Fragment } from 'preact'
import type { Project } from '../../data/types'
import type { ProjectActions } from './actions'
import { PauseButton } from './PauseButton'
import { MODES, MODE_LABEL } from './projectMode'
import { useModeChange } from './useModeChange'
import { useModeSwitching } from './useModeSwitching'
import './ProjectHeader.css'

interface ModeSelectorProps {
  project: Project
  actions: ProjectActions
  onModeSelect?: (mode: Project['publicMode']) => void
}

// Lägesknapparna (Before, Live, After, Ondemand) med paus-knappen direkt till höger om Live (UNG-119). Delas av projektets huvud och
// utspelningsvyn i Live: lägesbyte, bekräftelsedialoger och bytesspinnern fungerar likadant på båda ställena.
export function ModeSelector({ project: p, actions, onModeSelect }: ModeSelectorProps) {
  const { selectMode, dialog: modeDialog } = useModeChange(p, actions)
  // UNG-107: läget som håller på att bytas till visas som valt direkt, med en snurra, tills servern har svarat.
  const switchingTo = useModeSwitching(p.id)
  const shownMode = switchingTo ?? p.publicMode

  return (
    <>
      {/* Utan synlig etikett "Läge", för att spara höjd. */}
      <div class="pv-field">
        <div class="pv-seg" role="group" aria-label="Läge">
          {MODES.map((mode) => (
            <Fragment key={mode}>
              <button
                type="button"
                class={`pv-seg-btn${mode === 'live' ? ' is-live' : ''}${switchingTo === mode ? ' is-switching' : ''}`}
                aria-pressed={shownMode === mode}
                aria-busy={switchingTo === mode ? true : undefined}
                disabled={switchingTo !== null || (mode === 'before' && p.publicMode === 'live')}
                title={mode === 'before' && p.publicMode === 'live' ? 'Gå till After innan Before — ett avbrutet test granskas alltid där först.' : undefined}
                onClick={() => (onModeSelect ? onModeSelect(mode) : selectMode(mode))}
              >
                {MODE_LABEL[mode]}
                {switchingTo === mode && <span class="pv-spinner" aria-hidden="true" />}
              </button>
              {/* UNG-119: paus-knappen sitter precis till höger om Live. Den syns i alla lägen (samma lägesrad överallt) men går bara att
                  använda i Live. */}
              {mode === 'live' && (
                <PauseButton pause={p.playout.currentPause ?? null} timeline={p.playout.timeline} onStart={actions.pause} onResume={actions.resume} disabled={p.publicMode !== 'live'} />
              )}
            </Fragment>
          ))}
        </div>
        {/* Snurran i knappen räcker; bytet läses upp för skärmläsare. */}
        {switchingTo !== null && <span class="sr-only" role="status">Byter till {MODE_LABEL[switchingTo]}…</span>}
      </div>
      {modeDialog}
    </>
  )
}
