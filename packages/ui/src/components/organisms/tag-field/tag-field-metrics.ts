import type { StyleScope } from '#ui/core';
import { fontSizes, nestedRadius, type Radius } from '#ui/core/tokens';
import { CONTROL, type ControlMetrics, type ControlSize, controlRadius } from '#ui/lib/field-shell';

interface TagMetrics {
  control: ControlMetrics;
  tag: number;
  tagMedia: number;
  fontSize: number;
  gap: number;
  rowMedia: number;
  inset: number;
}

const TAG: Record<ControlSize, Omit<TagMetrics, 'control' | 'inset'>> = {
  sm: { tag: 26, tagMedia: 20, fontSize: fontSizes.captionRaised, gap: 6, rowMedia: 32 },
  md: { tag: 30, tagMedia: 22, fontSize: fontSizes.compactLabel, gap: 8, rowMedia: 36 },
  tv: { tag: 40, tagMedia: 30, fontSize: fontSizes.largeLabel, gap: 10, rowMedia: 44 },
};

/** What a tags field measures at a shell size. `inset` is the well's padding
 *  around a line of tags, so one line of them is exactly a `<Field.Input>` tall. */
function tagMetrics(size: ControlSize): TagMetrics {
  const control = CONTROL[size];
  const tag = TAG[size];
  return { ...tag, control, inset: control.py + (control.line - tag.tag) / 2 };
}

/** The corner of what stands in the well, a tag or the stop after them:
 *  the well's own less the inset, so the two stay concentric. */
function tagCorner(metrics: TagMetrics, scope?: StyleScope): Radius {
  return nestedRadius(controlRadius(metrics.control, scope), metrics.inset);
}

export type { TagMetrics };
export { tagCorner, tagMetrics };
