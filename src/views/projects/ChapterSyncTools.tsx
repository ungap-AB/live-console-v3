import { t } from '@lingui/core/macro'
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
  const anchor = anchorLabel ?? ''
  return (
    <div class="od-guide" role="region" aria-label={t`Anchor chapters`}>
      <div class="od-guide-head">
        <strong>{t`Anchor chapters · step ${step} of 3`}</strong>
        <button class="btn btn-sm" type="button" onClick={props.onClose}>{t`Close`}</button>
      </div>
      {step === 1 && (
        <p class="od-empty">
          <strong>{t`Choose chapter.`}</strong> {props.candidates ? t`Choose a chapter whose start you clearly hear or see in the video, for example the first item.` : t`Click a chapter in the list whose start you clearly hear or see in the video, for example the first item.`}
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
            <strong>{t`Play up to where “${anchor}” starts`}</strong> {t`in the video and click Anchor.`}
          </p>
          <PositionControls position={position} playing={playing} onSeekBy={props.onSeekBy} onTogglePlay={props.onTogglePlay} />
          <div class="od-guide-controls">
            <button class="btn btn-sm btn-primary" type="button" disabled={busy} onClick={props.onAnchor}>
              {busy ? t`Anchoring…` : t`Anchor`}
            </button>
            <button class="btn btn-sm" type="button" disabled={busy} onClick={props.onChooseAgain}>{t`Choose another chapter`}</button>
          </div>
        </>
      )}
      {step === 3 && (
        <>
          <p class="od-empty">
            <strong>{t`Check the anchor`}</strong> {anchorOffset !== null
              ? t`“${anchor}” at ${formatHms(anchorOffset)}. Go to the anchor, listen and adjust. The adjustment moves all chapters. The other chapters follow the times from the broadcast — fine-tune individual chapters in the list if needed.`
              : t`“${anchor}”. Go to the anchor, listen and adjust. The adjustment moves all chapters. The other chapters follow the times from the broadcast — fine-tune individual chapters in the list if needed.`}
          </p>
          <div class="od-guide-controls">
            <button class="btn btn-sm" type="button" disabled={busy || anchorOffset === null} onClick={props.onGoToAnchor}>{t`Go to anchor`}</button>
            <button class="btn btn-sm" type="button" disabled={busy} title={t`Moves all chapters`} onClick={() => props.onNudge(-1)}>−1 s</button>
            <button class="btn btn-sm" type="button" disabled={busy} title={t`Moves all chapters`} onClick={() => props.onNudge(1)}>+1 s</button>
          </div>
          <div class="od-guide-controls">
            <button class="btn btn-sm btn-primary" type="button" disabled={busy} onClick={props.onConfirm}>{t`Confirm the anchor`}</button>
            <button class="btn btn-sm" type="button" disabled={busy} onClick={props.onChooseAgain}>{t`Anchor again`}</button>
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
      <button class="btn btn-sm" type="button" aria-label={t`Play or pause`} onClick={onTogglePlay}>
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
    <div class="od-guide" role="region" aria-label={t`Set times on the chapters`}>
      <div class="od-guide-head">
        <strong>{t`Set times on the chapters · ${remaining} left`}</strong>
      </div>
      <p class="od-empty">{t`Next:`} <strong>{target.label}</strong></p>
      <PositionControls position={position} playing={playing} onSeekBy={props.onSeekBy} onTogglePlay={props.onTogglePlay} />
      {warning && <p class="od-download-error">{t`The chapter ends up before the previous one. Click Sync again if it is right.`}</p>}
      <div class="od-guide-controls">
        <button class="btn btn-sm btn-primary" type="button" disabled={busy} onClick={props.onStep}>
          {busy ? t`Setting…` : t`Sync here · ${formatHms(Math.round(position))}`}
        </button>
        <button class="btn btn-sm" type="button" disabled={busy} onClick={props.onSkip}>{t`Skip`}</button>
        <button class="btn btn-sm" type="button" disabled={busy || !canUndo} onClick={props.onUndo}>{t`Undo previous`}</button>
      </div>
    </div>
  )
}
