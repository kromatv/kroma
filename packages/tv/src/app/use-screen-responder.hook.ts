import { useEffect, useRef } from 'react';
import type { EventTap } from '#tv/app/event-tap';
import { createScreenResponder, type ScreenIdentity } from '#tv/app/screen-responder';

/** Lets an admin read this television's screen over the socket `tap` holds,
 * for as long as the component is mounted. */
export function useScreenResponder(tap: EventTap, self: ScreenIdentity): void {
  const latest = useRef(self);
  useEffect(() => {
    latest.current = self;
  });
  useEffect(() => createScreenResponder(tap, () => latest.current), [tap]);
}
