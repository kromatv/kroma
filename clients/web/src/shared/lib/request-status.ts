// Shared visual meta for request statuses: one color/label vocabulary for the
// chip on discover cards, detail pages, "Mes demandes" and the admin queue.
// Pure data (no JSX); labels resolve through i18n in the components.

import type { MessageKey, RequestStatus } from '@kroma/core';
import { color } from '@kroma/ui/kit';

export interface RequestStatusMeta {
  labelKey: MessageKey;
  color: string;
  bg: string;
  dot: string;
  pulse?: boolean;
}

export const REQUEST_STATUS_META: Record<RequestStatus, RequestStatusMeta> = {
  pending: {
    labelKey: 'requests.st.pending',
    color: color('text/70'),
    bg: color('white/7'),
    dot: color('text/45'),
  },
  approved: {
    labelKey: 'requests.st.approved',
    color: color('info'),
    bg: color('info/14'),
    dot: color('info'),
  },
  searching: {
    labelKey: 'requests.st.searching',
    color: color('info'),
    bg: color('info/14'),
    dot: color('info'),
    pulse: true,
  },
  downloading: {
    labelKey: 'requests.st.downloading',
    color: color('accent'),
    bg: color('accentWash/15'),
    dot: color('accent'),
    pulse: true,
  },
  importing: {
    labelKey: 'requests.st.importing',
    color: color('hdr'),
    bg: color('hdr/15'),
    dot: color('hdr'),
    pulse: true,
  },
  available: {
    labelKey: 'requests.st.available',
    color: color('success'),
    bg: color('success/13'),
    dot: color('success'),
  },
  partially_available: {
    labelKey: 'requests.st.partially_available',
    color: color('success'),
    bg: color('success/9'),
    dot: color('success/70'),
  },
  failed: {
    labelKey: 'requests.st.failed',
    color: color('danger'),
    bg: color('danger/13'),
    dot: color('danger'),
  },
  denied: {
    labelKey: 'requests.st.denied',
    color: color('danger'),
    bg: color('danger/9'),
    dot: color('danger/70'),
  },
};

export const requestStatusMeta = (s: RequestStatus): RequestStatusMeta =>
  REQUEST_STATUS_META[s] ?? REQUEST_STATUS_META.pending;

/** "S1, S3" / null for a whole-show or movie request. */
export function seasonsSummary(seasons: number[] | null | undefined): string | null {
  if (!seasons || seasons.length === 0) return null;
  return seasons.map((s) => `S${s}`).join(', ');
}
