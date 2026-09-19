import { type PointerEvent, type RefObject, useRef, useState } from 'react';
import { drag, type Motion, release } from './motion';

type Handler = (event: PointerEvent<HTMLElement>) => void;

export interface DragHandlers {
  onPointerDown: Handler;
  onPointerMove: Handler;
  onPointerUp: Handler;
  onPointerCancel: Handler;
}

interface Touch {
  id: number;
  x: number;
  y: number;
  at: number;
}

/**
 * Turns the globe under the pointer: a drag across the element's width is half
 * a turn. `onMove` fires after every move, for a loop that only draws on demand.
 */
export function useDrag(
  motion: RefObject<Motion>,
  onMove: () => void,
): { handlers: DragHandlers; dragging: boolean } {
  const touch = useRef<Touch | null>(null);
  const [dragging, setDragging] = useState(false);

  const end: Handler = (event) => {
    if (touch.current?.id !== event.pointerId) return;
    touch.current = null;
    release(motion.current);
    setDragging(false);
  };

  const handlers: DragHandlers = {
    onPointerDown(event) {
      if (event.button !== 0 || touch.current) return;
      event.currentTarget.setPointerCapture(event.pointerId);
      touch.current = {
        id: event.pointerId,
        x: event.clientX,
        y: event.clientY,
        at: event.timeStamp,
      };
      setDragging(true);
    },
    onPointerMove(event) {
      const from = touch.current;
      if (!from || from.id !== event.pointerId) return;
      const perPixel = Math.PI / Math.max(1, event.currentTarget.clientWidth);
      const seconds = (event.timeStamp - from.at) / 1000;
      drag(
        motion.current,
        (event.clientX - from.x) * perPixel,
        (event.clientY - from.y) * perPixel,
        seconds,
      );
      touch.current = { id: from.id, x: event.clientX, y: event.clientY, at: event.timeStamp };
      onMove();
    },
    onPointerUp: end,
    onPointerCancel: end,
  };

  return { handlers, dragging };
}
