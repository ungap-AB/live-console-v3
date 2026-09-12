import { useEffect } from 'preact/hooks'
import './Toast.css'

interface ToastProps {
  message: string
  actionLabel?: string
  onAction?: () => void
  onDismiss: () => void
  durationMs?: number
}

export function Toast({ message, actionLabel, onAction, onDismiss, durationMs = 5000 }: ToastProps) {
  useEffect(() => {
    const timer = setTimeout(onDismiss, durationMs)
    return () => clearTimeout(timer)
  }, [onDismiss, durationMs])

  return (
    <div class="toast" role="status">
      <span>{message}</span>
      {actionLabel && (
        <button
          class="btn btn-sm"
          type="button"
          onClick={() => {
            onAction?.()
            onDismiss()
          }}
        >
          {actionLabel}
        </button>
      )}
    </div>
  )
}
