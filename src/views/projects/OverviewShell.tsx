import type { ComponentChildren } from 'preact'
import { PlayerPreview } from './PlayerPreview'
import type { PlayerPreviewMode } from './PlayerPreview'
import './OverviewShell.css'

export interface OverviewPlayer {
  /** Projektets spelaradress, samma som tittarna går till. */
  url: string
  /** Ökar när något publicerats eller sparats, så att spelaren laddas om. */
  version: number
  /** Ett annat läge att visa spelaren i som förhandsvisning (Live i Before, Ondemand i After). */
  preview?: PlayerPreviewMode
}

interface OverviewShellProps {
  projectId: string
  /** Rubriken överst (ProjectHeader). */
  header: ComponentChildren
  /** Det som står över spalterna (t.ex. ordningsstegen). */
  top?: ComponentChildren
  /** Vänsterspalten: lägets översikt och knappar. */
  children: ComponentChildren
  /** Spelaren i högerspalten; utelämnad = tom spalt. */
  player?: OverviewPlayer | null
  /** En arbetsvy (editorn, utspelningen) ligger över vyn: spelaren stängs av så att den inte hörs i bakgrunden. */
  workOpen?: boolean
  /** Dialoger och arbetsvyer som läggs utanför spalterna. */
  overlays?: ComponentChildren
}

// UNG-267: samma ram i Before, Live, After och Ondemand: rubrik, översikt till vänster och den riktiga spelaren till höger.
// Arbetsvyerna läggs över hela vyn (position: fixed) och döljer spelaren; medan de är öppna är spelaren urladdad och den laddas om när
// de stängs.
export function OverviewShell({ projectId, header, top, children, player, workOpen = false, overlays }: OverviewShellProps) {
  return (
    <div class="project-workspace doc">
      {header}
      <div class="ovs">
        {top}
        <div class="ovs-cols">
          <section class="ovs-col ovs-overview" aria-label="Översikt">
            {children}
          </section>
          <section class="ovs-col ovs-player" aria-label="Spelaren">
            {player && !workOpen && <PlayerPreview projectId={projectId} url={player.url} version={player.version} preview={player.preview} />}
          </section>
        </div>
      </div>
      {overlays}
    </div>
  )
}
