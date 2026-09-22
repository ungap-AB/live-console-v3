import type { ComponentChildren } from 'preact'
import { useEffect, useState } from 'preact/hooks'
import { PickerModal } from './PickerModal'

interface PickerItem {
  id: string
  name: string
}

interface AttachedListPickerProps {
  currentId: string | null
  items: PickerItem[]
  pickerTitle: string
  createNewLabel: string
  onPick: (id: string | null) => void
  onCreateNew: () => void | Promise<void>
  buttonLabel?: string
  buttonClassName?: string
  /** Ikon istället för textetikett (t.ex. bytknappen bredvid en redan kopplad lista) — kräver ariaLabel. */
  icon?: ComponentChildren
  ariaLabel?: string
  open?: boolean
  onClose?: () => void
}

// Delad mellan Playout (kopplingsknapp bredvid varje kolumnrubrik) och
// ProjectDetail (kopplingsknapp i en egen dagordning/namnlista-rad) — kapslar
// bara in PickerModal-anropet och "skapa ny och koppla direkt"-flödet.
// Layouten runt knappen (etikett, visat namn) är upp till varje anropare.
export function AttachedListPicker({
  currentId,
  items,
  pickerTitle,
  createNewLabel,
  onPick,
  onCreateNew,
  buttonLabel = 'Byt...',
  buttonClassName = 'btn btn-sm',
  icon,
  ariaLabel,
  open = false,
  onClose,
}: AttachedListPickerProps) {
  const [picking, setPicking] = useState(false)

  useEffect(() => {
    if (open) setPicking(true)
  }, [open])

  return (
    <>
      <button
        class={buttonClassName}
        type="button"
        title={icon ? ariaLabel : undefined}
        aria-label={icon ? ariaLabel : undefined}
        onClick={() => setPicking(true)}
      >
        {icon ?? buttonLabel}
      </button>
      {picking && (
        <PickerModal
          title={pickerTitle}
          items={items}
          selectedId={currentId}
          onPick={(id) => {
            onPick(id)
            setPicking(false)
          }}
          onCancel={() => {
            setPicking(false)
            onClose?.()
          }}
          createNewLabel={createNewLabel}
          onCreateNew={() => {
            void onCreateNew()
            setPicking(false)
          }}
        />
      )}
    </>
  )
}
