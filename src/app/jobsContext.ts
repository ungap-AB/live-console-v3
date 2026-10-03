import { createContext } from 'preact'
import type { MediaJob } from '../data/types'

// Domänens mediajobb (UNG-100). Skalet hämtar och pollar dem en gång (useJobs) och delar dem med Jobb-vyn, så vyn
// visar samma levande status som panelen utan en andra poll.
export const JobsContext = createContext<MediaJob[]>([])
