// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Tooltip } from './tooltip';

const SHOW_DELAY_MS = 300;

function hoverAt(top: number) {
  vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockReturnValue({
    x: 100,
    y: top,
    left: 100,
    right: 140,
    top,
    bottom: top + 40,
    width: 40,
    height: 40,
    toJSON: () => ({}),
  });
  render(
    <Tooltip label="Quick access">
      <button type="button">open</button>
    </Tooltip>,
  );
  fireEvent.mouseEnter(screen.getByRole('button').parentElement as HTMLElement);
  act(() => {
    vi.advanceTimersByTime(SHOW_DELAY_MS);
  });
  return screen.getByRole('tooltip');
}

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe('Tooltip', () => {
  it('sits over its child when there is room above it', () => {
    const tip = hoverAt(200);

    expect(tip.style.top).toBe('192px');
  });

  it('drops under a child at the top of the window, where it would be cut off', () => {
    const tip = hoverAt(24);

    expect(tip.style.top).toBe('72px');
    expect(tip.style.transform).toBe('translateX(-50%)');
  });
});
