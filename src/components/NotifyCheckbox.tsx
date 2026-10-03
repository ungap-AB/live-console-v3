import { useState } from 'preact/hooks'
import { readNotifyByEmail, storeNotifyByEmail } from '../app/notifyPreference'
import './NotifyCheckbox.css'

interface NotifyCheckboxProps {
  disabled?: boolean
}

// "Mejla mig när det är klart" vid start av nedladdning/uppladdning. Valet läses vid start via
// readNotifyByEmail, så startknapparna behöver inte ta emot det som prop.
export function NotifyCheckbox({ disabled }: NotifyCheckboxProps) {
  const [checked, setChecked] = useState(readNotifyByEmail)
  return (
    <label class="notify-checkbox">
      <input
        type="checkbox"
        checked={checked}
        disabled={disabled}
        onChange={(event) => {
          setChecked(event.currentTarget.checked)
          storeNotifyByEmail(event.currentTarget.checked)
        }}
      />
      Mejla mig när det är klart
    </label>
  )
}
