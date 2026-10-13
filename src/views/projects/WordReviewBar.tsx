import { t } from '@lingui/core/macro'
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
  const beforeText = before ?? ''
  const conflicts = cue ? openConflicts(review, cue.id) : []
  const allConflicts = cue ? review.conflicts.get(cue.id) ?? [] : []
  const locked = cue ? isLocked(review, cue.id) : false
  const removed = cue ? review.removedIds.has(cue.id) : false
  const warnings = review.warnings

  return (
    <section key="word-review" class="ce-review" aria-label={t`Corrections from Word`}>
      <div class="ce-review-head">
        <strong>{t`Corrections from Word`}</strong>
        <span class="ce-review-count" aria-live="polite">{reviewHeadline(review)}</span>
        <span class="ce-review-spacer" />
        <button class="btn btn-sm" type="button" disabled={stopCount === 0} title={t`Previous changed box (Shift+Tab)`} onClick={onPrevious}>{t`Previous`}</button>
        <button class="btn btn-sm" type="button" disabled={stopCount === 0} title={t`Next changed box (Tab)`} onClick={onNext}>{t`Next`}</button>
        <button class="btn btn-sm" type="button" title={t`Makes all boxes editable`} onClick={onUnlockAll}>{t`Unlock all`}</button>
        <button class="btn btn-sm" type="button" title={t`Removes the corrections and goes back to the saved version (can be undone)`} onClick={onDiscard}>{t`Discard the corrections`}</button>
        <button class="btn btn-sm" type="button" title={t`Hides this bar. The changes remain as unsaved changes`} onClick={onFinish}>{t`Done reviewing`}</button>
      </div>
      {warnings.length > 0 && (
        <ul class="ce-review-warnings">
          {warnings.map((warning) => (
            <li key={warning.code}>
              {warning.message}
              {(warning.code === 'base_unverified' || warning.code === 'base_unchecked') && (
                <> <button class="ce-link" type="button" onClick={onChangeBase}>{t`Choose another version…`}</button></>
              )}
            </li>
          ))}
        </ul>
      )}
      {cue && (before !== undefined || flags.length > 0 || allConflicts.length > 0 || locked) && (
        <div class="ce-review-detail" aria-live="polite">
          <span class="ce-review-row">{t`Box ${selectedIndex + 1}`}</span>
          {removed && <span>{t`The text was removed in Word. Type in the box to keep it, otherwise the box is removed when you save. Before: “${beforeText}”`}</span>}
          {!removed && before !== undefined && <span>{t`Before: “${before.replace(/\n/g, ' ')}”`}</span>}
          {flags.includes('split') && <span>{t`Split from a longer box. The time is divided by number of characters, so check the times.`}</span>}
          {flags.includes('fast') && <span>{t`A lot of text in a short time. Check that there is time to read it.`}</span>}
          {conflicts.map((conflict, index) => (
            <span key={index} class="ce-review-conflict">
              {t`Conflict: in Word “${conflict.baseText || t`(nothing)`}” was changed to “${conflict.wordText || t`(removed)`}”, but the box is also changed here. The box has kept its current text, so change it by hand if the Word version is to apply.`}
              <button class="ce-link" type="button" onClick={() => void navigator.clipboard?.writeText(conflict.wordText)}>{t`Copy the Word text`}</button>
              <button class="ce-link" type="button" onClick={() => onResolve(cue.id, (review.conflicts.get(cue.id) ?? []).indexOf(conflict))}>{t`Mark as resolved`}</button>
            </span>
          ))}
          {locked && (
            <span>
              <Icon name="lock" size={14} /> {t`Locked: this box was not changed in Word.`}
              <button class="ce-link" type="button" onClick={() => onUnlockOne(cue.id)}>{t`Unlock the box`}</button> {t`(or double-click in it)`}
            </span>
          )}
        </div>
      )}
    </section>
  )
}
