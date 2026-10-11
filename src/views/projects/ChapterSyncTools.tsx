import type { Chapter } from '../../data/types'
import { formatHms } from '../../app/time'
import { Icon } from '../../components/Icon'
import './OndemandView.css'

// UNG-249: förankringsguiden och Synk-stegningen för kapitel utan position. Delas av After-/Ondemand-vyn och editorn (vyns kapitelverktyg
// tas bort i UNG-251). Komponenterna är rena: anropen mot servern görs av den som visar dem.

interface AnchorGuideProps {
  step: 1 | 2 | 3
  anchorLabel: string | null
  anchorOffset: number | null
  position: number
  playing: boolean
  busy: boolean
  onSeekBy: (seconds: number) => void
  onTogglePlay: () => void
  onChooseAgain: () => void
  onAnchor: () => void
  onGoToAnchor: () => void
  onNudge: (deltaSeconds: number) => void
  onConfirm: () => void
  onClose: () => void
  /** UNG-249: kapitel att välja ankare bland i steg 1, som knappar i guiden (editorn). Saknas de väljs ankaret i listan. */
  candidates?: { id: string; label: string }[]
  onPick?: (id: string) => void
}

// Guidat flöde för att förankra kapitellistan mot en uppladdad video: välj ett kapitel,
// spela fram till var det börjar, kontrollera ankaret. Ankarets kvalitet avgör — övriga
// kapitel följer sändningens tider och finjusteras enskilt i listan.
export function AnchorGuide(props: AnchorGuideProps) {
  const { step, anchorLabel, anchorOffset, position, playing, busy } = props
  return (
    <div class="od-guide" role="region" aria-label="Förankra kapitel">
      <div class="od-guide-head">
        <strong>Förankra kapitel · steg {step} av 3</strong>
        <button class="btn btn-sm" type="button" onClick={props.onClose}>Stäng</button>
      </div>
      {step === 1 && (
        <p class="od-empty">
          <strong>Välj kapitel.</strong> {props.candidates ? 'Välj ett kapitel' : 'Klicka på ett kapitel i listan'} vars start du tydligt hör eller ser i videon, till exempel första punkten.
        </p>
      )}
      {step === 1 && props.candidates && (
        <div class="od-guide-controls">
          {props.candidates.map((candidate) => (
            <button key={candidate.id} class="btn btn-sm" type="button" onClick={() => props.onPick?.(candidate.id)}>{candidate.label}</button>
          ))}
        </div>
      )}
      {step === 2 && (
        <>
          <p class="od-empty">
            <strong>Spela fram till där ”{anchorLabel}” börjar</strong> i videon och klicka Förankra.
          </p>
          <PositionControls position={position} playing={playing} onSeekBy={props.onSeekBy} onTogglePlay={props.onTogglePlay} />
          <div class="od-guide-controls">
            <button class="btn btn-sm btn-primary" type="button" disabled={busy} onClick={props.onAnchor}>
              {busy ? 'Förankrar…' : 'Förankra'}
            </button>
            <button class="btn btn-sm" type="button" disabled={busy} onClick={props.onChooseAgain}>Välj annat kapitel</button>
          </div>
        </>
      )}
      {step === 3 && (
        <>
          <p class="od-empty">
            <strong>Kontrollera ankaret</strong> ”{anchorLabel}”{anchorOffset !== null ? ` vid ${formatHms(anchorOffset)}` : ''}. Gå till ankaret, lyssna och justera. Justeringen flyttar alla kapitel. Övriga kapitel följer tiderna från sändningen — finjustera enskilda kapitel i listan vid behov.
          </p>
          <div class="od-guide-controls">
            <button class="btn btn-sm" type="button" disabled={busy || anchorOffset === null} onClick={props.onGoToAnchor}>Gå till ankare</button>
            <button class="btn btn-sm" type="button" disabled={busy} title="Flyttar alla kapitel" onClick={() => props.onNudge(-1)}>−1 s</button>
            <button class="btn btn-sm" type="button" disabled={busy} title="Flyttar alla kapitel" onClick={() => props.onNudge(1)}>+1 s</button>
          </div>
          <div class="od-guide-controls">
            <button class="btn btn-sm btn-primary" type="button" disabled={busy} onClick={props.onConfirm}>Bekräfta ankaret</button>
            <button class="btn btn-sm" type="button" disabled={busy} onClick={props.onChooseAgain}>Förankra om</button>
          </div>
        </>
      )}
    </div>
  )
}

interface PositionControlsProps {
  position: number
  playing: boolean
  onSeekBy: (seconds: number) => void
  onTogglePlay: () => void
}

export function PositionControls({ position, playing, onSeekBy, onTogglePlay }: PositionControlsProps) {
  return (
    <div class="od-guide-controls">
      <button class="btn btn-sm" type="button" onClick={() => onSeekBy(-5)}>−5 s</button>
      <button class="btn btn-sm" type="button" onClick={() => onSeekBy(-1)}>−1 s</button>
      <button class="btn btn-sm" type="button" aria-label="Spela eller pausa" onClick={onTogglePlay}>
        <Icon name={playing ? 'pause' : 'play_arrow'} size={18} />
      </button>
      <output>{formatHms(Math.round(position))}</output>
      <button class="btn btn-sm" type="button" onClick={() => onSeekBy(1)}>+1 s</button>
      <button class="btn btn-sm" type="button" onClick={() => onSeekBy(5)}>+5 s</button>
    </div>
  )
}

interface SyncStepperProps {
  target: Chapter
  remaining: number
  position: number
  playing: boolean
  busy: boolean
  canUndo: boolean
  warning: boolean
  onSeekBy: (seconds: number) => void
  onTogglePlay: () => void
  onStep: () => void
  onSkip: () => void
  onUndo: () => void
}

// Kapitel utan tid: spela videon och klicka Synka när nästa kapitel börjar — tiden sätts till
// nuvarande position och nästa kapitel står på tur. Klicka på ett kapitel i listan för att välja ett annat.
export function SyncStepper(props: SyncStepperProps) {
  const { target, remaining, position, playing, busy, canUndo, warning } = props
  return (
    <div class="od-guide" role="region" aria-label="Sätt tider på kapitlen">
      <div class="od-guide-head">
        <strong>Sätt tider på kapitlen · {remaining} kvar</strong>
      </div>
      <p class="od-empty">Nästa: <strong>{target.label}</strong></p>
      <PositionControls position={position} playing={playing} onSeekBy={props.onSeekBy} onTogglePlay={props.onTogglePlay} />
      {warning && <p class="od-download-error">Kapitlet hamnar före det förra. Klicka Synka igen om det är rätt.</p>}
      <div class="od-guide-controls">
        <button class="btn btn-sm btn-primary" type="button" disabled={busy} onClick={props.onStep}>
          {busy ? 'Sätter…' : `Synka här · ${formatHms(Math.round(position))}`}
        </button>
        <button class="btn btn-sm" type="button" disabled={busy} onClick={props.onSkip}>Hoppa över</button>
        <button class="btn btn-sm" type="button" disabled={busy || !canUndo} onClick={props.onUndo}>Ångra förra</button>
      </div>
    </div>
  )
}
