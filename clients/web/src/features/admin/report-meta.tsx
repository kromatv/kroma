// Shared display metadata for problem reports: per-category and per-status label
// keys + accent colours, used by the admin queue and its drawer (kept here so
// neither file imports the other).

import type { MessageKey, ReportCategory, ReportStatus, ReportSubjectKind } from '@kroma/core';
import { color } from '@kroma/ui/kit';

export interface Meta {
  labelKey: MessageKey;
  color: string;
}

const CATEGORY: Record<ReportCategory, Meta> = {
  metadata: { labelKey: 'report.category.metadata', color: color('info') },
  video: { labelKey: 'report.category.video', color: color('accent') },
  audio: { labelKey: 'report.category.audio', color: color('success') },
  subtitles: { labelKey: 'report.category.subtitles', color: color('hdr') },
  other: { labelKey: 'report.category.other', color: color('glyph') },
};

const STATUS: Record<ReportStatus, Meta> = {
  open: { labelKey: 'reports.status.open', color: color('accent') },
  resolved: { labelKey: 'reports.status.resolved', color: color('success') },
  dismissed: { labelKey: 'reports.status.dismissed', color: color('glyph') },
};

const KIND: Record<ReportSubjectKind, MessageKey> = {
  movie: 'reports.kind.movie',
  show: 'reports.kind.show',
  episode: 'reports.kind.episode',
};

export function categoryMeta(c: ReportCategory): Meta {
  return CATEGORY[c] ?? CATEGORY.other;
}

export function statusMeta(s: ReportStatus): Meta {
  return STATUS[s] ?? STATUS.open;
}

export function kindLabelKey(k: ReportSubjectKind): MessageKey {
  return KIND[k] ?? KIND.movie;
}

/** The wash a report chip sits on: its own colour at 13%. */
export function soft(tone: string): string {
  return `color-mix(in srgb, ${tone} 13%, transparent)`;
}
