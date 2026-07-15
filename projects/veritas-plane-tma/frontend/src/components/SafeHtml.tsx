// Plane's `description_html` / `comment_html` fields are trusted-author
// HTML (typed by Katya/Anna/Ed/Werner via Plane's own editor, proxied
// unmodified per ARCHITECTURE.md §6's "minimal formatting only" scope)
// but this still renders inside a WebView with real session tokens in
// memory — sanitize before dangerouslySetInnerHTML so a comment/issue
// body can never smuggle a <script> or event-handler payload. DOMPurify
// is the standard choice for this exact problem.

import DOMPurify from 'dompurify';
import { useMemo } from 'react';

interface SafeHtmlProps {
  html: string;
  className?: string;
}

export function SafeHtml({ html, className }: SafeHtmlProps) {
  const clean = useMemo(() => DOMPurify.sanitize(html), [html]);
  // eslint-disable-next-line react/no-danger -- content passed through DOMPurify above.
  return <div className={className} dangerouslySetInnerHTML={{ __html: clean }} />;
}
