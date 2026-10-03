// Lös koppling mellan vyer och jobbfältet (UNG-80 steg 2): en vy som startat ett jobb säger till så att
// jobbfältet hämtar direkt i stället för att vänta på nästa fokus. Fönsterhändelser, så ingen vy behöver
// känna till skalet.
const CHANGED = 'ungap:jobs-changed'
const OPEN = 'ungap:jobs-open'

export function notifyJobsChanged(): void {
  window.dispatchEvent(new Event(CHANGED))
}

export function openJobTray(): void {
  window.dispatchEvent(new Event(OPEN))
}

export function onJobsChanged(listener: () => void): () => void {
  window.addEventListener(CHANGED, listener)
  return () => window.removeEventListener(CHANGED, listener)
}

export function onOpenJobTray(listener: () => void): () => void {
  window.addEventListener(OPEN, listener)
  return () => window.removeEventListener(OPEN, listener)
}
