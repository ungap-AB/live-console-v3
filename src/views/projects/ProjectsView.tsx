import { useEffect, useState } from 'preact/hooks'
import { client } from '../../data'
import type { CueKind, Project, Visibility } from '../../data/types'
import { useResource } from '../../app/useResource'
import { SplitPane } from '../../components/SplitPane'
import { StatusChip } from '../../components/StatusChip'
import { RenameModal } from '../../components/RenameModal'
import { Toast } from '../../components/Toast'
import { SearchIcon } from '../../components/icons'
import { ProjectDetail } from './ProjectDetail'
import { Playout } from './Playout'
import type { ProjectActions } from './actions'
import './ProjectsView.css'

export type ProjectScreen = 'detail' | 'playout'

interface ProjectsViewProps {
  selectedId: string | null
  onSelectedIdChange: (id: string | null) => void
  screen: ProjectScreen
  onScreenChange: (screen: ProjectScreen) => void
}

export function ProjectsView({ selectedId, onSelectedIdChange, screen, onScreenChange }: ProjectsViewProps) {
  const resource = useResource(() => client.projects.list(), [])
  const [projects, setProjects] = useState<Project[]>([])
  const [query, setQuery] = useState('')
  const [toast, setToast] = useState<string | null>(null)
  const [creating, setCreating] = useState(false)

  useEffect(() => {
    if (resource.data) setProjects(resource.data)
  }, [resource.data])

  useEffect(() => {
    if (!selectedId && projects.length > 0) onSelectedIdChange(projects[0].id)
  }, [projects, selectedId])

  const selected = projects.find((p) => p.id === selectedId) ?? null

  function replace(next: Project) {
    setProjects((prev) => prev.map((p) => (p.id === next.id ? next : p)))
  }

  async function withErrorToast(fn: () => Promise<void>) {
    try {
      await fn()
    } catch (err) {
      setToast(err instanceof Error ? err.message : 'Något gick fel.')
    }
  }

  async function createProject(name: string) {
    const created = await client.projects.create({ name })
    setProjects((prev) => [created, ...prev])
    onSelectedIdChange(created.id)
    onScreenChange('detail')
    setCreating(false)
  }

  const actions: ProjectActions = {
    setVisibility: (visibility: Visibility) =>
      withErrorToast(async () => {
        if (!selected) return
        replace(await client.projects.setVisibility(selected.id, visibility))
      }),
    setAgenda: (agendaId: string | null) =>
      withErrorToast(async () => {
        if (!selected) return
        replace(await client.projects.setAgenda(selected.id, agendaId))
      }),
    setNameList: (namelistId: string | null) =>
      withErrorToast(async () => {
        if (!selected) return
        replace(await client.projects.setNameList(selected.id, namelistId))
      }),
    createChannel: () =>
      withErrorToast(async () => {
        if (!selected) return
        replace(await client.projects.createChannel(selected.id))
      }),
    teardownChannel: () =>
      withErrorToast(async () => {
        if (!selected) return
        replace(await client.projects.teardownChannel(selected.id))
      }),
    setEncoderSending: (sending: boolean) =>
      withErrorToast(async () => {
        if (!selected) return
        replace(await client.projects.setEncoderSending(selected.id, sending))
      }),
    trim: () =>
      withErrorToast(async () => {
        if (!selected) return
        replace(await client.projects.trim(selected.id))
      }),
    createReviewLink: () =>
      withErrorToast(async () => {
        if (!selected) return
        replace(await client.projects.createReviewLink(selected.id))
      }),
    publish: () =>
      withErrorToast(async () => {
        if (!selected) return
        replace(await client.projects.publish(selected.id))
      }),
    cue: (kind: CueKind, refId: string, label: string) =>
      withErrorToast(async () => {
        if (!selected) return
        await client.projects.cue(selected.id, kind, refId, label)
        const fresh = await client.projects.get(selected.id)
        if (fresh) replace(fresh)
      }),
    reset: () =>
      withErrorToast(async () => {
        if (!selected) return
        replace(await client.projects.resetSimulation(selected.id))
      }),
  }

  const q = query.trim().toLowerCase()
  const visible = projects.filter((p) => !q || p.name.toLowerCase().includes(q))

  return (
    <div class="view">
      <header>
        <div>
          <h1>Projekt</h1>
          <div class="sub">Möten, live-sändning och ondemand-publicering</div>
        </div>
      </header>

      <div class="content">
        <SplitPane
          listLabel="Projekt"
          detailLabel="Valt projekt"
          list={
            <>
              <div class="top">
                <div class="search">
                  <SearchIcon />
                  <input
                    type="search"
                    placeholder="Sök projekt"
                    aria-label="Sök projekt"
                    value={query}
                    onInput={(e) => setQuery(e.currentTarget.value)}
                  />
                </div>
                <button class="btn btn-sm" type="button" onClick={() => setCreating(true)}>
                  Nytt projekt
                </button>
              </div>
              <ul>
                {resource.loading && projects.length === 0 && <li class="none">Laddar…</li>}
                {!resource.loading && visible.length === 0 && (
                  <li class="none">Inget projekt matchar sökningen.</li>
                )}
                {visible.map((p) => (
                  <li key={p.id} class={p.id === selectedId ? 'sel' : ''}>
                    <button
                      class="row"
                      type="button"
                      onClick={() => {
                        onSelectedIdChange(p.id)
                        onScreenChange('detail')
                      }}
                    >
                      <span class="rowtop">
                        <span class="nm">{p.name}</span>
                      </span>
                      <span class="meta-row">
                        {p.channel?.state === 'live' && (
                          <StatusChip tone="live" dot>
                            Sänder
                          </StatusChip>
                        )}
                        {p.publication.state === 'published' && (
                          <StatusChip tone="accent">Publicerad</StatusChip>
                        )}
                        <StatusChip tone={p.visibility === 'open' ? 'neutral' : 'warn'}>
                          {p.visibility === 'open' ? 'Öppen' : 'Stängd'}
                        </StatusChip>
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            </>
          }
          detail={
            !selected ? (
              <div class="docnone">Välj ett projekt i listan.</div>
            ) : screen === 'playout' ? (
              <Playout project={selected} onClose={() => onScreenChange('detail')} actions={actions} />
            ) : (
              <ProjectDetail
                project={selected}
                onOpenPlayout={() => onScreenChange('playout')}
                actions={actions}
              />
            )
          }
        />
      </div>

      {creating && (
        <RenameModal
          title="Nytt projekt"
          initialValue=""
          onCancel={() => setCreating(false)}
          onSave={createProject}
        />
      )}

      {toast && <Toast message={toast} onDismiss={() => setToast(null)} />}
    </div>
  )
}
