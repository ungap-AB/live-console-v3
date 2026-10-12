import { Modal } from '../../components/Modal'

export interface CaptionTool {
  title: string
  description: string
  /** Knappens text. */
  action: string
  onClick: () => void
  disabled?: boolean
  /** Varför knappen inte går att använda (visas i stället för beskrivningen). */
  disabledReason?: string
  danger?: boolean
}

interface CaptionToolsDialogProps {
  projectName: string
  tools: CaptionTool[]
  onClose: () => void
}

// Undertextfunktionerna samlade i en dialog, med en förklaring per funktion, så att man i lugn och ro kan välja (och så att det går att
// dokumentera och lära ut). Dialogen stängs innan funktionen startar; varje funktion har sin egen dialog eller bekräftelse.
export function CaptionToolsDialog({ projectName, tools, onClose }: CaptionToolsDialogProps) {
  return (
    <Modal
      title="Undertexter"
      subtitle={projectName}
      wide
      onClose={onClose}
      footer={<button class="btn" type="button" onClick={onClose}>Stäng</button>}
    >
      <ul class="ctd-list">
        {tools.map((tool) => (
          <li key={tool.title} class={tool.disabled ? 'is-disabled' : ''}>
            <div class="ctd-text">
              <strong>{tool.title}</strong>
              <small>{tool.disabled && tool.disabledReason ? tool.disabledReason : tool.description}</small>
            </div>
            <button
              class={`btn btn-sm${tool.danger ? ' btn-danger' : ''}`}
              type="button"
              disabled={tool.disabled}
              onClick={() => {
                onClose()
                tool.onClick()
              }}
            >
              {tool.action}
            </button>
          </li>
        ))}
      </ul>
    </Modal>
  )
}
