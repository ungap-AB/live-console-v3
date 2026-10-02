import { useEffect } from 'preact/hooks'
import type { RefObject } from 'preact'

// Alla menyer/popovers i appen ska stängas av klick utanför och Esc. Använd den
// här hooken för varje ny meny i stället för egen lyssnarlogik, så beteendet
// aldrig glöms bort. `ref` ska peka på elementet som omsluter både
// utlösaren och menylistan (annars stänger utlösarens eget klick menyn direkt).
export function useDismiss(open: boolean, ref: RefObject<HTMLElement>, onClose: () => void) {
  useEffect(() => {
    if (!open) return
    function onMouseDown(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose()
    }
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose()
    }
    document.addEventListener('mousedown', onMouseDown)
    document.addEventListener('keydown', onKeyDown)
    return () => {
      document.removeEventListener('mousedown', onMouseDown)
      document.removeEventListener('keydown', onKeyDown)
    }
  }, [open, ref, onClose])
}
