import { useEffect, useState } from 'preact/hooks'
import { client } from '../../data'
import type { Agenda, NameList, Project, Recording } from '../../data/types'
import { useResource } from '../../app/useResource'
import { StatusChip, type ChipTone } from '../../components/StatusChip'
import { CopyField } from '../../components/CopyField'
import { AttachedListPicker } from '../../components/AttachedListPicker'
import { EditableItemList } from '../../components/EditableItemList'
import { VideoLightbox } from '../../components/VideoLightbox'
import { ConfirmModal } from '../../components/ConfirmModal'
import type { ProjectActions } from './actions'
import { formatDateTime, formatHms } from '../../app/time'
import { useTick } from './useTick'
import { useLiveChannel } from './useLiveChannel'
import { phaseMeta } from './livePhase'
import { resolveGuidedPhase } from './guidedPhase'
import { resolveOriginalRecordingForTrim } from './openTrimDialog'
import { TrimDialog } from '../archive/TrimDialog'
import { CheckIcon, PlayIcon } from '../../components/icons'
import { Icon } from '../../components/Icon'
import './Playout.css'

interface PlayoutProps {
  project: Project
  onClose: () => void
  actions: ProjectActions
}

export function Playout({ project: p, onClose, actions }: PlayoutProps) {
  const { channel, health, streamKey, refresh, stopPolling } = useLiveChannel(p.channel?.id ?? null)
  const phase = health?.livePhase
  const live = phase === 'live'
  useTick(live)

  const rec = p.recording?.state ?? 'none'
  const guidedPhase = resolveGuidedPhase(p, phase, rec)
  const canTrim = p.capabilities.trimRecording.status === 'allowed'
  const canPublish = p.capabilities.publishVod.status === 'allowed'
  const [showVideo, setShowVideo] = useState(false)
  const [showIngestInfo, setShowIngestInfo] = useState(false)
  const [trimming, setTrimming] = useState<Recording | null>(null)
  const [confirmReturnToLive, setConfirmReturnToLive] = useState(false)

  // Hälsan upptäcker fasen före projektets recording-ref. Hämta projektet
  // igen både efter stopp och medan asseten verifieras, så trim blir tillgänglig
  // när backend faktiskt har markerat inspelningen som klar.
  useEffect(() => {
    if (phase === 'streamEnded' && p.recording?.state !== 'recorded' && p.recording?.state !== 'trimmed' && p.recording?.state !== 'published') {
      void actions.refreshProject()
    }
  }, [phase, p.recording?.state])

  const agendaResource = useResource(
    () => (p.agendaId ? client.agendas.get(p.agendaId) : Promise.resolve(undefined)),
    [p.agendaId],
  )
  const nameListResource = useResource(
    () => (p.namelistId ? client.namelists.get(p.namelistId) : Promise.resolve(undefined)),
    [p.namelistId],
  )
  const allAgendasResource = useResource(() => client.agendas.list(), [])
  const allNameListsResource = useResource(() => client.namelists.list(), [])

  // Lokal, muterbar kopia (samma mönster som AgendasView/NameListsViews
  // "selected") — så redigering av dagordningen/namnlistan direkt här i
  // Playout kan uppdatera UI:t omedelbart utan en full omhämtning.
  const [agenda, setAgenda] = useState<Agenda | null>(null)
  const [nameList, setNameList] = useState<NameList | null>(null)
  useEffect(() => setAgenda(agendaResource.data ?? null), [agendaResource.data])
  useEffect(() => setNameList(nameListResource.data ?? null), [nameListResource.data])

  const frozen = p.publication.state === 'published'
  // Utspelning ska fungera även offline — mötet måste dokumenteras trots
  // enkoderstrul. Tidslinjen kan synkas mot en uppladdad film senare.
  const canPlay = !frozen

  const subtitle = live
    ? `Playout · sänder sedan ${health?.streamStartedAt ? formatDateTime(health.streamStartedAt) : ''}`
    : 'Playout'

  const status: { label: string; tone: ChipTone } = frozen
    ? { label: 'Publicerad', tone: 'accent' }
    : p.channel
      ? phaseMeta(phase)
      : { label: 'Ingen ingest', tone: 'neutral' }
  const statusTone = status.tone
  const statusLabel = status.label

  const nowItem = agenda?.items.find((it) => it.id === p.playout.currentAgendaItemId)?.title ?? null
  const nowSpeaker = nameList?.people.find((pe) => pe.id === p.playout.currentPersonId)?.name ?? null

  function lastPlayedOffset(itemId: string): number | null {
    const events = p.playout.timeline.filter((e) => e.kind === 'agendaItem' && e.refId === itemId)
    if (events.length === 0) return null
    return events[events.length - 1].offsetSeconds
  }

  // Samma redigeringsanrop som AgendasView/NameListsView gör mot samma
  // klient-API — bara mot den dagordning/namnlista som råkar vara kopplad
  // till det här projektet, och med en lokal setter istället för replaceSelected.
  async function addAgendaItem(): Promise<string> {
    const updated = await client.agendas.addItem(agenda!.id, { title: 'Ny punkt' })
    setAgenda(updated)
    return updated.items[updated.items.length - 1].id
  }

  async function renameAgendaItem(itemId: string, title: string) {
    const updated = await client.agendas.updateItem(agenda!.id, itemId, { title })
    setAgenda(updated)
  }

  async function removeAgendaItem(itemId: string) {
    const updated = await client.agendas.removeItem(agenda!.id, itemId)
    setAgenda(updated)
  }

  async function reorderAgendaItems(nextItems: Agenda['items']) {
    const renumbered = nextItems.map((it, i) => ({ ...it, position: i + 1 }))
    const updated = await client.agendas.replaceItems(agenda!.id, renumbered)
    setAgenda(updated)
  }

  async function addPerson(): Promise<string> {
    const updated = await client.namelists.addPerson(nameList!.id, { name: 'Ny person' })
    setNameList(updated)
    return updated.people[updated.people.length - 1].id
  }

  async function renamePerson(personId: string, name: string) {
    const updated = await client.namelists.updatePerson(nameList!.id, personId, { name })
    setNameList(updated)
  }

  async function removePerson(personId: string) {
    const updated = await client.namelists.removePerson(nameList!.id, personId)
    setNameList(updated)
  }

  async function reorderPeople(nextPeople: NameList['people']) {
    const renumbered = nextPeople.map((pe, i) => ({ ...pe, position: i + 1 }))
    const updated = await client.namelists.replacePeople(nameList!.id, renumbered)
    setNameList(updated)
  }

  async function createAndAttachAgenda() {
    const created = await client.agendas.create({ name: p.name, description: 'Utkast' })
    actions.setAgenda(created.id)
    allAgendasResource.reload()
  }

  async function createAndAttachNameList() {
    const created = await client.namelists.create({ name: p.name, description: 'Utkast' })
    actions.setNameList(created.id)
    allNameListsResource.reload()
  }

  async function createIngest() {
    await actions.createChannel()
    await refresh()
  }

  async function teardownIngest() {
    // Stoppa pollningen istället för att refresh:a — kanalen är borta direkt
    // efter teardown, en efterföljande hälsokoll mot samma id 404:ar bara i
    // onödan (se minnesanteckningen om useLiveChannel.refresh-racet).
    stopPolling()
    await actions.teardownChannel()
  }

  async function openTrim() {
    if (!p.recording) return
    const original = await resolveOriginalRecordingForTrim(p.recording.id)
    if (original) setTrimming(original)
  }

  async function saveTrim(range: { startOffsetSeconds: number; endOffsetSeconds: number; sessionId?: string }): Promise<void> {
    if (await actions.trim(range)) {
      await actions.refreshProject()
      await refresh()
      setTrimming(null)
      // Trimning är sista manuella steget i det guidade flödet — publicera
      // (och riv en kvarvarande ingest) direkt istället för att kräva ett
      // eget klick på "Publicera" efteråt.
      await publishAndTeardownIngest()
    }
  }

  async function doReturnToLive() {
    await actions.returnToLive()
    setConfirmReturnToLive(false)
  }

  // Publicering är den definitiva "sändningen är klar"-handlingen — en
  // kvarvarande ingest fyller ingen funktion längre efter det, så den rivs
  // som en del av samma steg istället för att kräva ett separat handgrepp
  // som lätt glöms bort (se resonemanget 2026-09-16). p.channel är den
  // fångade project-propen från INNAN publish — publish rör aldrig kanalen,
  // så den är fortfarande korrekt att läsa direkt efteråt.
  async function publishAndTeardownIngest() {
    await actions.publish()
    if (p.channel) await teardownIngest()
  }

  let playNote = ''
  if (frozen) playNote = 'Sändningen är publicerad. Utspelning är avstängd.'
  else if (!live)
    playNote = 'Ingen aktiv sändning just nu — utspelning loggas ändå och kan synkas mot filmen senare.'

  return (
    <>
      <div class="panel-head">
        <div class="title-row">
          <div class="title">
            <StatusChip tone={statusTone} dot>
              {statusLabel}
            </StatusChip>
            {p.name}
            <span class="subtitle">{subtitle}</span>
          </div>
          <button class="ib" type="button" title="Stäng playout" aria-label="Stäng playout" onClick={onClose}>
            <Icon name="close" />
          </button>
        </div>
        <div class="panel-head-row">
          <div class="field field-grow">
            <label>Spelarlänk</label>
            <CopyField value={p.playerUrl} monospace />
          </div>
          <div class="field">
            <label>Synlighet</label>
            <div class="seg">
              <button
                type="button"
                aria-pressed={p.visibility === 'open'}
                onClick={() => actions.setVisibility('open')}
              >
                Öppen för publik
              </button>
              <button
                type="button"
                class="closed"
                aria-pressed={p.visibility === 'closed'}
                onClick={() => actions.setVisibility('closed')}
              >
                Stängd för publik
              </button>
            </div>
          </div>
          <button class="btn btn-sm" type="button" disabled={!channel} onClick={() => setShowIngestInfo((visible) => !visible)}>
            {showIngestInfo ? 'Dölj ingest-info' : 'Visa ingest-info'}
          </button>
        </div>
      </div>

      {showIngestInfo && channel && (
        <div class="guided-banner">
          <div class="rowset">
            <div class="field">
              <label>Ingest-server</label>
              <CopyField value={channel.ingestEndpoint} monospace />
            </div>
            <div class="field">
              <label>Stream key</label>
              <CopyField value={streamKey} mask monospace />
            </div>
            <div class="field">
              <label>HLS-URL</label>
              <CopyField value={channel.playbackUrl} monospace />
            </div>
          </div>
        </div>
      )}

      {guidedPhase === 'prepare' && (
        <div class="guided-banner">
          <p>Skapa en ingest-resurs för att kunna ta emot signal från enkodern.</p>
          <button class="btn btn-primary" type="button" onClick={() => void createIngest()}>
            Skapa ingest
          </button>
        </div>
      )}

      {guidedPhase === 'waiting' && (phase === 'signalInterrupted' || phase === 'signalInterruptedDeclined') && (
        <div class="guided-banner">
          <p class="gb-note warn">
            {phase === 'signalInterrupted'
              ? 'Signalavbrott — videosignalen har avbrutits medan playern är öppen.'
              : 'Signalavbrott — inväntar att enkodern återansluter.'}
          </p>
          <div class="rowset">
            <button class="btn btn-sm" type="button" onClick={() => void actions.interruptionDecision('wait_for_reconnect')}>
              Invänta återanslutning
            </button>
            <button class="btn btn-danger btn-sm" type="button" onClick={() => void actions.interruptionDecision('end')}>
              Stäng player och avsluta
            </button>
          </div>
        </div>
      )}

      {guidedPhase === 'waiting' && phase !== 'signalInterrupted' && (
        <div class="guided-banner">
          <div class="rowset">
            <div class="field">
              <label>Ingest-server</label>
              <CopyField value={channel?.ingestEndpoint ?? null} placeholder="Skapar…" monospace />
            </div>
            <div class="field">
              <label>Stream key</label>
              <CopyField value={streamKey} mask monospace />
            </div>
          </div>
          <p class="gb-note">Ingest skapad. Väntar på signal från enkodern.</p>
        </div>
      )}

      {guidedPhase === 'live' && p.visibility === 'closed' && (
        <div class="guided-banner">
          <p class="gb-note">Stoppa enkodern för att kunna publicera sändningen som ondemand.</p>
        </div>
      )}

      {guidedPhase === 'processing' && (
        <div class="guided-banner">
          <p class="gb-note">Sändningen är avslutad. Inspelningen bearbetas fortfarande och kan trimmas när den är klar.</p>
        </div>
      )}

      {guidedPhase === 'ended' && (
        <div class="guided-banner">
          <p class="gb-note">
            Sändningen är avslutad. Trimma inspelningen för att publicera ondemand. Starta enkodern igen för att
            fortsätta sända.
          </p>
          <button class="btn btn-primary" type="button" disabled={!canTrim} onClick={() => void openTrim()}>
            Trimma inspelning
          </button>
        </div>
      )}

      {guidedPhase === 'readyToPublish' && (
        <div class="guided-banner">
          <p class="gb-note">Inspelningen är trimmad och redo att publiceras.</p>
          <button class="btn btn-primary" type="button" disabled={!canPublish} onClick={() => void publishAndTeardownIngest()}>
            Publicera
          </button>
          <button class="btn btn-sm" type="button" disabled={!p.recording?.hlsUrl} onClick={() => setShowVideo(true)}>
            Visa inspelning
          </button>
        </div>
      )}

      {guidedPhase === 'published' && (
        <div class="guided-banner">
          <p class="gb-note">Sändningen är publicerad som ondemand.</p>
          <button class="btn btn-sm" type="button" onClick={() => setConfirmReturnToLive(true)}>
            Gå tillbaka till live
          </button>
        </div>
      )}

      <div class="now">
        <div class={nowItem ? '' : 'now-empty'}>
          <div class="k">Ärende i bild</div>
          <div class="v now-value">
            <span>{nowItem ?? '–'}</span>
            {nowItem && (
              <button
                class="ib now-clear"
                type="button"
                title="Rensa ärende i bild"
                aria-label="Rensa ärende i bild"
                onClick={() => actions.clear('agendaItem')}
              >
                ✕
              </button>
            )}
          </div>
        </div>
        <div class={nowSpeaker ? '' : 'now-empty'}>
          <div class="k">Talare i bild</div>
          <div class="v now-value">
            <span>{nowSpeaker ?? '–'}</span>
            {nowSpeaker && (
              <button
                class="ib now-clear"
                type="button"
                title="Rensa talare i bild"
                aria-label="Rensa talare i bild"
                onClick={() => actions.clear('person')}
              >
                ✕
              </button>
            )}
          </div>
        </div>
      </div>

      <div class={`cols ${live ? 'two' : ''} ${guidedPhase === 'published' ? 'published' : ''}`}>
        {guidedPhase !== 'published' && (
        <>
        <div class="col">
          <h3>
            Dagordning
            <AttachedListPicker
              currentId={p.agendaId}
              items={(allAgendasResource.data ?? []).map((a) => ({ id: a.id, name: a.name }))}
              pickerTitle="Byt dagordning"
              createNewLabel="Ny dagordning"
              onPick={(id) => actions.setAgenda(id)}
              onCreateNew={createAndAttachAgenda}
              buttonLabel="Välj..."
            />
          </h3>
          <div class="col-body">
            {!agenda ? (
              <p class="muted-empty">{p.agendaId ? 'Laddar…' : 'Ingen dagordning kopplad till projektet.'}</p>
            ) : (
              <EditableItemList
                items={agenda.items}
                getId={(it) => it.id}
                getLabel={(it) => it.title}
                numbered
                addLabel="Lägg till punkt"
                getItemClassName={(it) => (p.playout.currentAgendaItemId === it.id ? 'active' : '')}
                onReorder={reorderAgendaItems}
                onAdd={addAgendaItem}
                onRename={renameAgendaItem}
                onRemove={removeAgendaItem}
                renderExtra={(it) => {
                  const offset = lastPlayedOffset(it.id)
                  const done = offset != null
                  return (
                    <>
                      {done && <span class="time">{formatHms(offset)}</span>}
                      <button
                        class={`play ${done ? 'done' : ''}`}
                        type="button"
                        disabled={!canPlay}
                        title={done ? 'Spela ut igen' : 'Spela ut'}
                        onClick={() => actions.cue('agendaItem', it.id, it.title)}
                      >
                        {done ? <CheckIcon /> : <PlayIcon />}
                      </button>
                    </>
                  )
                }}
              />
            )}
          </div>
        </div>

        <div class="col">
          <h3>
            Namnlista
            <AttachedListPicker
              currentId={p.namelistId}
              items={(allNameListsResource.data ?? []).map((n) => ({ id: n.id, name: n.name }))}
              pickerTitle="Byt namnlista"
              createNewLabel="Ny namnlista"
              onPick={(id) => actions.setNameList(id)}
              onCreateNew={createAndAttachNameList}
              buttonLabel="Välj..."
            />
          </h3>
          <div class="col-body">
            {!nameList ? (
              <p class="muted-empty">{p.namelistId ? 'Laddar…' : 'Ingen namnlista kopplad till projektet.'}</p>
            ) : (
              <EditableItemList
                items={nameList.people}
                getId={(person) => person.id}
                getLabel={(person) => person.name}
                addLabel="Lägg till namn"
                getItemClassName={(person) => (p.playout.currentPersonId === person.id ? 'active' : '')}
                onReorder={reorderPeople}
                onAdd={addPerson}
                onRename={renamePerson}
                onRemove={removePerson}
                renderExtra={(person) => (
                  <button
                    class="play"
                    type="button"
                    disabled={!canPlay}
                    title="Spela ut"
                    onClick={() => actions.cue('person', person.id, person.name)}
                  >
                    <PlayIcon />
                  </button>
                )}
              />
            )}
          </div>
        </div>
        </>
        )}

        {!live && (
          <div class="col">
            <h3>
              Tidslinje
              {frozen && <StatusChip tone="accent">Fryst</StatusChip>}
            </h3>
            <div class="col-body">
              {p.playout.timeline.length === 0 ? (
                <p class="muted-empty">Inget utspelat ännu.</p>
              ) : (
                <ul class="tl">
                  {p.playout.timeline.map((e) => (
                    <li key={e.id}>
                      <span class="t">{formatHms(e.offsetSeconds ?? 0)}</span>
                      <span class="what">
                        {e.label}
                        <em>{e.kind === 'agendaItem' ? 'Ärende' : 'Talare'}</em>
                      </span>
                    </li>
                  ))}
                </ul>
              )}
              <p class="tl-foot">
                {frozen
                  ? 'Kapitellistan är fryst vid publicering och följer inte längre originaldagordningen.'
                  : 'Varje utspelning loggas här. Tidslinjen fryses som kapitellista när sändningen publiceras.'}
              </p>
            </div>
          </div>
        )}
      </div>

      {playNote && (
        <div class="playout-note">
          <div class="note">{playNote}</div>
        </div>
      )}

      {showVideo && (
        <VideoLightbox title={p.name} src={p.recording?.hlsUrl ?? ''} onClose={() => setShowVideo(false)} />
      )}

      {trimming && <TrimDialog recording={trimming} onCancel={() => setTrimming(null)} onSave={saveTrim} />}

      {confirmReturnToLive && (
        <ConfirmModal
          title="Gå tillbaka till live?"
          confirmLabel="Gå till live"
          danger
          onCancel={() => setConfirmReturnToLive(false)}
          onConfirm={() => void doReturnToLive()}
        >
          <p>
            Den kopplade ondemand-versionen kopplas bort och publiken kan inte längre se den. För att
            sända igen behöver du skapa en ny ingest-resurs och använda en ny stream key i enkodern.
          </p>
        </ConfirmModal>
      )}
    </>
  )
}
