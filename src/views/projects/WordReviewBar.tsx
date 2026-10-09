import type { EditCue } from './captionEditOps'
import { isLocked, openConflicts, reviewHeadline, type WordReview } from './wordImportLogic'
import { Icon } from '../../components/Icon'

interface WordReviewBarProps {
  review: WordReview
  cues: readonly EditCue[]
  selectedIndex: number
  stopCount: number
  onNext: () => void
  onPrevious: () => void
  onUnlockAll: () => void
  onUnlockOne: (id: number) => void
  onResolve: (id: number, conflictIndex: number) => void
  onDiscard: () => void
  onFinish: () => void
  onChangeBase: () => void
}

// UNG-147: granskningsfältet över listan när rättningar från Word är inlästa. Rubrik med räknare, hopp mellan ändrade rutor, upplåsning,
// och en förklaring för den valda raden (före-text, konflikt med båda varianterna, tempo).
export function WordReviewBar({
  review, cues, selectedIndex, stopCount, onNext, onPrevious, onUnlockAll, onUnlockOne, onResolve, onDiscard, onFinish, onChangeBase,
}: WordReviewBarProps) {
  const cue = cues[selectedIndex]
  const flags = cue ? review.flags.get(cue.id) ?? [] : []
  const before = cue ? review.before.get(cue.id) : undefined
  const conflicts = cue ? openConflicts(review, cue.id) : []
  const allConflicts = cue ? review.conflicts.get(cue.id) ?? [] : []
  const locked = cue ? isLocked(review, cue.id) : false
  const removed = cue ? review.removedIds.has(cue.id) : false
  const warnings = review.warnings

  return (
    <section key="word-review" class="ce-review" aria-label="Rättningar från Word">
      <div class="ce-review-head">
        <strong>Rättningar från Word</strong>
        <span class="ce-review-count" aria-live="polite">{reviewHeadline(review)}</span>
        <span class="ce-review-spacer" />
        <button class="btn btn-sm" type="button" disabled={stopCount === 0} title="Föregående ändrad ruta (Skift+Tab)" onClick={onPrevious}>Föregående</button>
        <button class="btn btn-sm" type="button" disabled={stopCount === 0} title="Nästa ändrade ruta (Tab)" onClick={onNext}>Nästa</button>
        <button class="btn btn-sm" type="button" title="Gör alla rutor redigerbara" onClick={onUnlockAll}>Lås upp alla</button>
        <button class="btn btn-sm" type="button" title="Tar bort rättningarna och går tillbaka till den sparade versionen (går att ångra)" onClick={onDiscard}>Släng rättningarna</button>
        <button class="btn btn-sm" type="button" title="Döljer det här fältet. Ändringarna ligger kvar som osparade ändringar" onClick={onFinish}>Klar med granskning</button>
      </div>
      {warnings.length > 0 && (
        <ul class="ce-review-warnings">
          {warnings.map((warning) => (
            <li key={warning.code}>
              {warning.message}
              {(warning.code === 'base_unverified' || warning.code === 'base_unchecked') && (
                <> <button class="ce-link" type="button" onClick={onChangeBase}>Välj en annan version…</button></>
              )}
            </li>
          ))}
        </ul>
      )}
      {cue && (before !== undefined || flags.length > 0 || allConflicts.length > 0 || locked) && (
        <div class="ce-review-detail" aria-live="polite">
          <span class="ce-review-row">Ruta {selectedIndex + 1}</span>
          {removed && <span>Texten togs bort i Word. Skriv i rutan för att behålla den, annars tas rutan bort när du sparar. Före: ”{before}”</span>}
          {!removed && before !== undefined && <span>Före: ”{before.replace(/\n/g, ' ')}”</span>}
          {flags.includes('split') && <span>Delad ur en längre ruta. Tiden är fördelad efter antal tecken, så kontrollera tiderna.</span>}
          {flags.includes('fast') && <span>Mycket text på kort tid. Kontrollera att den hinner läsas.</span>}
          {conflicts.map((conflict, index) => (
            <span key={index} class="ce-review-conflict">
              Konflikt: i Word ändrades ”{conflict.baseText || '(ingenting)'}” till ”{conflict.wordText || '(borttaget)'}”, men rutan är också ändrad här. Rutan har behållit
              sin nuvarande text, så ändra den för hand om Word-versionen ska gälla.
              <button class="ce-link" type="button" onClick={() => void navigator.clipboard?.writeText(conflict.wordText)}>Kopiera Word-texten</button>
              <button class="ce-link" type="button" onClick={() => onResolve(cue.id, (review.conflicts.get(cue.id) ?? []).indexOf(conflict))}>Markera som löst</button>
            </span>
          ))}
          {locked && (
            <span>
              <Icon name="lock" size={14} /> Låst: den här rutan ändrades inte i Word.
              <button class="ce-link" type="button" onClick={() => onUnlockOne(cue.id)}>Lås upp rutan</button> (eller dubbelklicka i den)
            </span>
          )}
        </div>
      )}
    </section>
  )
}
