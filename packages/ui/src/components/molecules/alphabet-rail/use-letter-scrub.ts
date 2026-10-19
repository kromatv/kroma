// The rail's gesture layer: dragging along the letters jumps as the finger
// crosses rows, and the bubble follows it.

import { type RefObject, useRef, useState } from 'react';
import type { View } from 'react-native';
import { useScrubGesture } from '#ui/lib/scrub-gesture';
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

  // offsetY is measured from the rail's top edge.
  const scrubAt = (offsetY: number) => {
    const at = clampNum(0, Math.floor((offsetY - PAD) / rowH), slots.length - 1);
    const best = nearestPresent(slots, at);
    const letter = best < 0 ? undefined : slots[best]?.value;
    if (letter === undefined) return;
    setBubble({ letter, y: PAD + best * rowH + rowH / 2 });
    if (scrubbed.current !== letter) {
      scrubbed.current = letter;
      onJump(letter);
    }
  };

  const endScrub = () => {
    scrubbed.current = null;
    setBubble(null);
  };

  const panHandlers = useScrubGesture(rail, {
    onScrub: scrubAt,
    onEnd: endScrub,
    slop: SCRUB_SLOP,
  });
  return { bubble, panHandlers };
}

export type { Slot };
export { clampNum, useLetterScrub };
