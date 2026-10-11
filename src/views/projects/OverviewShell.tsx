import type { ComponentChildren } from 'preact'
import { PlayerPreview } from './PlayerPreview'
import './OverviewShell.css'

export interface OverviewPlayer {
  /** Projektets spelaradress, samma som tittarna går till. */
  url: string
  published: boolean
  /** Ökar när något publicerats eller sparats, så att spelaren laddas om. */
  version: number
}

interface OverviewShellProps {
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
export function OverviewShell({ header, top, children, player, workOpen = false, overlays }: OverviewShellProps) {
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
            {player && !workOpen && <PlayerPreview url={player.url} published={player.published} version={player.version} />}
          </section>
        </div>
      </div>
      {overlays}
    </div>
  )
}
