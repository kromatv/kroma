// The room a focus ring needs beside a control, as the properties a SCROLLING
// element states. See RING_ROOM for the number, and lib/focus-scroll for the
// same trick spelled in React Native, which the kit's own scrollers use.

import type { CSSProperties } from 'react';
import { RING_ROOM } from '#ui/core/tokens';

/**
 * Vertical room for a focus ring inside an element that scrolls or clips: the
 * box reaches `RING_ROOM` further out and its content is padded back in by the
 * same amount, so the content lands exactly where it did with room around it
 * for a ring. `inset` is the padding that edge already carried, and the reach is
 * measured from it, so nothing moves.
 *
 * A scroller clips at its own edges and the ring stands OUTSIDE the control it
 * marks, so a control flush with an edge loses that side of its ring - the first
 * season chip under a show, every time. `scroll-padding` says the same thing for
 * the control the scroller brings into view, where the room has scrolled away.
 *
 * An element that IS a card around its rows - its own edge and fill, clipping
 * them - has no outside to reach into: its rows take the inset ring instead
 * (`ring: 'focusInset'`, as `<ListRow.Group>`'s members do).
 */
export function ringRoomBlock(inset = 0): CSSProperties {
  return {
    marginBlock: inset - RING_ROOM,
    paddingBlock: RING_ROOM,
    scrollPadding: RING_ROOM,
  };
}

/** The same room on the other axis. See {@link ringRoomBlock}. */
export function ringRoomInline(inset = 0): CSSProperties {
  return {
    marginInline: inset - RING_ROOM,
    paddingInline: RING_ROOM,
    scrollPadding: RING_ROOM,
  };
}
