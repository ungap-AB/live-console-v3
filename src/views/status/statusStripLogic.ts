// What the status strip (UNG-322) shows. It follows the project open in the console's Projects surface: the shell keeps one
// console frame, so the strip in Combined view and Projects share the same open project.
export type StatusStripView = 'loading' | 'signIn' | 'noProject' | 'project'

export function statusStripView(auth: 'loading' | 'anon' | 'authed', projectId: string | null): StatusStripView {
  if (auth === 'loading') return 'loading'
  if (auth === 'anon') return 'signIn'
  return projectId ? 'project' : 'noProject'
}
