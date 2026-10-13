import { plural, t } from '@lingui/core/macro'
import { useEffect, useState } from 'preact/hooks'
import { client } from '../../data'
import type { MeetingSummary, MeetingTopic } from '../../data/types'
import { Modal } from '../../components/Modal'
import type { ProjectActions } from './actions'
import './MeetingBindingModal.css'

type Step = 'domain' | 'meetings' | 'events' | 'done'

interface MeetingBindingModalProps {
  projectName: string
  meetingDomain: string
  currentAgendaName?: string
  actions: ProjectActions
  onClose: () => void
}

function meetingIdText(meetingId: string | number): string {
  return t`Meeting ID ${meetingId}`
}

function topicsFetchedText(title: string, count: number): string {
  return plural(count, { one: `${title} · # agenda item fetched`, other: `${title} · # agenda items fetched` })
}

function linkedText(title: string): string {
  return t`${title} is linked to the project.`
}

export function MeetingBindingModal({ projectName, meetingDomain, currentAgendaName, actions, onClose }: MeetingBindingModalProps) {
  const [step, setStep] = useState<Step>('domain')
  const [meetings, setMeetings] = useState<MeetingSummary[]>([])
  const [activeMeetingId, setActiveMeetingId] = useState<number | null>(null)
  const [selectedMeeting, setSelectedMeeting] = useState<MeetingSummary | null>(null)
  const [topics, setTopics] = useState<MeetingTopic[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (step === 'domain') setError(null)
  }, [step])

  async function findMeetings() {
    const normalizedDomain = meetingDomain.trim().toLowerCase()
    if (!normalizedDomain) {
      setError(t`Your user has no domain.`)
      return
    }
    setLoading(true)
    setError(null)
    try {
      const [found, active] = await Promise.all([
        client.meetings.list(normalizedDomain),
        client.meetings.getActive(normalizedDomain).catch(() => null),
      ])
      const activeId = active?.id ?? null
      // Aktivt möte först — det är oftast det man vill koppla till — annars nyast först.
      const sorted = [...found].sort((a, b) => (b.id === activeId ? 1 : 0) - (a.id === activeId ? 1 : 0) || b.id - a.id)
      setMeetings(sorted)
      setActiveMeetingId(activeId)
      // Förvald: det aktiva mötet, om det finns bland de listade — annars måste
      // operatören välja själv (inget möte förvalt).
      setSelectedMeeting(sorted.find((meeting) => meeting.id === activeId) ?? null)
      setStep('meetings')
      if (found.length === 0) setError(t`No meetings were found for the domain.`)
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : t`Could not fetch meetings.`)
    } finally {
      setLoading(false)
    }
  }

  async function loadMeetingAgenda() {
    if (!selectedMeeting) return
    setLoading(true)
    setError(null)
    try {
      const agendaTopics = await client.meetings.getAgenda(meetingDomain.trim().toLowerCase(), selectedMeeting.id)
      setTopics(agendaTopics)
      setStep('events')
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : t`Could not fetch the Meeting agenda.`)
    } finally {
      setLoading(false)
    }
  }

  async function connectMeeting(eventsEnabled: boolean) {
    if (!selectedMeeting) return
    setLoading(true)
    setError(null)
    try {
      // Dagordning + namnlista skapas (eller återanvänds, om mötet redan
      // kopplats till ett annat projekt tidigare) av live-server-v3 som en del
      // av bindningen — se ProjectsController.SetMeetingBinding.
      await actions.setMeetingBinding(meetingDomain.trim().toLowerCase(), String(selectedMeeting.id), eventsEnabled)
      setStep('done')
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : t`Could not link the meeting.`)
    } finally {
      setLoading(false)
    }
  }

  if (step === 'domain') {
    return (
      <Modal title={t`Link to Meeting`} subtitle={t`Project: ${projectName}`} onClose={onClose}>
        <label class="form-label" for="meeting-domain">{t`Meeting domain`}</label>
        <input
          id="meeting-domain"
          class="form-input"
          value={meetingDomain}
          placeholder="ale.se"
          readOnly
          aria-readonly="true"
          onKeyDown={(event) => {
            if (event.key === 'Enter') void findMeetings()
          }}
          autofocus
        />
        {error && <p class="form-error">{error}</p>}
        <div class="modal-actions">
          <button class="btn btn-sm" type="button" onClick={onClose}>{t`Cancel`}</button>
          <button class="btn btn-sm btn-primary" type="button" disabled={loading} onClick={() => void findMeetings()}>
            {loading ? t`Fetching...` : t`Continue`}
          </button>
        </div>
      </Modal>
    )
  }

  if (step === 'meetings') {
    return (
      <Modal
        title={t`Choose meeting`}
        subtitle={t`Meeting domain: ${meetingDomain}`}
        onClose={onClose}
        footer={
          <>
            <button class="btn btn-sm" type="button" onClick={() => setStep('domain')}>{t`Back`}</button>
            <button class="btn btn-sm btn-primary" type="button" disabled={!selectedMeeting || loading} onClick={() => void loadMeetingAgenda()}>
              {loading ? t`Fetching agenda...` : t({ message: 'Link', context: 'verb' })}
            </button>
          </>
        }
      >
        {meetings.length > 0 ? (
          <ul class="meeting-picker-list">
            {meetings.map((meeting) => (
              <li key={meeting.id}>
                <button
                  type="button"
                  class={[
                    selectedMeeting?.id === meeting.id ? 'selected' : '',
                    meeting.id === activeMeetingId ? 'is-active-meeting' : '',
                  ].filter(Boolean).join(' ')}
                  onClick={() => setSelectedMeeting(meeting)}
                >
                  <strong>{meeting.title}</strong>
                  <span>
                    {meetingIdText(meeting.id)}
                    {meeting.id === activeMeetingId && <span class="meeting-picker-active">{t`Active meeting`}</span>}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        ) : (
          <p class="empty-state">{error ?? t`No meetings were found for the domain.`}</p>
        )}
        {error && meetings.length > 0 && <p class="form-error">{error}</p>}
      </Modal>
    )
  }

  if (step === 'events') {
    return (
      <Modal title={t`Meeting linked`} subtitle={topicsFetchedText(selectedMeeting?.title ?? '', topics.length)} onClose={onClose}>
        <p>{t`Should events from Meeting play out agenda items and name signs in the broadcast?`}</p>
        {currentAgendaName && <p class="field-help">{t`The current agenda is replaced by a new Meeting agenda and is no longer linked to the project.`}</p>}
        {error && <p class="form-error">{error}</p>}
        <div class="modal-actions">
          <button class="btn btn-sm" type="button" disabled={loading} onClick={() => void connectMeeting(false)}>
            {loading ? t`Saving...` : t`No, ignore events`}
          </button>
          <button class="btn btn-sm btn-primary" type="button" disabled={loading} onClick={() => void connectMeeting(true)}>
            {loading ? t`Saving...` : t`Yes, play out events`}
          </button>
        </div>
      </Modal>
    )
  }

  return (
    <Modal title={t`Meeting linked`} onClose={onClose}>
      <p>{linkedText(selectedMeeting?.title ?? '')}</p>
      <p>{plural(topics.length, { one: 'Agenda (# item) and a name list for the meeting are linked.', other: 'Agenda (# items) and a name list for the meeting are linked.' })}</p>
      <div class="modal-actions">
        <button class="btn btn-sm btn-primary" type="button" onClick={onClose}>{t`Done`}</button>
      </div>
    </Modal>
  )
}
