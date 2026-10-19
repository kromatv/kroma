import { webDocument, webWindow } from './dom';

/** The custom properties and timeline names a scroller hands its frosted samples. */
export const FROST_AXES = {
  x: { timeline: '--kroma-frost-x', range: '--kroma-frost-xr' },
  y: { timeline: '--kroma-frost-y', range: '--kroma-frost-yr' },
} as const;

/** The inverse of the focus scale, set beside it so a sample can undo it. */
export const FROST_UNSCALE = '--kroma-unscale';

const known: { follows: boolean | null; installed: boolean } = { follows: null, installed: false };

/** Whether the engine runs scroll-driven animations, so a sample can follow
 *  the scroll on the compositor rather than be realigned after it. */
export function frostFollowsScroll(): boolean {
  if (known.follows === null) {
    const css = (webWindow() as { CSS?: { supports?: (rule: string) => boolean } } | null)?.CSS;
    known.follows = css?.supports?.('animation-timeline: scroll()') === true;
  }
  return known.follows;
}

const SHEET = `@keyframes kroma-frost-y{from{translate:0 0}to{translate:0 var(${FROST_AXES.y.range})}}@keyframes kroma-frost-x{from{transform:none}to{transform:translateX(var(${FROST_AXES.x.range}))}}`;

/** The animation a sample wears to counter-move its scrollers, or null where
 *  the engine cannot drive one from a scroll. */
export function frostFollow(): Record<string, string> | null {
  if (!frostFollowsScroll()) return null;
  const doc = webDocument();
  if (!known.installed && doc) {
    const sheet = doc.createElement('style');
    sheet.textContent = SHEET;
    doc.head.appendChild(sheet);
    known.installed = true;
  }
  return {
    animationName: 'kroma-frost-y, kroma-frost-x',
    animationDuration: '1s',
    animationTimingFunction: 'linear',
    animationFillMode: 'both',
    animationTimeline: `${FROST_AXES.y.timeline}, ${FROST_AXES.x.timeline}`,
  };
}
