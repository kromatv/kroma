// @vitest-environment jsdom

import { render } from '@testing-library/react';
import { Animated } from 'react-native';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { LensRect } from './nav-pill-context';
import { Lens } from './nav-pill-lens';

vi.mock('react-native', async (importOriginal) => {
  const actual = await importOriginal<typeof import('react-native')>();
  return { ...actual, Platform: { ...actual.Platform, OS: 'ios', isTV: true } };
});

afterEach(() => {
  vi.restoreAllMocks();
});

const HOME: LensRect = { x: 8, y: 4, width: 96, height: 44 };
const SEARCH: LensRect = { x: 128, y: 4, width: 120, height: 44 };

function lens(rect: LensRect | null) {
  const timing = vi.spyOn(Animated, 'timing');
  const { container, rerender } = render(<Lens rect={rect} chase={false} tone="accent" />);
  return {
    container,
    timing,
    node: () => container.firstElementChild as HTMLElement | null,
    move: (next: LensRect | null) => rerender(<Lens rect={next} chase={false} tone="accent" />),
  };
}

describe('the lens on a native television', () => {
  it('jumps to the next item without animating a frame', () => {
    const view = lens(HOME);

    view.move(SEARCH);

    expect(view.timing).not.toHaveBeenCalled();
    expect(view.node()?.style.left).toBe(`${SEARCH.x}px`);
    expect(view.node()?.style.width).toBe(`${SEARCH.width}px`);
  });

  it('sits on the row the item measured', () => {
    const view = lens(HOME);

    expect(view.node()?.style.top).toBe(`${HOME.y}px`);
    expect(view.node()?.style.height).toBe(`${HOME.height}px`);
  });

  it('leaves at once when no item owns it', () => {
    const view = lens(HOME);

    view.move(null);

    expect(view.timing).not.toHaveBeenCalled();
    expect(view.container.innerHTML).toBe('');
  });
});
