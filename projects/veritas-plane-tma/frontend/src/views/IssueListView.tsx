// View 1: issue list. Poll on mount + pull-to-refresh (Telegram
// viewport supports native pull-to-refresh gesture already — we just
// need the refetch to be idempotent and re-run on visibility, which the
// simple "refetch on mount" + manual refresh button below covers for
// v1; a native swipe-refresh gesture binding is a nice-to-have, not
// blocking).

import { useCallback, useEffect, useState } from 'react';
import { listIssues, listLabels } from '../api/plane';
import { getStates } from '../api/states';
import { CONTENT_FACTORY_PROJECT_ID } from '../config';
import type { PlaneIssue, PlaneLabel } from '../api/types';
import { EmptyState, ErrorState, LoadingState } from '../components/ViewStates';
import { StateBadge } from '../components/StateBadge';
import { LabelChip } from '../components/LabelChip';
import { haptic } from '../telegram/useTelegramButtons';

interface IssueListViewProps {
  onOpenIssue: (issueId: string) => void;
}

export function IssueListView({ onOpenIssue }: IssueListViewProps) {
  const [issues, setIssues] = useState<PlaneIssue[] | null>(null);
  const [labels, setLabels] = useState<PlaneLabel[]>([]);
  const [error, setError] = useState<unknown>(null);
  const [refreshing, setRefreshing] = useState(false);

  const states = getStates(CONTENT_FACTORY_PROJECT_ID);

  const load = useCallback(async () => {
    setError(null);
    try {
      const [issuesResult, labelsResult] = await Promise.all([
        listIssues(CONTENT_FACTORY_PROJECT_ID),
        listLabels(CONTENT_FACTORY_PROJECT_ID),
      ]);
      setIssues(issuesResult);
      setLabels(labelsResult);
    } catch (e) {
      setError(e);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  async function handleRefresh() {
    setRefreshing(true);
    haptic('light');
    await load();
    setRefreshing(false);
  }

  if (issues === null && !error) {
    return <LoadingState label="Loading issues…" />;
  }

  if (error && issues === null) {
    return <ErrorState error={error} onRetry={load} />;
  }

  return (
    <div className="flex h-full flex-col">
      <header className="flex items-center justify-between border-b border-tg-secondary-bg px-4 py-3">
        <h1 className="text-lg font-semibold text-tg-text">Content Factory</h1>
        <button
          type="button"
          onClick={handleRefresh}
          disabled={refreshing}
          className="min-h-[44px] min-w-[44px] rounded-full text-tg-link disabled:opacity-50"
          aria-label="Refresh issues"
        >
          {refreshing ? '⋯' : '↻'}
        </button>
      </header>

      {issues && issues.length === 0 ? (
        <EmptyState message="No issues in Content Factory yet." />
      ) : (
        <ul className="flex-1 divide-y divide-tg-secondary-bg overflow-y-auto">
          {issues?.map((issue) => (
            <li key={issue.id}>
              <button
                type="button"
                onClick={() => {
                  haptic('light');
                  onOpenIssue(issue.id);
                }}
                className="flex min-h-[44px] w-full flex-col gap-1.5 px-4 py-3 text-left active:bg-tg-secondary-bg"
              >
                <div className="flex items-start justify-between gap-2">
                  <span className="text-sm font-medium text-tg-text">{issue.name}</span>
                  <span className="whitespace-nowrap text-xs text-tg-hint">
                    VER-{issue.sequence_id}
                  </span>
                </div>
                <div className="flex flex-wrap items-center gap-1.5">
                  <StateBadge stateId={issue.state} states={states} />
                  {issue.labels.map((labelId) => (
                    <LabelChip key={labelId} labelId={labelId} labels={labels} />
                  ))}
                </div>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
