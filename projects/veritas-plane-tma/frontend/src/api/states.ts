// INTERIM: the frozen 6-endpoint contract has no GET .../states/ proxy
// (issue objects only carry the *current* state UUID, not the workflow's
// full option list — an issue in "Backlog" never surfaces "Cancelled").
// Fast-follow TLV-2684 (filed by Werner, assigned to Axel) adds a thin
// `/api/projects/{project_id}/states` proxy mirroring the existing
// `/labels` pattern. Until then this is a static map of the Content
// Factory project's real states, values confirmed live against Plane's
// `/states/` endpoint 2026-07-14 (matches memory/plane-setup.md state
// ids). getStates() is the single swap point — once TLV-2684 ships,
// replace the body with an `api.get()` call; every caller already
// takes `states: PlaneState[]` as a prop/param, so no other file
// changes.
//
// TLV-2684 pending — swap this to a fetch call once the endpoint lands:
//   const states = await api.get<PlaneState[]>(`/api/projects/${projectId}/states`);
//
// Risk: if a workflow state is added/renamed/removed in Plane's UI
// without updating this list, the picker goes stale until TLV-2684
// ships. Acceptable for v1's known, stable, single-project scope —
// revisit if that stops being true.

import type { PlaneState } from './types';
import { CONTENT_FACTORY_PROJECT_ID } from '../config';

const CONTENT_FACTORY_STATES: PlaneState[] = [
  { id: '16dc17d8-1c2d-4850-8af6-1ab0c945b679', name: 'Backlog', color: '#60646C', group: 'backlog' },
  { id: 'df53efab-9695-4f3d-b341-4d2026835cba', name: 'Todo', color: '#60646C', group: 'unstarted' },
  { id: 'ea1933d7-070f-4fa6-b296-ff5658706e9d', name: 'In Progress', color: '#F59E0B', group: 'started' },
  { id: 'ca9cc4c8-8890-48ac-b718-3b66a8441891', name: 'Done', color: '#46A758', group: 'completed' },
  { id: '3489e0f8-3c70-4000-af59-7425ec325b76', name: 'Cancelled', color: '#9AA4BC', group: 'cancelled' },
];

export function getStates(projectId: string): PlaneState[] {
  if (projectId === CONTENT_FACTORY_PROJECT_ID) return CONTENT_FACTORY_STATES;
  // Unknown project (shouldn't happen in v1's single-project scope) —
  // return empty rather than guessing so the UI shows "Unknown" badges
  // instead of wrong ones.
  return [];
}
