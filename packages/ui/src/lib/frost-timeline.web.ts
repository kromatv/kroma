import { frostFollowsScroll, FROST_AXES } from './frost-motion';

const asElement = (node: unknown): HTMLElement | null =>
  node && typeof (node as HTMLElement).style?.setProperty === 'function'
    ? (node as HTMLElement)
    : null;

/** Declares a scroller's offset as the timeline frosted samples inside it
 *  counter-move on, with its scroll range as the distance they travel. */
export function declareFrostTimeline(scroller: unknown, horizontal: boolean, range: number): void {
  if (!frostFollowsScroll()) return;
  const host = scroller as { getScrollableNode?: () => unknown } | null;
  const node = asElement(host?.getScrollableNode?.() ?? scroller);
  if (!node) return;
  const axis = FROST_AXES[horizontal ? 'x' : 'y'];
  node.style.setProperty('scroll-timeline', `${axis.timeline} ${horizontal ? 'x' : 'y'}`);
  node.style.setProperty(axis.range, `${Math.max(0, range)}px`);
}
