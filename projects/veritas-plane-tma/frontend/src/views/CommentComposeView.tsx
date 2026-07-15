// View 3: comment composer. Plain text only per ARCHITECTURE.md §6
// non-goal ("no full rich-text editor... plain text or minimal
// formatting only") — a <textarea>, wrapped in a single <p> on submit.
// No optimistic UI (dispatch: "after PATCH/POST, re-fetch and show
// fresh state") — on success we just pop back to detail, which re-fetches
// on mount.

import { useState } from 'react';
import { createIssueComment } from '../api/plane';
import { CONTENT_FACTORY_PROJECT_ID } from '../config';
import { ErrorState } from '../components/ViewStates';
import { haptic, hapticNotify, useMainButton } from '../telegram/useTelegramButtons';

interface CommentComposeViewProps {
  issueId: string;
  onDone: () => void;
}

function escapeHtml(text: string): string {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

export function CommentComposeView({ issueId, onDone }: CommentComposeViewProps) {
  const [text, setText] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<unknown>(null);

  const canSubmit = text.trim().length > 0 && !submitting;

  async function submit() {
    if (!canSubmit) return;
    setSubmitting(true);
    setError(null);
    try {
      const html = `<p>${escapeHtml(text.trim())}</p>`;
      await createIssueComment(CONTENT_FACTORY_PROJECT_ID, issueId, html);
      hapticNotify('success');
      onDone();
    } catch (e) {
      setError(e);
      hapticNotify('error');
      setSubmitting(false);
    }
  }

  useMainButton({
    visible: true,
    text: submitting ? 'Posting…' : 'Post comment',
    onClick: () => {
      haptic('medium');
      submit();
    },
    loading: submitting,
    active: canSubmit,
  });

  return (
    <div className="flex h-full flex-col p-4">
      <h1 className="mb-3 text-lg font-semibold text-tg-text">Add comment</h1>
      <textarea
        autoFocus
        value={text}
        onChange={(e) => setText(e.target.value)}
        placeholder="Write a comment…"
        rows={8}
        className="w-full flex-1 resize-none rounded-lg border border-tg-secondary-bg bg-tg-bg p-3 text-sm text-tg-text outline-none"
      />
      {error ? <ErrorState error={error} onRetry={submit} /> : null}
    </div>
  );
}
