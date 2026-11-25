import type { StyleScope } from '#ui/core';
import { fontSizes, nestedRadius, type Radius } from '#ui/core/tokens';
import { CONTROL, type ControlMetrics, type ControlSize, controlRadius } from '#ui/lib/field-shell';

interface EntryMetrics {
  control: ControlMetrics;
  mark: number;
  markMedia: number;
  fontSize: number;
  gap: number;
  rowMedia: number;
  inset: number;
}

const MARK: Record<ControlSize, Omit<EntryMetrics, 'control' | 'inset'>> = {
  sm: { mark: 26, markMedia: 20, fontSize: fontSizes.captionRaised, gap: 6, rowMedia: 32 },
  md: { mark: 30, markMedia: 22, fontSize: fontSizes.compactLabel, gap: 8, rowMedia: 36 },
  tv: { mark: 40, markMedia: 30, fontSize: fontSizes.largeLabel, gap: 10, rowMedia: 44 },
};

/** The space between a suggestion row's edge and the mark at its head. */
const ROW_INSET = 6;

/** What an entry with suggestions measures at a shell size. `mark` is what
 *  stands in the well (a tag, a face, a stop), and `inset` the well's padding
 *  around it, so one line of marks is exactly a `<Field.Input>` tall. */
function entryMetrics(size: ControlSize): EntryMetrics {
  const control = CONTROL[size];
  const mark = MARK[size];
  return { ...mark, control, inset: control.py + (control.line - mark.mark) / 2 };
}

/** The corner of what stands in the well: the well's own less the inset, so
 *  the two stay concentric. */
function markCorner(metrics: EntryMetrics, scope?: StyleScope): Radius {
  return nestedRadius(controlRadius(metrics.control, scope), metrics.inset);
}

function rowCorner(scope?: StyleScope): Radius {
  return controlRadius(CONTROL.sm, scope);
}

/** The corner of the mark at the head of a row: the row's less its inset. */
function rowMediaCorner(scope?: StyleScope): Radius {
  return nestedRadius(rowCorner(scope), ROW_INSET);
}

export type { EntryMetrics };
export { entryMetrics, markCorner, ROW_INSET, rowMediaCorner };
