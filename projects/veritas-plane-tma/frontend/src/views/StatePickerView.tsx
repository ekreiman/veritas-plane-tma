// View 4: state picker. Single-select, immediate PATCH on tap (no
// separate "confirm" step needed for a single choice — matches how
// Plane's own web UI state dropdown behaves). No optimistic UI: PATCH,
// then pop back to detail, which re-fetches fresh state on mount.

import { useState } from 'react';
import { updateIssue } from '../api/plane';
import { getStates } from '../api/states';
import { CONTENT_FACTORY_PROJECT_ID } from '../config';
import { ErrorState } from '../components/ViewStates';
import { haptic, hapticNotify } from '../telegram/useTelegramButtons';

interface StatePickerViewProps {
  issueId: string;
  currentStateId: string;
  onDone: () => void;
}

export function StatePickerView({ issueId, currentStateId, onDone }: StatePickerViewProps) {
  const [pendingId, setPendingId] = useState<string | null>(null);
  const [error, setError] = useState<unknown>(null);
  const states = getStates(CONTENT_FACTORY_PROJECT_ID);

  async function selectState(stateId: string) {
    if (stateId === currentStateId || pendingId) return;
    setPendingId(stateId);
    setError(null);
    haptic('medium');
    try {
      await updateIssue(CONTENT_FACTORY_PROJECT_ID, issueId, { state: stateId });
      hapticNotify('success');
      onDone();
    } catch (e) {
      setError(e);
      hapticNotify('error');
      setPendingId(null);
    }
  }

  return (
    <div className="flex h-full flex-col p-4">
      <h1 className="mb-3 text-lg font-semibold text-tg-text">Change state</h1>
      {error ? <ErrorState error={error} /> : null}
      <ul className="flex flex-col gap-2">
        {states.map((state) => {
          const isCurrent = state.id === currentStateId;
          const isPending = state.id === pendingId;
          return (
            <li key={state.id}>
              <button
                type="button"
                disabled={pendingId !== null}
                onClick={() => selectState(state.id)}
                className="flex min-h-[44px] w-full items-center gap-3 rounded-lg bg-tg-secondary-bg px-4 py-3 text-left disabled:opacity-60"
              >
                <span
                  className="h-2.5 w-2.5 rounded-full"
                  style={{ backgroundColor: state.color }}
                />
                <span className="flex-1 text-sm text-tg-text">{state.name}</span>
                {isPending ? (
                  <span className="text-xs text-tg-hint">Saving…</span>
                ) : isCurrent ? (
                  <span className="text-tg-link">✓</span>
                ) : null}
              </button>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
