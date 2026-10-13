import { Modal } from '../../components/Modal'
import { Icon } from '../../components/Icon'
import { failedCopy, publishedCopy } from './publishOutcome'
import type { PublishedFacts } from './publishOutcome'
import './PublishOutcomeDialog.css'

type PublishOutcomeDialogProps =
  | { kind: 'published'; facts: PublishedFacts; onOpenForViewers: () => void; onClose: () => void }
  | { kind: 'failed'; stepLabel: string; onClose: () => void }

// UNG-181: kvittot efter publicering av ondemand. Står kvar tills det stängs (stängs inte av sig själv). Ersätter framstegsdialogen när
// flödet är klart, så det inte blinkar mellan två dialoger. Misslyckas ett steg står det vilket.
export function PublishOutcomeDialog(props: PublishOutcomeDialogProps) {
  if (props.kind === 'failed') {
    const copy = failedCopy(props.stepLabel)
    return (
      <Modal title={copy.title} onClose={props.onClose} footer={<button class="btn btn-sm btn-primary" type="button" onClick={props.onClose}>Stäng</button>}>
        <p class="publish-outcome-text" role="alert">{copy.text}</p>
      </Modal>
    )
  }

  // Spelarlänken står under spelaren i översikten; kvittot visar bara vad som publicerades (efter prod-provet 2026-10-13).
  const copy = publishedCopy(props.facts)

  return (
    <Modal
      title={copy.title}
      onClose={props.onClose}
      footer={
        <>
          {copy.closed && (
            <button class="btn btn-sm" type="button" onClick={() => { props.onOpenForViewers(); props.onClose() }}>Öppna för tittare</button>
          )}
          <button class="btn btn-sm btn-primary" type="button" onClick={props.onClose}>Stäng</button>
        </>
      }
    >
      <div class="publish-outcome" role="status">
        <p class="publish-outcome-text">
          <Icon name="check_circle" size={20} /> {copy.intro}
        </p>
        <ul class="publish-outcome-facts">
          {copy.facts.map((fact) => <li key={fact}>{fact}</li>)}
        </ul>
      </div>
    </Modal>
  )
}
