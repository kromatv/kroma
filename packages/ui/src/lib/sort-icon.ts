import type { SortMode } from '@kroma/core';
import type { IconName } from '#ui/lib/glyph';

/** The glyph for a catalogue sort, so the same order reads the same on the web,
 *  on a phone and across a room. */
export const SORT_ICON: Record<SortMode, IconName> = {
  added: 'history',
  release: 'calendar',
  title: 'sort-ascending-letters',
  rating: 'star',
};
