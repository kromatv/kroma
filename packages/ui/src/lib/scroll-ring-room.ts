import { type ViewStyle } from 'react-native';
import { RING_ROOM } from '#ui/core/tokens';

const pad = (value: unknown): number => (typeof value === 'number' ? value : 0);

/**
 * A scroll view clips at its own edges, and the ring of a focused control stands
 * outside the control - so a control flush with an edge loses that side of its
 * ring (the leftmost poster of a results grid, every time). The scroller reaches
 * RING_ROOM further out and its content is padded back in by the same amount:
 * the content lands exactly where it did, with room around it for a ring.
 *
 * A row reaches out on all four sides: its first tile IS flush with the start
 * edge, and nothing of the app's sits beside a row for the extra reach to show
 * through. A page only reaches out sideways - above and below it is the screen's
 * own chrome, and a hole in the clip there would show the scrolled-off rows
 * through it (see organisms/virtual/clip). A page's first row gets its room from
 * the top padding of its content instead.
 */
function ringRoom(
  style: ViewStyle | undefined,
  content: ViewStyle | undefined,
  horizontal: boolean,
): { box: ViewStyle; content: ViewStyle } {
  const c = content ?? {};
  if (horizontal) {
    return {
      box: {
        ...style,
        marginTop: pad(style?.marginTop) - RING_ROOM,
        marginBottom: pad(style?.marginBottom) - RING_ROOM,
        marginLeft: pad(style?.marginLeft) - RING_ROOM,
        marginRight: pad(style?.marginRight) - RING_ROOM,
      },
      content: {
        ...c,
        paddingTop: pad(c.paddingTop ?? c.paddingVertical ?? c.padding) + RING_ROOM,
        paddingBottom: pad(c.paddingBottom ?? c.paddingVertical ?? c.padding) + RING_ROOM,
        paddingLeft: pad(c.paddingLeft ?? c.paddingHorizontal ?? c.padding) + RING_ROOM,
        paddingRight: pad(c.paddingRight ?? c.paddingHorizontal ?? c.padding) + RING_ROOM,
      },
    };
  }
  return {
    box: {
      ...style,
      marginLeft: pad(style?.marginLeft) - RING_ROOM,
      marginRight: pad(style?.marginRight) - RING_ROOM,
    },
    content: {
      ...c,
      paddingLeft: pad(c.paddingLeft ?? c.paddingHorizontal ?? c.padding) + RING_ROOM,
      paddingRight: pad(c.paddingRight ?? c.paddingHorizontal ?? c.padding) + RING_ROOM,
    },
  };
}

export { ringRoom };
