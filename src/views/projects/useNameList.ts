import { useEffect } from 'preact/hooks'
import { client } from '../../data'
import type { Project } from '../../data/types'
import { useResource } from '../../app/useResource'

const MEETING_NAMELIST_POLL_MS = 5000

// Namnlistan fylls på av inkommande Meeting-talarcues server-side
// (AdapterController.Cue → NameListStore.AddOrMoveToFront) utan att
// namelistId ändras — useResource hämtar då aldrig om av sig själv.
// Samma klientdrivna pollnings-mönster som useLiveChannels hälsokoll (se
// den filens kommentar), men bara medan Meeting-händelser faktiskt kan
// skriva till listan. Delad av BeforeWorkspace/LiveWorkspace/PlayoutColumns
// så alla tre ställen där namnlistan visas hålls färska på samma sätt.
export function useNameList(p: Project) {
  const resource = useResource(
    () => (p.namelistId ? client.namelists.get(p.namelistId) : Promise.resolve(undefined)),
    [p.namelistId],
  )

  useEffect(() => {
    if (!p.namelistId || !p.meetingBindingId || !p.meetingEventsEnabled) return
    const id = setInterval(() => resource.reload(), MEETING_NAMELIST_POLL_MS)
    return () => clearInterval(id)
  }, [p.namelistId, p.meetingBindingId, p.meetingEventsEnabled, resource.reload])

  return resource
}
