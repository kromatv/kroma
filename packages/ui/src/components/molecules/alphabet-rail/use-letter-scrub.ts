// The rail's gesture layer: dragging along the letters jumps as the finger
// crosses rows, and the bubble follows it.

import { type RefObject, useEffect, useRef, useState } from 'react';
import { PanResponder, Platform, type View } from 'react-native';
import { PAD } from './alphabet-rail-context';

const WEB = Platform.OS === 'web';

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

function useLetterScrub(
  rail: RefObject<View | null>,
  slots: readonly Slot[],
  rowH: number,
  onJump: (letter: string) => void,
) {
  const [bubble, setBubble] = useState<Bubble | null>(null);

  // The responder outlives every render, so it reads the moving parts
  // through refs rather than closures.
  const frame = useRef({ slots, rowH });
  frame.current = { slots, rowH };
  const jump = useRef(onJump);
  jump.current = onJump;
  const scrubbed = useRef<string | null>(null);
  const originY = useRef<number | null>(null);

  // offsetY is measured from the rail's top edge.
  const scrubAt = (offsetY: number) => {
    const { slots: all, rowH: row } = frame.current;
    const at = clampNum(0, Math.floor((offsetY - PAD) / row), all.length - 1);
    let best = -1;
    let gap = Number.POSITIVE_INFINITY;
    all.forEach((slot, i) => {
      const away = Math.abs(i - at);
      if (slot.present && away < gap) {
        gap = away;
        best = i;
      }
    });
    const letter = best < 0 ? undefined : all[best]?.value;
    if (letter === undefined) return;
    setBubble({ letter, y: PAD + best * row + row / 2 });
    if (scrubbed.current !== letter) {
      scrubbed.current = letter;
      jump.current(letter);
    }
  };
  const scrubAtRef = useRef(scrubAt);
  scrubAtRef.current = scrubAt;

  // Web scrubbing goes straight to DOM pointer events: react-native-web's
  // responder system does not follow a mouse drag, and preventDefault on the
  // press is also what keeps a scrub from selecting letters or focusing them.
  useEffect(() => {
    if (!WEB) return;
    const node = rail.current as unknown as HTMLElement | null;
    if (!node?.addEventListener) return;
    const end = () => {
      scrubbed.current = null;
      setBubble(null);
    };
    const down = (e: PointerEvent) => {
      e.preventDefault();
      node.setPointerCapture(e.pointerId);
      scrubAtRef.current(e.clientY - node.getBoundingClientRect().top);
    };
    const move = (e: PointerEvent) => {
      if (e.buttons === 0) return;
      scrubAtRef.current(e.clientY - node.getBoundingClientRect().top);
    };
    node.addEventListener('pointerdown', down);
    node.addEventListener('pointermove', move);
    node.addEventListener('pointerup', end);
    node.addEventListener('pointercancel', end);
    return () => {
      node.removeEventListener('pointerdown', down);
      node.removeEventListener('pointermove', move);
      node.removeEventListener('pointerup', end);
      node.removeEventListener('pointercancel', end);
    };
  }, [rail]);

  const pan = useRef(
    PanResponder.create({
      onMoveShouldSetPanResponderCapture: (_event, gesture) =>
        Math.abs(gesture.dy) > SCRUB_SLOP && Math.abs(gesture.dy) > Math.abs(gesture.dx),
      onPanResponderGrant: () => {
        originY.current = null;
        const node = rail.current as
          | (View & { getBoundingClientRect?: () => { top: number } })
          | null;
        if (node?.getBoundingClientRect) {
          const scrollY = (globalThis as { scrollY?: number }).scrollY ?? 0;
          originY.current = node.getBoundingClientRect().top + scrollY;
        } else {
          node?.measureInWindow((_x, y) => {
            originY.current = y;
          });
        }
      },
      onPanResponderMove: (_event, gesture) => {
        if (originY.current === null) return;
        scrubAtRef.current(gesture.moveY - originY.current);
      },
      // Once a scrub owns the touch, no ancestor scroll view takes it back.
      onPanResponderTerminationRequest: () => false,
      onPanResponderRelease: () => {
        scrubbed.current = null;
        setBubble(null);
      },
      onPanResponderTerminate: () => {
        scrubbed.current = null;
        setBubble(null);
      },
    }),
  ).current;

  // A television has no finger and the web half is wired by hand above.
  const panHandlers = WEB || Platform.isTV ? null : pan.panHandlers;
  return { bubble, panHandlers };
}

export type { Slot };
export { clampNum, useLetterScrub };
