// @vitest-environment jsdom

import { render } from '@testing-library/react';
import { Animated } from 'react-native';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { Lens, lensFor } from './alphabet-rail-lens';

vi.mock('react-native', async (importOriginal) => {
  const actual = await importOriginal<typeof import('react-native')>();
  return { ...actual, Platform: { ...actual.Platform, OS: 'ios' } };
});

afterEach(() => {
  vi.restoreAllMocks();
});

type LensBox = ReturnType<typeof lensFor>;

const ROW_H = 24;

function lens(box: LensBox | null, chase = false) {
  const timing = vi.spyOn(Animated, 'timing');
  timing.mockClear();
  const { container, rerender } = render(<Lens box={box} chase={chase} />);
  return {
    container,
    timing,
    node: container.firstElementChild as HTMLElement,
    move: (next: LensBox | null) => rerender(<Lens box={next} chase={chase} />),
  };
}

const lastMs = (view: ReturnType<typeof lens>) =>
  Number(view.timing.mock.calls.at(-1)?.[1].duration);

const toValues = (view: ReturnType<typeof lens>) =>
  view.timing.mock.calls.map(([, config]) => config.toValue);

function travelMs(chase: boolean) {
  const view = lens(lensFor([0, 0], ROW_H), chase);
  view.move(lensFor([4, 4], ROW_H));
  return lastMs(view);
}

describe('the lens on native', () => {
  it('takes its first box without travelling to it', () => {
    const box = lensFor([0, 0], ROW_H);
    const { node, timing } = lens(box);
    expect(timing).not.toHaveBeenCalled();
    expect(node.style.left).toBe(`${box.x}px`);
    expect(node.style.top).toBe(`${box.y}px`);
    expect(node.style.width).toBe(`${box.width}px`);
    expect(node.style.height).toBe(`${box.height}px`);
    expect(node.style.opacity).toBe('1');
  });

  it('travels to every box after that', () => {
    const view = lens(lensFor([0, 0], ROW_H));
    const next = lensFor([3, 5], ROW_H);
    view.move(next);
    expect(toValues(view)).toEqual([next.x, next.y, next.width, next.height, 1]);
  });

  it('keeps up with a scrubbing finger by shortening the travel', () => {
    expect(travelMs(true)).toBeLessThan(travelMs(false));
  });

  it('fades where it stands when the host reports no range', () => {
    const placed = lensFor([1, 2], ROW_H);
    const view = lens(placed);
    view.move(null);
    expect(toValues(view)).toEqual([0]);
    expect(view.node.style.top).toBe(`${placed.y}px`);
    expect(view.node.style.height).toBe(`${placed.height}px`);
  });

  it('draws nothing at all until a range arrives', () => {
    expect(lens(null).container.innerHTML).toBe('');
  });
});
