// Etikett för en kopplad dagordning/namnlista i förberedelserutorna
// (BeforeWorkspace.tsx). Egna resurser visar sitt namn, Meeting-importerade
// visar "Kopplad till Meeting" i stället — sourceMeetingId är satt av
// live-server-v3 bara när resursen skapades automatiskt vid Meeting-koppling.
export function linkedResourceLabel(resource: { name: string; sourceMeetingId?: string | null } | undefined): string {
  if (resource?.sourceMeetingId) return 'Kopplad till Meeting'
  return resource?.name ?? 'Kopplad'
}
