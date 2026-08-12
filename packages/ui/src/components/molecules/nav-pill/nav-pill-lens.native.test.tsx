// @vitest-environment jsdom

import { render } from '@testing-library/react';
import { Animated } from 'react-native';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { LensRect } from './nav-pill-context';
import { Lens } from './nav-pill-lens';

vi.mock('react-native', async (importOriginal) => {
  const actual = await importOriginal<typeof import('react-native')>();
  return { ...actual, Platform: { ...actual.Platform, OS: 'ios' } };
});

afterEach(() => {
  vi.restoreAllMocks();
});

const HOME: LensRect = { x: 8, y: 4, width: 96, height: 44 };
const SEARCH: LensRect = { x: 128, y: 4, width: 120, height: 44 };

function lens(rect: LensRect | null, chase = false) {
  const timing = vi.spyOn(Animated, 'timing');
  timing.mockClear();
  const { container, rerender } = render(<Lens rect={rect} chase={chase} />);
  return {
    container,
    timing,
    node: container.firstElementChild as HTMLElement,
    move: (next: LensRect | null) => rerender(<Lens rect={next} chase={chase} />),
  };
}

const toValues = (view: ReturnType<typeof lens>) =>
  view.timing.mock.calls.map(([, config]) => config.toValue);

function travelMs(chase: boolean) {
  const view = lens(HOME, chase);
  view.move(SEARCH);
  return Number(view.timing.mock.calls.at(-1)?.[1].duration);
}

describe('the lens on native', () => {
  it('takes its first rect without travelling to it', () => {
    const { node, timing } = lens(HOME);
    expect(timing).not.toHaveBeenCalled();
    expect(node.style.left).toBe(`${HOME.x}px`);
    expect(node.style.width).toBe(`${HOME.width}px`);
    expect(node.style.opacity).toBe('1');
  });

  it('sits on the row the item measured', () => {
    const { node } = lens(HOME);
    expect(node.style.top).toBe(`${HOME.y}px`);
    expect(node.style.height).toBe(`${HOME.height}px`);
  });

  it('travels along the row and nowhere else', () => {
    const view = lens(HOME);
    view.move(SEARCH);
    expect(toValues(view)).toEqual([SEARCH.x, SEARCH.width, 1]);
  });

  it('keeps up with a sliding finger by shortening the travel', () => {
    expect(travelMs(true)).toBeLessThan(travelMs(false));
  });

  it('fades where it stands when no item owns it', () => {
    const view = lens(HOME);
    view.move(null);
    expect(toValues(view)).toEqual([0]);
    expect(view.node.style.left).toBe(`${HOME.x}px`);
  });

  it('draws nothing at all until an item claims it', () => {
    expect(lens(null).container.innerHTML).toBe('');
  });
});
