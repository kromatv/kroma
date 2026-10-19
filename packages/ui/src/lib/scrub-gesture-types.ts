import type { GestureResponderHandlers } from 'react-native';

/** What a vertical scrub reports: the offset from the target's top edge, and its end. */
export interface ScrubGestureOptions {
  onScrub: (offsetY: number) => void;
  onEnd: () => void;
  /** Pixels a touch travels before it is a scrub rather than a tap. */
  slop: number;
}

/** Spread onto the target; null where the scrub is wired another way or not at all. */
export type ScrubHandlers = GestureResponderHandlers | null;
