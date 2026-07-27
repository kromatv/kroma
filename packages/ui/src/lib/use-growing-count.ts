// Grow a rendered count toward a total as the user approaches the end of a
// scroller, so a 1000-item library never mounts all at once.
//
// Deliberately NOT virtualisation. A FlatList unmounts off-screen rows, and the
// web spatial navigator can only find focusables that are mounted: virtualising
// a browse grid would make the D-pad stop dead at the edge of the viewport. This
// keeps every tile that has been reached in the tree and simply defers the rest.
//
// The trigger is the FOCUS reaching the end rather than a scroll position. The
// scroller is driven by the spatial navigator now, and the navigator scrolls
// because focus moved - so focus is the earlier, and the only reliable, signal.
// A scroll offset would also miss the case a remote makes constant: several fast
// presses that outrun the scroll animation.

import { useCallback, useEffect, useState } from 'react';

interface GrowingCount {
  /** How many items to render right now. */
  count: number;
  /** True for the items near the end of what is rendered: give those a
   *  `onFocus={grow}` and the next chunk arrives before they run out. */
  isNearEnd: (index: number) => boolean;
  /** Render the next chunk. */
  grow: () => void;
}

/** How close to the end of the rendered chunk starts the next one, as a share of
 * the chunk. A tenth of a chunk is too late on a grid and a whole chunk is the
 * whole list on a rail, so it scales with the chunk: a 120-item grid looks ahead
 * 30, a rail of 8 looks ahead 2. */
const LOOKAHEAD = 0.25;

function useGrowingCount(total: number, step: number): GrowingCount {
  const [count, setCount] = useState(() => Math.min(step, total));

  // A new list (a different genre, a new search) restarts from the first chunk.
  useEffect(() => setCount(Math.min(step, total)), [total, step]);

  const grow = useCallback(
    () => setCount((c) => (c >= total ? c : Math.min(c + step, total))),
    [total, step],
  );

  const ahead = Math.max(2, Math.round(step * LOOKAHEAD));
  const isNearEnd = useCallback((index: number) => index >= count - ahead, [count, ahead]);

  return { count, isNearEnd, grow };
}

export type { GrowingCount };
export { useGrowingCount };
