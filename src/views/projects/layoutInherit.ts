import { i18n } from '@lingui/core'
import type { MessageDescriptor } from '@lingui/core'
import { msg, t } from '@lingui/core/macro'
import type { Project } from '../../data/types.ts'

// UNG-180: the player's layout as a value object in the console too. The field list is kept in step with the server's `PlayerLayout`
// (Models/Projects/PlayerLayout.cs): a new layout attribute is added to both, and the test catches the list and the type drifting apart.

export type LayoutKey = 'beforeText' | 'liveText' | 'afterText' | 'ondemandText' | 'textPlacement' | 'muxEnabled' | 'muxRespectDoNotTrack' | 'posterUrl'

export const LAYOUT_FIELDS: { key: LayoutKey; label: MessageDescriptor }[] = [
  { key: 'beforeText', label: msg`Text before the broadcast (Before)` },
  { key: 'liveText', label: msg`Text during the live broadcast (Live)` },
  { key: 'afterText', label: msg`Text after the broadcast (After)` },
  { key: 'ondemandText', label: msg`Text for the recording (Ondemand)` },
  { key: 'textPlacement', label: msg`Text placement` },
  { key: 'muxEnabled', label: msg`Playback measurement (Mux)` },
  { key: 'muxRespectDoNotTrack', label: msg`Respect Do Not Track` },
  // The poster image is copied as a file on the server; here we only compare whether the projects have an image (the addresses always differ).
  { key: 'posterUrl', label: msg`Poster image` },
]

export type LayoutFields = Pick<Project, Exclude<LayoutKey, 'posterUrl'>> & { posterUrl?: string | null }

export function layoutOf(project: LayoutFields): LayoutFields {
  return {
    beforeText: project.beforeText,
    liveText: project.liveText,
    afterText: project.afterText,
    ondemandText: project.ondemandText,
    textPlacement: project.textPlacement,
    muxEnabled: project.muxEnabled,
    muxRespectDoNotTrack: project.muxRespectDoNotTrack,
    posterUrl: project.posterUrl ?? null,
  }
}

export interface LayoutSourceOption {
  id: string
  name: string
  label: string
}

/**
 * The projects to start from (UNG-287): the most recently created project first, then the templates by name. Other projects are offered only
 * with allProjects (Get layout in an existing project), so the list in New project does not grow with the number of projects. The project that
 * is to receive the layout (if any) is left out.
 */
function latestLabel(name: string, isTemplate: boolean): string {
  return isTemplate ? t`Latest project: ${name} (template)` : t`Latest project: ${name}`
}

function templateLabel(name: string): string {
  return t`Template: ${name}`
}

export function layoutSourceOptions(
  projects: readonly Pick<Project, 'id' | 'name' | 'createdAt' | 'isLayoutTemplate'>[],
  excludeId?: string,
  allProjects = false,
): LayoutSourceOption[] {
  const candidates = [...projects.filter((project) => project.id !== excludeId)].sort((left, right) => Date.parse(right.createdAt) - Date.parse(left.createdAt))
  const latest = candidates[0]
  const templates = candidates
    .filter((project) => project.isLayoutTemplate && project.id !== latest?.id)
    .sort((left, right) => left.name.localeCompare(right.name, i18n.locales))
  return [
    ...(latest ? [{ id: latest.id, name: latest.name, label: latestLabel(latest.name, Boolean(latest.isLayoutTemplate)) }] : []),
    ...templates.map((project) => ({ id: project.id, name: project.name, label: templateLabel(project.name) })),
    ...(allProjects ? candidates.filter((project) => project.id !== latest?.id && !project.isLayoutTemplate).map((project) => ({ id: project.id, name: project.name, label: project.name })) : []),
  ]
}

/** Default: the most recently created project. If there is no project to start from, the answer is null. */
export function defaultLayoutSource(options: readonly LayoutSourceOption[]): string | null {
  return options[0]?.id ?? null
}

const PLACEMENT_LABEL: Record<Project['textPlacement'], MessageDescriptor> = { top: msg`Top edge`, middle: msg`Middle`, bottom: msg`Bottom edge` }

/** A field's value as text in the confirmation: empty text shows as "(empty)", long texts are shortened. */
export function describeLayoutValue(key: LayoutKey, value: LayoutFields[LayoutKey]): string {
  if (key === 'textPlacement') {
    const label = PLACEMENT_LABEL[value as Project['textPlacement']]
    return label ? i18n._(label) : String(value)
  }
  if (key === 'muxEnabled' || key === 'muxRespectDoNotTrack') return value ? t`On` : t`Off`
  if (key === 'posterUrl') return value ? t`Image` : t`No image`
  const text = String(value ?? '').trim()
  if (text === '') return t`(empty)`
  return text.length > 70 ? `${text.slice(0, 70)}…` : text
}

export interface LayoutChange {
  key: LayoutKey
  label: string
  from: string
  to: string
}

/** What is replaced when the layout is fetched: only the fields that differ, with old and new value. */
export function layoutDiff(current: LayoutFields, source: LayoutFields): LayoutChange[] {
  // The poster image is a file that is copied: it is replaced as soon as either has an image, even if both do (the addresses always differ).
  const differs = (key: LayoutKey) => (key === 'posterUrl' ? Boolean(current.posterUrl) || Boolean(source.posterUrl) : current[key] !== source[key])
  return LAYOUT_FIELDS.filter((field) => differs(field.key)).map((field) => ({
    key: field.key,
    label: i18n._(field.label),
    from: describeLayoutValue(field.key, current[field.key]),
    to: describeLayoutValue(field.key, source[field.key]),
  }))
}
