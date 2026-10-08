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
  /** Utan etikett "Läge" och utan raden "Byter till …" (UNG-179, det expanderade live-läget där höjden är dyr). */
  compact?: boolean
}

// Lägesknapparna (Before, Live, After, Ondemand) med paus-knappen direkt till höger om Live (UNG-119). Delas av projektets huvud och
// det expanderade live-läget: lägesbyte, bekräftelsedialoger och bytesspinnern fungerar likadant på båda ställena.
export function ModeSelector({ project: p, actions, onModeSelect, compact = false }: ModeSelectorProps) {
  const { selectMode, dialog: modeDialog } = useModeChange(p, actions)
  // UNG-107: läget som håller på att bytas till visas som valt direkt, med en snurra, tills servern har svarat.
  const switchingTo = useModeSwitching(p.id)
  const shownMode = switchingTo ?? p.publicMode

  return (
    <>
      <div class={`pv-field${compact ? ' pv-field-compact' : ''}`}>
        {!compact && (
          <div class="pv-label" id="pv-mode-label">
            Läge
          </div>
        )}
        <div class="pv-seg" role="group" {...(compact ? { 'aria-label': 'Läge' } : { 'aria-labelledby': 'pv-mode-label' })}>
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
              {/* UNG-119: paus-knappen sitter precis till höger om Live och visas bara i läget Live. */}
              {mode === 'live' && p.publicMode === 'live' && (
                <PauseButton pause={p.playout.currentPause ?? null} timeline={p.playout.timeline} onStart={actions.pause} onResume={actions.resume} />
              )}
            </Fragment>
          ))}
        </div>
        {!compact && switchingTo !== null && (
          <div class="pv-switching" role="status">
            <span class="pv-spinner" aria-hidden="true" />
            <span>Byter till {MODE_LABEL[switchingTo]}…</span>
          </div>
        )}
        {compact && switchingTo !== null && <span class="sr-only" role="status">Byter till {MODE_LABEL[switchingTo]}…</span>}
      </div>
      {modeDialog}
    </>
  )
}
