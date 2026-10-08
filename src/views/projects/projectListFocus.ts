// UNG-183: när man går tillbaka till projektlistan ska projektet man kom från vara markerat och scrollat i fokus.

/** Det projekt som ska markeras: det senast öppnade, om det finns kvar i listan (annars händer inget). */
export function revealTarget(lastOpenedId: string | null, projects: readonly { id: string }[]): string | null {
  return lastOpenedId !== null && projects.some((project) => project.id === lastOpenedId) ? lastOpenedId : null
}

/** Det senast öppnade projektet: ett öppet projekt ersätter det, och att gå tillbaka till listan (inget öppet) behåller det. */
export function nextLastOpened(previous: string | null, openId: string | null): string | null {
  return openId ?? previous
}

/** Behöver raden scrollas fram? Inte om den redan ligger helt inom synfältet (ingen onödig rörelse). */
export function needsScroll(row: { top: number; bottom: number }, view: { top: number; bottom: number }): boolean {
  return row.top < view.top || row.bottom > view.bottom
}
