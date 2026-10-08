// UNG-189: "Koppla till Meeting" valt i skapa-dialogen. Önskemålet öppnar Meeting-kopplingen i det nya projektet när det visas (som
// captionEntryLogic.requestCaptionStudio): gäller en gång, för rätt projekt, och en kort stund, så att ett gammalt önskemål inte
// öppnar något långt senare.
let pending: { projectId: string; at: number } | null = null
const REQUEST_MS = 10_000

export function requestMeetingBinding(projectId: string, now: number = Date.now()): void {
  pending = { projectId, at: now }
}

/** Sant (en gång) om Meeting-kopplingen ska öppnas direkt för projektet. */
export function consumeMeetingBindingRequest(projectId: string, now: number = Date.now()): boolean {
  const request = pending
  pending = null
  return request !== null && request.projectId === projectId && now - request.at <= REQUEST_MS
}
