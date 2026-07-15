// View 2: issue detail + comments thread. MainButton = "Add comment"
// (primary action per view, per Leo's convention). Tapping the state
// badge or label chips opens the respective picker — no separate
// buttons needed, keeps the view uncluttered.

import { useCallback, useEffect, useState } from 'react';
import { getIssue, listIssueComments, listLabels } from '../api/plane';
import { getStates } from '../api/states';
import { CONTENT_FACTORY_PROJECT_ID } from '../config';
import type { PlaneComment, PlaneIssue, PlaneLabel } from '../api/types';
import { EmptyState, ErrorState, LoadingState } from '../components/ViewStates';
import { StateBadge } from '../components/StateBadge';
import { LabelChip } from '../components/LabelChip';
import { SafeHtml } from '../components/SafeHtml';
import { haptic, useMainButton } from '../telegram/useTelegramButtons';

interface IssueDetailViewProps {
  issueId: string;
  onComposeComment: () => void;
  onEditState: () => void;
  onEditLabels: () => void;
  onIssueLoaded: (issue: PlaneIssue) => void;
}

export function IssueDetailView({
  issueId,
  onComposeComment,
  onEditState,
  onEditLabels,
  onIssueLoaded,
}: IssueDetailViewProps) {
  const [issue, setIssue] = useState<PlaneIssue | null>(null);
  const [comments, setComments] = useState<PlaneComment[] | null>(null);
  const [labels, setLabels] = useState<PlaneLabel[]>([]);
  const [error, setError] = useState<unknown>(null);

  const states = getStates(CONTENT_FACTORY_PROJECT_ID);

  const load = useCallback(async () => {
    setError(null);
    try {
      const [issueResult, commentsResult, labelsResult] = await Promise.all([
        getIssue(CONTENT_FACTORY_PROJECT_ID, issueId),
        listIssueComments(CONTENT_FACTORY_PROJECT_ID, issueId),
        listLabels(CONTENT_FACTORY_PROJECT_ID),
      ]);
      setIssue(issueResult);
      onIssueLoaded(issueResult);
      setComments(commentsResult);
      setLabels(labelsResult);
    } catch (e) {
      setError(e);
    }
  }, [issueId, onIssueLoaded]);

  useEffect(() => {
    load();
  }, [load]);

  useMainButton({
    visible: issue !== null,
    text: 'Add comment',
    onClick: () => {
      haptic('light');
      onComposeComment();
    },
  });

  if (issue === null && !error) {
    return <LoadingState label="Loading issue…" />;
  }

  if (error && issue === null) {
    return <ErrorState error={error} onRetry={load} />;
  }

  if (!issue) return null;

  return (
    <div className="flex h-full flex-col overflow-y-auto pb-20">
      <header className="border-b border-tg-secondary-bg px-4 py-3">
        <p className="text-xs text-tg-hint">VER-{issue.sequence_id}</p>
        <h1 className="mt-1 text-lg font-semibold text-tg-text">{issue.name}</h1>
        <div className="mt-2 flex flex-wrap items-center gap-1.5">
          <button
            type="button"
            onClick={() => {
              haptic('light');
              onEditState();
            }}
            className="min-h-[32px]"
          >
            <StateBadge stateId={issue.state} states={states} />
          </button>
          {issue.labels.map((labelId) => (
            <LabelChip key={labelId} labelId={labelId} labels={labels} />
          ))}          <button
            type="button"
            onClick={() => {
              haptic('light');
              onEditLabels();
            }}
            className="min-h-[32px] rounded-full bg-tg-secondary-bg px-2 py-0.5 text-xs font-medium text-tg-hint"
          >
            {issue.labels.length === 0 ? '+ Add labels' : 'Edit labels'}
          </button>
        </div>
      </header>

      {issue.description_html && (
        <div className="border-b border-tg-secondary-bg px-4 py-3">
          <SafeHtml html={issue.description_html} className="prose-sm text-sm text-tg-text" />
        </div>
      )}

      <div className="flex-1 px-4 py-3">
        <h2 className="mb-2 text-sm font-semibold text-tg-hint">Comments</h2>
        {comments === null ? (
          <LoadingState label="Loading comments…" />
        ) : comments.length === 0 ? (
          <EmptyState message="No comments yet." />
        ) : (
          <ul className="flex flex-col gap-3">
            {comments.map((comment) => (
              <li key={comment.id} className="rounded-lg bg-tg-secondary-bg p-3">
                <SafeHtml html={comment.comment_html} className="text-sm text-tg-text" />
                {comment.created_at && (
                  <p className="mt-1 text-xs text-tg-hint">
                    {new Date(comment.created_at).toLocaleString()}
                  </p>
                )}
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
