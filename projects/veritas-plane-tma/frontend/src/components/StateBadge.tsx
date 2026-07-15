// Small colored pill for a Plane issue's state. Falls back to a neutral
// "Unknown" pill if the state id isn't in the currently-known list —
// possible in the interim (see StatePicker.tsx) if an issue's state was
// set by someone outside this app and hasn't been loaded into the
// derived list yet.

import type { PlaneState } from '../api/types';

interface StateBadgeProps {
  stateId: string;
  states: PlaneState[];
}

export function StateBadge({ stateId, states }: StateBadgeProps) {
  const state = states.find((s) => s.id === stateId);
  return (
    <span
      className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium"
      style={{
        backgroundColor: state ? `${state.color}22` : 'var(--tg-secondary-bg)',
        color: state?.color ?? 'var(--tg-hint)',
      }}
    >
      <span
        className="h-1.5 w-1.5 rounded-full"
        style={{ backgroundColor: state?.color ?? 'var(--tg-hint)' }}
      />
      {state?.name ?? 'Unknown'}
    </span>
  );
}
