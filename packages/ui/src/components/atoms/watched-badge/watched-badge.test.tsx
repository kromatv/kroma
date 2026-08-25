// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { KROMA, KROMA_LIGHT, setTheme } from '#ui/core/theme';
import { onScreen } from '#ui/testing';
import { WatchedBadge } from './watched-badge';

afterEach(() => {
  cleanup();
  setTheme(KROMA);
});

describe('WatchedBadge', () => {
  it('names itself, so a reader who cannot see the artwork still hears the state', () => {
    render(onScreen(<WatchedBadge />));

    expect(screen.getByLabelText('Watched').getAttribute('role')).toBe('img');
  });

  it('takes its diameter from size', () => {
    render(onScreen(<WatchedBadge size={40} />));

    expect(getComputedStyle(screen.getByLabelText('Watched')).width).toBe('40px');
  });

  it('is a wedge, not a disc: the shape is what reads before the colour does', () => {
    render(onScreen(<WatchedBadge />));

    const wedge = screen.getByLabelText('Watched').querySelector('polygon');

    expect(wedge).toBeTruthy();
    expect(wedge?.getAttribute('points')).toBe('0,0 40,0 0,40');
  });

  it('paints the same in either theme, because a poster is the same poster in both', () => {
    const fill = () =>
      screen.getByLabelText('Watched').querySelector('polygon')?.getAttribute('fill');
    const { unmount } = render(onScreen(<WatchedBadge />));
    const dark = fill();
    unmount();

    setTheme(KROMA_LIGHT);
    render(onScreen(<WatchedBadge />));

    expect(dark).toBeTruthy();
    expect(fill()).toBe(dark);
  });
});
