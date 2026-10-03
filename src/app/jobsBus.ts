import { routeHref } from './router'

// Lös koppling mellan vyer och jobbhanteringen (UNG-80, UNG-100): en vy som startat ett jobb säger till så att jobblistan
// hämtar direkt i stället för att vänta på nästa fokus. Fönsterhändelser, så ingen vy behöver känna till skalet.
const CHANGED = 'ungap:jobs-changed'

export function notifyJobsChanged(): void {
  window.dispatchEvent(new Event(CHANGED))
}

export function onJobsChanged(listener: () => void): () => void {
  window.addEventListener(CHANGED, listener)
  return () => window.removeEventListener(CHANGED, listener)
}

/** Öppnar Jobb-vyn, där pågående och klara jobb hanteras. */
export function openJobsView(): void {
  window.location.hash = routeHref('jobs')
}
