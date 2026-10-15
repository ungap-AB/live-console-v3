// What the status strip (UNG-322) shows. It follows the project open in the console's Projects surface: the shell keeps one
// console frame, so the strip in Combined view and Projects share the same open project.
export type StatusStripView = 'loading' | 'signIn' | 'noProject' | 'project'

export function statusStripView(auth: 'loading' | 'anon' | 'authed', projectId: string | null): StatusStripView {
  if (auth === 'loading') return 'loading'
  if (auth === 'anon') return 'signIn'
  return projectId ? 'project' : 'noProject'
}

// UNG-332: whether the meeting open below in Combined view drives this project's graphics. The link is the project's
// (set in Before, UNG-338); the open meeting comes from Meeting through the shell. The strip says it plainly, so nobody
// can believe that a meeting drives the graphics of a project it is not linked to.
export type MeetingLinkStatus =
  | 'unknown' // the link has not loaded (or failed): say nothing rather than guess
  | 'unavailable' // the organisation has no ungap Meeting connected
  | 'notLinked' // the project is linked to no meeting
  | 'notOpen' // linked, but no meeting is open below
  | 'other' // another meeting is open below
  | 'drives' // the linked meeting is open below

export function meetingLinkStatus(
  link: { available: boolean; meetingId: string | null } | null,
  openMeetingId: string | null,
): MeetingLinkStatus {
  if (!link) return 'unknown'
  if (!link.meetingId) return link.available ? 'notLinked' : 'unavailable'
  if (!openMeetingId) return 'notOpen'
  return openMeetingId.toLowerCase() === link.meetingId.toLowerCase() ? 'drives' : 'other'
}
