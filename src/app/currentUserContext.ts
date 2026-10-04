import { createContext } from 'preact'
import { useContext } from 'preact/hooks'

// Om den inloggade är root admin. Skalet sätter värdet en gång, så djupt nästlade vyer (t.ex. Live-vyns
// Testbädd) kan avgöra det utan att varje mellanliggande komponent skickar med rollerna.
export const IsRootAdminContext = createContext(false)

export function useIsRootAdmin(): boolean {
  return useContext(IsRootAdminContext)
}
