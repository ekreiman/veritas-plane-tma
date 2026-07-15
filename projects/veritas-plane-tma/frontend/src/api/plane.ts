// Typed wrappers over the frozen 6-endpoint Plane-proxy contract
// (TLV-2680 backend/app/main.py). One function per endpoint, no more —
// keep this file a 1:1 mirror of the backend contract table in the
// dispatch so drift is easy to spot in review.

import { api } from './client';
import type { PlaneComment, PlaneIssue, PlaneLabel, UpdateIssueBody } from './types';

export function listIssues(projectId: string): Promise<PlaneIssue[]> {
  return api.get<PlaneIssue[]>(`/api/projects/${projectId}/issues`);
}

export function getIssue(projectId: string, issueId: string): Promise<PlaneIssue> {
  return api.get<PlaneIssue>(`/api/projects/${projectId}/issues/${issueId}`);
}

export function listIssueComments(projectId: string, issueId: string): Promise<PlaneComment[]> {
  return api.get<PlaneComment[]>(`/api/projects/${projectId}/issues/${issueId}/comments`);
}

export function createIssueComment(
  projectId: string,
  issueId: string,
  commentHtml: string,
): Promise<PlaneComment> {
  return api.post<PlaneComment>(`/api/projects/${projectId}/issues/${issueId}/comments`, {
    comment_html: commentHtml,
  });
}

export function updateIssue(
  projectId: string,
  issueId: string,
  body: UpdateIssueBody,
): Promise<PlaneIssue> {
  return api.patch<PlaneIssue>(`/api/projects/${projectId}/issues/${issueId}`, body);
}

export function listLabels(projectId: string): Promise<PlaneLabel[]> {
  return api.get<PlaneLabel[]>(`/api/projects/${projectId}/labels`);
}
