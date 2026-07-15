// View 5: label picker, multi-select. Unlike the state picker, this
// batches all changes behind MainButton ("Save") rather than PATCHing
// per-tap — multi-select naturally wants a confirm step so a user can
// toggle several labels before committing one PATCH call.

import { useEffect, useState } from 'react';
import { listLabels, updateIssue } from '../api/plane';
import { CONTENT_FACTORY_PROJECT_ID } from '../config';
import type { PlaneLabel } from '../api/types';
import { ErrorState, LoadingState } from '../components/ViewStates';
import { haptic, hapticNotify, useMainButton } from '../telegram/useTelegramButtons';

interface LabelPickerViewProps {
  issueId: string;
  currentLabelIds: string[];
  onDone: () => void;
}

export function LabelPickerView({ issueId, currentLabelIds, onDone }: LabelPickerViewProps) {
  const [labels, setLabels] = useState<PlaneLabel[] | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set(currentLabelIds));
  const [error, setError] = useState<unknown>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    listLabels(CONTENT_FACTORY_PROJECT_ID)
      .then(setLabels)
      .catch((e) => setError(e));
  }, []);

  function toggle(labelId: string) {
    haptic('light');
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(labelId)) next.delete(labelId);
      else next.add(labelId);
      return next;
    });
  }

  async function save() {
    setSaving(true);
    setError(null);
    try {
      await updateIssue(CONTENT_FACTORY_PROJECT_ID, issueId, { labels: Array.from(selected) });
      hapticNotify('success');
      onDone();
    } catch (e) {
      setError(e);
      hapticNotify('error');
      setSaving(false);
    }
  }

  useMainButton({
    visible: labels !== null,
    text: saving ? 'Saving…' : 'Save',
    onClick: save,
    loading: saving,
    active: !saving,
  });

  if (labels === null && !error) {
    return <LoadingState label="Loading labels…" />;
  }

  if (error && labels === null) {
    return <ErrorState error={error} />;
  }

  return (
    <div className="flex h-full flex-col p-4">
      <h1 className="mb-3 text-lg font-semibold text-tg-text">Edit labels</h1>
      {error ? <ErrorState error={error} /> : null}
      <ul className="flex flex-col gap-2">
        {labels?.map((label) => {
          const isSelected = selected.has(label.id);
          return (
            <li key={label.id}>
              <button
                type="button"
                onClick={() => toggle(label.id)}
                className="flex min-h-[44px] w-full items-center gap-3 rounded-lg bg-tg-secondary-bg px-4 py-3 text-left"
              >
                <span
                  className="h-2.5 w-2.5 rounded-full"
                  style={{ backgroundColor: label.color }}
                />
                <span className="flex-1 text-sm text-tg-text">{label.name}</span>
                {isSelected && <span className="text-tg-link">✓</span>}
              </button>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
