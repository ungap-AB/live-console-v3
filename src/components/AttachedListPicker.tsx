import { useState } from 'preact/hooks'
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
}: AttachedListPickerProps) {
  const [picking, setPicking] = useState(false)

  return (
    <>
      <button class={buttonClassName} type="button" onClick={() => setPicking(true)}>
        {buttonLabel}
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
          onCancel={() => setPicking(false)}
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
