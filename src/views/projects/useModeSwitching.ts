import { useEffect, useState } from 'preact/hooks'
import type { PublicMode } from '../../data/types'
import { currentModeSwitch, subscribeModeSwitch } from './modeSwitch'

/** Läget projektet håller på att byta till, eller null. Uppdateras när bytet börjar och slutar. */
export function useModeSwitching(projectId: string): PublicMode | null {
  const [target, setTarget] = useState<PublicMode | null>(() => currentModeSwitch(projectId))
  useEffect(() => {
    setTarget(currentModeSwitch(projectId))
    return subscribeModeSwitch(() => setTarget(currentModeSwitch(projectId)))
  }, [projectId])
  return target
}
