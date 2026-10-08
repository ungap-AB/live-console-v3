import { useState } from 'preact/hooks'
import { Modal } from '../../components/Modal'
import { Icon } from '../../components/Icon'
import { failedCopy, publishedCopy } from './publishOutcome'
import type { PublishedFacts } from './publishOutcome'
import './PublishOutcomeDialog.css'

type PublishOutcomeDialogProps =
  | { kind: 'published'; facts: PublishedFacts; playerUrl: string; onOpenForViewers: () => void; onClose: () => void }
  | { kind: 'failed'; stepLabel: string; onClose: () => void }

// UNG-181: kvittot efter publicering av ondemand. Står kvar tills det stängs (stängs inte av sig själv). Ersätter framstegsdialogen när
// flödet är klart, så det inte blinkar mellan två dialoger. Misslyckas ett steg står det vilket.
export function PublishOutcomeDialog(props: PublishOutcomeDialogProps) {
  const [copied, setCopied] = useState(false)

  if (props.kind === 'failed') {
    const copy = failedCopy(props.stepLabel)
    return (
      <Modal title={copy.title} onClose={props.onClose} footer={<button class="btn btn-sm btn-primary" type="button" onClick={props.onClose}>Stäng</button>}>
        <p class="publish-outcome-text" role="alert">{copy.text}</p>
      </Modal>
    )
  }

  const copy = publishedCopy(props.facts)
  async function copyLink() {
    try {
      await navigator.clipboard.writeText(props.kind === 'published' ? props.playerUrl : '')
      setCopied(true)
      window.setTimeout(() => setCopied(false), 2500)
    } catch {
      setCopied(false)
    }
  }

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
        <div class="publish-outcome-link">
          <span class="publish-outcome-url">{props.playerUrl.replace(/^https?:\/\//, '')}</span>
          <button class="btn btn-sm" type="button" onClick={() => void copyLink()}>{copied ? 'Kopierad' : 'Kopiera länk'}</button>
          <a class="btn btn-sm" href={props.playerUrl} target="_blank" rel="noopener noreferrer">Öppna spelaren</a>
        </div>
      </div>
    </Modal>
  )
}
