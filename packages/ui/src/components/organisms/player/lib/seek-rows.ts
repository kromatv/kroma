import type { StyleProp, ViewStyle } from 'react-native';
import { clamp01 } from '#ui/components/organisms/player/lib/fmt';
import type { Chapter } from '#ui/components/organisms/player/types';

/** The spans of the runtime already on hand, in ms: what a progressive download
 * has fetched, or everything up to the buffered end when it names none. */
export function heldSpansMs(
  bufEnd: number | null,
  downloaded: readonly (readonly [number, number])[] | undefined,
): (readonly [number, number])[] {
  if (downloaded) return downloaded.map(([from, to]) => [from * 1000, to * 1000] as const);
  return bufEnd == null ? [] : [[0, bufEnd * 1000]];
}

export interface TrackRow {
  key: number;
  startMs: number;
  span: number;
  arrived: { key: number; style: ViewStyle }[];
}

export interface DrawnRow extends TrackRow {
  played: StyleProp<ViewStyle>;
}

export function trackRows(
  segs: Chapter[],
  heldMs: readonly (readonly [number, number])[],
): TrackRow[] {
  return segs.map((seg) => {
    const span = Math.max(1, seg.endMs - seg.startMs);
    const arrived: TrackRow['arrived'] = [];
    for (const [fromMs, toMs] of heldMs) {
      const from = clamp01((fromMs - seg.startMs) / span);
      const to = clamp01((toMs - seg.startMs) / span);
      if (to > from) {
        arrived.push({
          key: fromMs,
          style: { left: `${from * 100}%`, right: `${(1 - to) * 100}%` },
        });
      }
    }
    return { key: seg.startMs, startMs: seg.startMs, span, arrived };
  });
}

export function playedRows(
  rows: readonly TrackRow[],
  shownMs: number,
  base: StyleProp<ViewStyle>,
): DrawnRow[] {
  return rows.map((row) => ({
    ...row,
    played: [base, { right: `${(1 - clamp01((shownMs - row.startMs) / row.span)) * 100}%` }],
  }));
}
