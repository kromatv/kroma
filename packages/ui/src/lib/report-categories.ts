// The five things a viewer can report about a title, in display order.
//
// One list, because a report reaches the same triage queue whichever surface it
// was sent from (a detail page, the player's settings panel) and a category the
// user picked as "Problème vidéo" in one place must not be "Image" in another.
// Labels stay message keys: this is data, translated where it is rendered.

import type { MessageKey, ReportCategory } from '@kroma/core';
import type { IconName } from './glyph';

export interface ReportCategoryMeta {
  key: ReportCategory;
  labelKey: MessageKey;
  hintKey: MessageKey;
  icon: IconName;
}

export const REPORT_CATEGORIES: readonly ReportCategoryMeta[] = [
  {
    key: 'metadata',
    labelKey: 'report.category.metadata',
    hintKey: 'report.category.metadataHint',
    icon: 'info-circle',
  },
  {
    key: 'video',
    labelKey: 'report.category.video',
    hintKey: 'report.category.videoHint',
    icon: 'video',
  },
  {
    key: 'audio',
    labelKey: 'report.category.audio',
    hintKey: 'report.category.audioHint',
    icon: 'volume',
  },
  {
    key: 'subtitles',
    labelKey: 'report.category.subtitles',
    hintKey: 'report.category.subtitlesHint',
    icon: 'message',
  },
  {
    key: 'other',
    labelKey: 'report.category.other',
    hintKey: 'report.category.otherHint',
    icon: 'dots-circle-horizontal',
  },
];
