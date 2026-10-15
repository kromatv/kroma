// @vitest-environment jsdom
import { act, renderHook } from '@testing-library/react';
import type { PointerEvent } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { initialMotion, START_YAW } from './motion';
import { useDrag } from './use-drag';

const WIDTH = 360;

interface Move {
  button?: number;
  pointerId?: number;
  clientX?: number;
  clientY?: number;
  timeStamp?: number;
}

const captured: number[] = [];

function pointer(move: Move = {}): PointerEvent<HTMLElement> {
  return {
    button: 0,
    pointerId: 1,
    clientX: 0,
    clientY: 0,
    timeStamp: 0,
    ...move,
    currentTarget: {
      clientWidth: WIDTH,
      setPointerCapture: (id: number) => captured.push(id),
    },
  } as unknown as PointerEvent<HTMLElement>;
}

function globe() {
  const motion = { current: initialMotion() };
  const onMove = vi.fn();
  const { result, unmount } = renderHook(() => useDrag(motion, onMove));
  return { motion, onMove, result, unmount };
}

describe('useDrag', () => {
  it('turns the globe half a turn across the whole width', () => {
    const { motion, onMove, result } = globe();

    act(() => {
      result.current.handlers.onPointerDown(pointer());
      result.current.handlers.onPointerMove(pointer({ clientX: WIDTH, timeStamp: 1000 }));
    });

    expect(motion.current.yaw).toBeCloseTo(START_YAW + Math.PI, 6);
    expect(onMove).toHaveBeenCalledTimes(1);
  });

  it('takes the pointer so a drag off the element keeps turning it', () => {
    const { result } = globe();

    act(() => result.current.handlers.onPointerDown(pointer({ pointerId: 7 })));

    expect(captured).toContain(7);
    expect(result.current.dragging).toBe(true);
  });

  it('leaves the globe alone for a button that is not the first', () => {
    const { motion, onMove, result } = globe();

    act(() => {
      result.current.handlers.onPointerDown(pointer({ button: 2 }));
      result.current.handlers.onPointerMove(pointer({ clientX: WIDTH, timeStamp: 1000 }));
    });

    expect(result.current.dragging).toBe(false);
    expect(motion.current.yaw).toBe(START_YAW);
    expect(onMove).not.toHaveBeenCalled();
  });

  it('ignores a second finger while the first holds the globe', () => {
    const { motion, onMove, result } = globe();

    act(() => {
      result.current.handlers.onPointerDown(pointer({ pointerId: 1 }));
      result.current.handlers.onPointerDown(pointer({ pointerId: 2, clientX: 100 }));
      result.current.handlers.onPointerMove(pointer({ pointerId: 2, clientX: WIDTH }));
    });

    expect(motion.current.yaw).toBe(START_YAW);
    expect(onMove).not.toHaveBeenCalled();
  });

  it('lets the globe fly on when the finger lifts', () => {
    const { motion, result } = globe();

    act(() => {
      result.current.handlers.onPointerDown(pointer());
      result.current.handlers.onPointerMove(pointer({ clientX: WIDTH / 2, timeStamp: 500 }));
      result.current.handlers.onPointerUp(pointer());
    });

    expect(result.current.dragging).toBe(false);
    expect(motion.current.dragging).toBe(false);
    expect(motion.current.spin).toBeGreaterThan(0);
  });

  it('keeps the drag when a pointer it never held is cancelled', () => {
    const { result } = globe();

    act(() => {
      result.current.handlers.onPointerDown(pointer({ pointerId: 1 }));
      result.current.handlers.onPointerCancel(pointer({ pointerId: 2 }));
    });

    expect(result.current.dragging).toBe(true);
  });

  it('tilts the globe within its limit as the finger goes down', () => {
    const { motion, result } = globe();

    act(() => {
      result.current.handlers.onPointerDown(pointer());
      result.current.handlers.onPointerMove(pointer({ clientY: WIDTH * 4, timeStamp: 1000 }));
    });

    expect(motion.current.pitch).toBeCloseTo(0.85, 6);
  });
});
