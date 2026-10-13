import { t } from '@lingui/core/macro'
import { useEffect, useState } from 'preact/hooks'
import { client } from '../../data'
import type { ForkResult, ForkWindow, Project } from '../../data/types'
import { Modal } from '../../components/Modal'
import { clockValue, forkFromOptions, forkRangeError, forkToOptions, timeInWindow, type ForkFromOption, type ForkSource, type ForkToOption } from './forkLogic'

interface ForkDialogProps {
  project: Project
  source: ForkSource
  onClose: () => void
  onForked: (result: ForkResult) => void
}

// UNG-198: skapa ett ondemand-projekt ur sändningen (eller ur en färdig inspelning). Källan, och strömmen, påverkas inte.
function namePlaceholder(projectName: string): string {
  return t`${projectName} (start–end, hh:mm)`
}

function windowHelp(source: string, start: string, end: string): string {
  return source === 'live' ? t`The broadcast has been running since ${start}.` : t`The recording covers ${start}–${end}.`
}

export function ForkDialog({ project, source, onClose, onForked }: ForkDialogProps) {
  const [name, setName] = useState('')
  const [options, setOptions] = useState<ForkFromOption[]>(() => forkFromOptions([]))
  const [choice, setChoice] = useState('start')
  // Egen starttid (tidväljare): klockslaget i lokal tid, inom fönstret som servern anger.
  const [window_, setWindow] = useState<ForkWindow | null>(null)
  const [time, setTime] = useState('')
  // UNG-276: var forken slutar, på samma sätt som början.
  const [toOptions, setToOptions] = useState<ForkToOption[]>(() => forkToOptions([], source))
  const [toChoice, setToChoice] = useState('end')
  const [toTime, setToTime] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    let cancelled = false
    client.projects.playout(project.id).then(
      (playout) => {
        if (cancelled || !playout) return
        setOptions(forkFromOptions(playout.timeline))
        setToOptions(forkToOptions(playout.timeline, source))
      },
      () => { /* förslagen är bara en hjälp; "från början" finns alltid */ },
    )
    client.projects.forkWindow(project.id).then(
      (value) => {
        if (cancelled) return
        setWindow(value)
        setTime((current) => current || clockValue(value.startUtc))
        setToTime((current) => current || clockValue(value.endUtc))
      },
      () => { /* utan fönster finns inte tidväljaren; förslagen räcker */ },
    )
    return () => { cancelled = true }
  }, [project.id, source])

  const custom = choice === 'time' && window_ ? timeInWindow(time, window_) : null
  const customTo = toChoice === 'time' && window_ ? timeInWindow(toTime, window_) : null
  const fromUtc = choice === 'time' ? (custom && 'iso' in custom ? custom.iso : undefined) : options.find((option) => option.key === choice)?.fromUtc ?? undefined
  const toUtc = toChoice === 'time' ? (customTo && 'iso' in customTo ? customTo.iso : undefined) : toOptions.find((option) => option.key === toChoice)?.toUtc ?? undefined
  const customError = (custom && 'error' in custom ? custom.error : '')
    || (customTo && 'error' in customTo ? customTo.error : '')
    || forkRangeError(fromUtc, toUtc, window_)

  async function create() {
    if (busy) return
    setBusy(true)
    setError('')
    try {
      onForked(await client.projects.forkProject(project.id, { name: name.trim() || undefined, fromUtc, toUtc }))
    } catch (err) {
      setError(err instanceof Error ? err.message : t`The project could not be created.`)
    } finally {
      setBusy(false)
    }
  }

  return (
    <Modal
      title={t`Create on-demand project`}
      onClose={onClose}
      closeDisabled={busy}
      footer={(
        <>
          <button class="btn btn-sm" type="button" disabled={busy} onClick={onClose}>{t`Cancel`}</button>
          <button class="btn btn-sm btn-primary" type="button" disabled={busy || Boolean(customError)} onClick={() => void create()}>
            {busy ? t`Creating…` : t`Create project`}
          </button>
        </>
      )}
    >
      {source === 'live' ? (
        <p>
          {t`A new project is created from the broadcast so far.`} <strong>{t`The live broadcast continues unchanged`}</strong> {t`in this project and the stream is not interrupted. In the new project you trim, create captions and publish as a separate on-demand broadcast with its own link. The very latest seconds are not included.`}
        </p>
      ) : (
        <p>{t`A new project is created from the recording. This project is not affected. In the new project you trim, create captions and publish as a separate on-demand broadcast.`}</p>
      )}
      <label class="fk-field">
        <span>{t`Name (optional)`}</span>
        <input type="text" value={name} placeholder={namePlaceholder(project.name)} onInput={(event) => setName(event.currentTarget.value)} />
        <span class="fk-help">{t`If the name is left empty, it becomes the project's name with start and end time.`}</span>
      </label>
      <fieldset class="fk-from">
        <legend>{t`Start`}</legend>
        {options.map((option) => (
          <label key={option.key} class="fk-option">
            <input type="radio" name="fork-from" checked={choice === option.key} onChange={() => setChoice(option.key)} />
            <span>{option.label}</span>
          </label>
        ))}
        {window_ && (
          <label class="fk-option">
            <input type="radio" name="fork-from" checked={choice === 'time'} onChange={() => setChoice('time')} />
            <span>{t`From the time`}</span>
            <input
              class="fk-time"
              type="time"
              step={60}
              value={time}
              aria-label={t`Start time for the new project`}
              onFocus={() => setChoice('time')}
              onInput={(event) => { setTime(event.currentTarget.value); setChoice('time') }}
            />
            <span class="fk-help">{windowHelp(window_.source, clockValue(window_.startUtc), clockValue(window_.endUtc))}</span>
          </label>
        )}
      </fieldset>
      <fieldset class="fk-from">
        <legend>{t`End`}</legend>
        {toOptions.map((option) => (
          <label key={option.key} class="fk-option">
            <input type="radio" name="fork-to" checked={toChoice === option.key} onChange={() => setToChoice(option.key)} />
            <span>{option.label}</span>
          </label>
        ))}
        {window_ && (
          <label class="fk-option">
            <input type="radio" name="fork-to" checked={toChoice === 'time'} onChange={() => setToChoice('time')} />
            <span>{t`At the time`}</span>
            <input
              class="fk-time"
              type="time"
              step={60}
              value={toTime}
              aria-label={t`End time for the new project`}
              onFocus={() => setToChoice('time')}
              onInput={(event) => { setToTime(event.currentTarget.value); setToChoice('time') }}
            />
          </label>
        )}
        {customError && <span class="ce-error-text" role="alert">{customError}</span>}
        <span class="fk-help">{t`Fork is not made for tight clips: start and end are placed on the nearest segment and can be up to 10 seconds wider. You choose the exact start and end when you trim in the new project.`}</span>
      </fieldset>
      {error && <p class="ce-error-text" role="alert">{error}</p>}
    </Modal>
  )
}
