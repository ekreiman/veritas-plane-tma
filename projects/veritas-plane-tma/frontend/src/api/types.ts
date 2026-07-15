// Types for the Plane-proxy API surface (TLV-2680, frozen 6-endpoint
// contract). Plane's actual issue/comment/label objects carry many more
// fields than we use — these interfaces cover what the TMA views need
// plus an index signature so unused fields pass through untyped rather
// than being stripped.

export type PlanePriority = 'urgent' | 'high' | 'medium' | 'low' | 'none';

export interface PlaneLabel {
  id: string;
  name: string;
  color: string;
  [key: string]: unknown;
}

// Verified live against plane.techlevity.co.uk (2026-07-14): `state` and
// `labels` on the issue object are bare UUID strings, NOT expanded
// objects — Plane's `expand` query param would nest state_detail/
// label_details, but the frozen 6-endpoint contract doesn't add it.
// This is exactly why the state picker needs an interim derivation (see
// components/StatePicker.tsx) rather than reading a name off the issue.
export interface PlaneIssue {
  id: string;
  name: string;
  description_html?: string;
  /** Plane state UUID — resolve display name via a `PlaneState[]` list. */
  state: string;
  priority: PlanePriority | null;
  sequence_id: number;
  /** Label UUIDs — resolve display name/color via listLabels(). */
  labels: string[];
  assignees?: string[];
  created_at?: string;
  updated_at?: string;
  [key: string]: unknown;
}

export interface PlaneComment {
  id: string;
  comment_html: string;
  actor?: string;
  created_at?: string;
  [key: string]: unknown;
}

// Not part of the frozen 6-endpoint contract — no GET .../states/ proxy
// exists yet (TLV-2681 gap, fast-follow ticket pending from Leo/Werner).
// This shape mirrors Plane's real /states/ response (verified live) so
// the interim derivation in StatePicker.tsx and the eventual real fetch
// can share one type.
export interface PlaneState {
  id: string;
  name: string;
  color: string;
  group: 'backlog' | 'unstarted' | 'started' | 'completed' | 'cancelled';
  [key: string]: unknown;
}

export interface TelegramLoginResponse {
  session_token: string;
  display_name: string;
  expires_in_seconds: number;
}

export interface UpdateIssueBody {
  state?: string;
  labels?: string[];
}
