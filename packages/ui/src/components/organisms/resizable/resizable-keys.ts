// A held seam, on the native targets: there is no document to take the keys on,
// and the OS hands every direction to the spatial navigator's bridge. So the
// handle HOLDS the remote for as long as it is held (the bridge does nothing
// while something else owns the input) and reads the directions itself.
//
// Select arrives here rather than as a press for the same reason - a held
// remote never reaches a control - which is what lets the same button that took
// the seam give it back.

import { useEffect, useRef } from 'react';
import { type HWEvent, Platform, useTVEventHandler } from 'react-native';
import type { GroupOrientation } from '#ui/lib/group-shape';
import { holdInput } from '#ui/lib/input-gate';
import type { ResizableKeysOptions } from './resizable-keys-types';

const MOVES: Record<string, { orientation: GroupOrientation; towards: -1 | 1 }> = {
  left: { orientation: 'horizontal', towards: -1 },
  right: { orientation: 'horizontal', towards: 1 },
  up: { orientation: 'vertical', towards: -1 },
  down: { orientation: 'vertical', towards: 1 },
  swipeLeft: { orientation: 'horizontal', towards: -1 },
  swipeRight: { orientation: 'horizontal', towards: 1 },
  swipeUp: { orientation: 'vertical', towards: -1 },
  swipeDown: { orientation: 'vertical', towards: 1 },
};

const RELEASES = new Set(['select', 'menu', 'back']);

// Resolved once at module scope so React never sees the hook count change
// between builds; the phone app has no TV surface at all.
const HAS_TV_EVENTS = typeof useTVEventHandler === 'function';
const useRemoteEvents: (handler: (event: HWEvent) => void) => void = HAS_TV_EVENTS
  ? useTVEventHandler
  : () => {};

// Android TV reports a press as two events (`0` down, `1` up); tvOS reports one
// and stamps it `1` anyway.
function isKeyUp(event: HWEvent): boolean {
  return Platform.OS === 'android' && event.eventKeyAction === 1;
}

function useResizableKeys({ held, orientation, onNudge, onRelease }: ResizableKeysOptions): void {
  const at = useRef({ held, orientation, onNudge, onRelease });
  at.current = { held, orientation, onNudge, onRelease };

  useEffect(() => (held ? holdInput() : undefined), [held]);

  useRemoteEvents((event: HWEvent) => {
    const { held: holding, orientation: along, onNudge: nudge, onRelease: release } = at.current;
    if (!holding || isKeyUp(event)) return;
    if (RELEASES.has(event.eventType)) {
      release();
      return;
    }
    const move = MOVES[event.eventType];
    if (move?.orientation === along) nudge(move.towards);
  });
}

export { useResizableKeys };
