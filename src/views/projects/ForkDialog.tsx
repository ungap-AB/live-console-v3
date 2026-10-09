import { useEffect, useState } from 'preact/hooks'
import { client } from '../../data'
import type { ForkResult, ForkWindow, Project } from '../../data/types'
import { Modal } from '../../components/Modal'
import { clockValue, forkFromOptions, timeInWindow, type ForkFromOption, type ForkSource } from './forkLogic'

interface ForkDialogProps {
  project: Project
  source: ForkSource
  onClose: () => void
  onForked: (result: ForkResult) => void
}

// UNG-198: skapa ett ondemand-projekt ur sändningen (eller ur en färdig inspelning). Källan, och strömmen, påverkas inte.
export function ForkDialog({ project, source, onClose, onForked }: ForkDialogProps) {
  const [name, setName] = useState('')
  const [options, setOptions] = useState<ForkFromOption[]>(() => forkFromOptions([]))
  const [choice, setChoice] = useState('start')
  // Egen starttid (tidväljare): klockslaget i lokal tid, inom fönstret som servern anger.
  const [window_, setWindow] = useState<ForkWindow | null>(null)
  const [time, setTime] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    let cancelled = false
    client.projects.playout(project.id).then(
      (playout) => { if (!cancelled && playout) setOptions(forkFromOptions(playout.timeline)) },
      () => { /* förslagen är bara en hjälp; "från början" finns alltid */ },
    )
    client.projects.forkWindow(project.id).then(
      (value) => {
        if (cancelled) return
        setWindow(value)
        setTime((current) => current || clockValue(value.startUtc))
      },
      () => { /* utan fönster finns inte tidväljaren; förslagen räcker */ },
    )
    return () => { cancelled = true }
  }, [project.id])

  const custom = choice === 'time' && window_ ? timeInWindow(time, window_) : null
  const customError = custom && 'error' in custom ? custom.error : ''

  async function create() {
    if (busy) return
    setBusy(true)
    setError('')
    try {
      const fromUtc = choice === 'time' ? (custom && 'iso' in custom ? custom.iso : undefined) : options.find((option) => option.key === choice)?.fromUtc ?? undefined
      onForked(await client.projects.forkProject(project.id, { name: name.trim() || undefined, fromUtc }))
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Projektet kunde inte skapas.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <Modal
      title="Skapa ondemand-projekt"
      onClose={onClose}
      closeDisabled={busy}
      footer={(
        <>
          <button class="btn btn-sm" type="button" disabled={busy} onClick={onClose}>Avbryt</button>
          <button class="btn btn-sm btn-primary" type="button" disabled={busy || Boolean(customError)} onClick={() => void create()}>
            {busy ? 'Skapar…' : 'Skapa projekt'}
          </button>
        </>
      )}
    >
      {source === 'live' ? (
        <p>
          Ett nytt projekt skapas av sändningen hittills. <strong>Livesändningen fortsätter oförändrad</strong> i det här projektet och strömmen bryts inte.
          I det nya projektet trimmar du, skapar undertexter och publicerar som en egen ondemand-sändning med egen länk. De allra senaste sekunderna
          tas inte med.
        </p>
      ) : (
        <p>Ett nytt projekt skapas av inspelningen. Det här projektet påverkas inte. I det nya projektet trimmar du, skapar undertexter och publicerar som en egen ondemand-sändning.</p>
      )}
      <label class="fk-field">
        <span>Namn (valfritt)</span>
        <input type="text" value={name} placeholder={`${project.name} (start–slut, hh:mm)`} onInput={(event) => setName(event.currentTarget.value)} />
        <span class="fk-help">Lämnas namnet tomt blir det projektets namn med start- och sluttid.</span>
      </label>
      <fieldset class="fk-from">
        <legend>Börja</legend>
        {options.map((option) => (
          <label key={option.key} class="fk-option">
            <input type="radio" name="fork-from" checked={choice === option.key} onChange={() => setChoice(option.key)} />
            <span>{option.label}</span>
          </label>
        ))}
        {window_ && (
          <label class="fk-option">
            <input type="radio" name="fork-from" checked={choice === 'time'} onChange={() => setChoice('time')} />
            <span>Från klockan</span>
            <input
              class="fk-time"
              type="time"
              step={60}
              value={time}
              aria-label="Starttid för det nya projektet"
              onFocus={() => setChoice('time')}
              onInput={(event) => { setTime(event.currentTarget.value); setChoice('time') }}
            />
            <span class="fk-help">{window_.source === 'live' ? `Sändningen har pågått sedan ${clockValue(window_.startUtc)}.` : `Inspelningen gäller ${clockValue(window_.startUtc)}–${clockValue(window_.endUtc)}.`}</span>
          </label>
        )}
        {customError && <span class="ce-error-text" role="alert">{customError}</span>}
        <span class="fk-help">Fork är inte gjord för tajta klipp: starten läggs på närmaste segment och kan bli upp till 10 sekunder tidigare. Du väljer exakt början och slut när du trimmar i det nya projektet.</span>
      </fieldset>
      {error && <p class="ce-error-text" role="alert">{error}</p>}
    </Modal>
  )
}
