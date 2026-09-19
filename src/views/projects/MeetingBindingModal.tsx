import { useEffect, useState } from 'preact/hooks'
import { client } from '../../data'
import type { MeetingSummary, MeetingTopic } from '../../data/types'
import { Modal } from '../../components/Modal'
import type { ProjectActions } from './actions'

type Step = 'domain' | 'meetings' | 'events' | 'done'

interface MeetingBindingModalProps {
  projectName: string
  meetingDomain: string
  currentAgendaName?: string
  actions: ProjectActions
  onClose: () => void
}

export function MeetingBindingModal({ projectName, meetingDomain, currentAgendaName, actions, onClose }: MeetingBindingModalProps) {
  const [step, setStep] = useState<Step>('domain')
  const [meetings, setMeetings] = useState<MeetingSummary[]>([])
  const [selectedMeeting, setSelectedMeeting] = useState<MeetingSummary | null>(null)
  const [topics, setTopics] = useState<MeetingTopic[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [createdAgendaName, setCreatedAgendaName] = useState<string | null>(null)

  useEffect(() => {
    if (step === 'domain') setError(null)
  }, [step])

  async function findMeetings() {
    const normalizedDomain = meetingDomain.trim().toLowerCase()
    if (!normalizedDomain) {
      setError('Din användare saknar en domän.')
      return
    }
    setLoading(true)
    setError(null)
    try {
      const found = await client.meetings.list(normalizedDomain)
      setMeetings(found)
      setSelectedMeeting(null)
      setStep('meetings')
      if (found.length === 0) setError('Inga möten hittades för domänen.')
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Kunde inte hämta möten.')
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
      setError(cause instanceof Error ? cause.message : 'Kunde inte hämta Meeting-agendan.')
    } finally {
      setLoading(false)
    }
  }

  async function connectMeeting(eventsEnabled: boolean) {
    if (!selectedMeeting) return
    setLoading(true)
    setError(null)
    try {
      await actions.setMeetingBinding(meetingDomain.trim().toLowerCase(), String(selectedMeeting.id), eventsEnabled)
      const created = await client.agendas.create({
        name: `${selectedMeeting.title} — Meeting`,
        description: `Importerad från Meeting ${selectedMeeting.id}`,
      })
      let agenda = created
      for (const topic of topics) {
        agenda = await client.agendas.addItem(agenda.id, { title: topic.title })
      }
      await actions.setAgenda(agenda.id)
      setCreatedAgendaName(agenda.name)
      setStep('done')
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Kunde inte koppla mötet.')
    } finally {
      setLoading(false)
    }
  }

  if (step === 'domain') {
    return (
      <Modal title="Koppla till Meeting" subtitle={`Projekt: ${projectName}`} onClose={onClose}>
        <label class="form-label" for="meeting-domain">Meeting-domän</label>
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
          <button class="btn btn-sm" type="button" onClick={onClose}>Avbryt</button>
          <button class="btn btn-sm btn-primary" type="button" disabled={loading} onClick={() => void findMeetings()}>
            {loading ? 'Hämtar...' : 'Fortsätt'}
          </button>
        </div>
      </Modal>
    )
  }

  if (step === 'meetings') {
    return (
      <Modal
        title="Välj möte"
        subtitle={`Meeting-domän: ${meetingDomain}`}
        onClose={onClose}
        footer={
          <>
            <button class="btn btn-sm" type="button" onClick={() => setStep('domain')}>Tillbaka</button>
            <button class="btn btn-sm btn-primary" type="button" disabled={!selectedMeeting || loading} onClick={() => void loadMeetingAgenda()}>
              {loading ? 'Hämtar agenda...' : 'Koppla'}
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
                  class={selectedMeeting?.id === meeting.id ? 'selected' : ''}
                  onClick={() => setSelectedMeeting(meeting)}
                >
                  <strong>{meeting.title}</strong>
                  <span>Meeting-ID {meeting.id}</span>
                </button>
              </li>
            ))}
          </ul>
        ) : (
          <p class="empty-state">{error ?? 'Inga möten hittades för domänen.'}</p>
        )}
        {error && meetings.length > 0 && <p class="form-error">{error}</p>}
      </Modal>
    )
  }

  if (step === 'events') {
    return (
      <Modal title="Meeting kopplat" subtitle={`${selectedMeeting?.title ?? ''} · ${topics.length} agendapunkter hämtade`} onClose={onClose}>
        <p>Ska händelser från Meeting spela ut dagordningspunkter och namnskyltar i sändningen?</p>
        {currentAgendaName && <p class="field-help">Nuvarande agenda ersätts av en ny Meeting-agenda och kopplas inte längre till projektet.</p>}
        {error && <p class="form-error">{error}</p>}
        <div class="modal-actions">
          <button class="btn btn-sm" type="button" disabled={loading} onClick={() => void connectMeeting(false)}>
            {loading ? 'Sparar...' : 'Nej, ignorera händelser'}
          </button>
          <button class="btn btn-sm btn-primary" type="button" disabled={loading} onClick={() => void connectMeeting(true)}>
            {loading ? 'Sparar...' : 'Ja, spela ut händelser'}
          </button>
        </div>
      </Modal>
    )
  }

  return (
    <Modal title="Meeting kopplat" onClose={onClose}>
      <p>{selectedMeeting?.title} är kopplat till projektet.</p>
      <p>{createdAgendaName ?? 'En ny redaktionell agenda'} skapades med {topics.length} punkter.</p>
      <div class="modal-actions">
        <button class="btn btn-sm btn-primary" type="button" onClick={onClose}>Klart</button>
      </div>
    </Modal>
  )
}
