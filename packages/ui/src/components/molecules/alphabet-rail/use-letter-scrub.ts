// The rail's gesture layer: dragging along the letters jumps as the finger
// crosses rows, and the bubble follows it.
//
// The listeners outlive every render (DOM handlers on the web, one PanResponder
// natively), so what they read has to stay fresh without rebuilding them.
// `useEffectEvent` is that exactly: a stable function whose body always sees the
// latest render - where a ref written during render would blind the React
// Compiler and cost the rail its memoisation.

import { type RefObject, useEffect, useEffectEvent, useRef, useState } from 'react';
import { PanResponder, Platform, type View } from 'react-native';
import { WEB } from '#ui/lib/platform';
import { PAD } from './alphabet-rail-context';

// Inside the slop a touch is a tap and belongs to the letter's own pressable.
const SCRUB_SLOP = 8;

interface Slot {
  value: string;
  present: boolean;
}

interface Bubble {
  letter: string;
  y: number;
}

const clampNum = (min: number, v: number, max: number) => Math.min(max, Math.max(min, v));

/** The nearest PRESENT row to the one under the finger, or -1 in an empty rail. */
function nearestPresent(slots: readonly Slot[], at: number): number {
  let best = -1;
  let gap = Number.POSITIVE_INFINITY;
  slots.forEach((slot, i) => {
    const away = Math.abs(i - at);
    if (slot.present && away < gap) {
      gap = away;
      best = i;
    }
  });
  return best;
}

function useLetterScrub(
  rail: RefObject<View | null>,
  slots: readonly Slot[],
  rowH: number,
  onJump: (letter: string) => void,
) {
  const [bubble, setBubble] = useState<Bubble | null>(null);
  const scrubbed = useRef<string | null>(null);
  const originY = useRef<number | null>(null);

  // offsetY is measured from the rail's top edge.
  const scrubAt = useEffectEvent((offsetY: number) => {
    const at = clampNum(0, Math.floor((offsetY - PAD) / rowH), slots.length - 1);
    const best = nearestPresent(slots, at);
    const letter = best < 0 ? undefined : slots[best]?.value;
    if (letter === undefined) return;
    setBubble({ letter, y: PAD + best * rowH + rowH / 2 });
    if (scrubbed.current !== letter) {
      scrubbed.current = letter;
      onJump(letter);
    }
  });

  const endScrub = useEffectEvent(() => {
    scrubbed.current = null;
    setBubble(null);
  });

  // Web scrubbing goes straight to DOM pointer events: react-native-web's
  // responder system does not follow a mouse drag, and preventDefault on the
  // press is also what keeps a scrub from selecting letters or focusing them.
  useEffect(() => {
    if (!WEB) return;
    const node = rail.current as unknown as HTMLElement | null;
    if (!node?.addEventListener) return;
    const down = (e: PointerEvent) => {
      e.preventDefault();
      node.setPointerCapture(e.pointerId);
      scrubAt(e.clientY - node.getBoundingClientRect().top);
    };
    const move = (e: PointerEvent) => {
      if (e.buttons === 0) return;
      scrubAt(e.clientY - node.getBoundingClientRect().top);
    };
    node.addEventListener('pointerdown', down);
    node.addEventListener('pointermove', move);
    node.addEventListener('pointerup', endScrub);
    node.addEventListener('pointercancel', endScrub);
    return () => {
      node.removeEventListener('pointerdown', down);
      node.removeEventListener('pointermove', move);
      node.removeEventListener('pointerup', endScrub);
      node.removeEventListener('pointercancel', endScrub);
    };
  }, [rail]);

  const grab = useEffectEvent(() => {
    originY.current = null;
    const node = rail.current as (View & { getBoundingClientRect?: () => { top: number } }) | null;
    if (node?.getBoundingClientRect) {
      const scrollY = (globalThis as { scrollY?: number }).scrollY ?? 0;
      originY.current = node.getBoundingClientRect().top + scrollY;
    } else {
      node?.measureInWindow((_x, y) => {
        originY.current = y;
      });
    }
  });

  const drag = useEffectEvent((moveY: number) => {
    if (originY.current === null) return;
    scrubAt(moveY - originY.current);
  });

  // Built once: the handlers are effect events, so the one responder always
  // sees the current rows without ever being recreated.
  const [pan] = useState(() =>
    PanResponder.create({
      onMoveShouldSetPanResponderCapture: (_event, gesture) =>
        Math.abs(gesture.dy) > SCRUB_SLOP && Math.abs(gesture.dy) > Math.abs(gesture.dx),
      onPanResponderGrant: () => grab(),
      onPanResponderMove: (_event, gesture) => drag(gesture.moveY),
      // Once a scrub owns the touch, no ancestor scroll view takes it back.
      onPanResponderTerminationRequest: () => false,
      onPanResponderRelease: () => endScrub(),
      onPanResponderTerminate: () => endScrub(),
    }),
  );

  // A television has no finger and the web half is wired by hand above.
  const panHandlers = WEB || Platform.isTV ? null : pan.panHandlers;
  return { bubble, panHandlers };
}

export type { Slot };
export { clampNum, useLetterScrub };
