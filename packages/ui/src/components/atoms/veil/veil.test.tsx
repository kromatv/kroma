// @vitest-environment jsdom
import { cleanup, render } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { Veil } from './veil';
import { parseRamps } from '#ui/lib/veil-bitmap';

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe('parseRamps', () => {
  it('reads angles, sides and stops, the first gradient on top', () => {
    expect(
      parseRamps(
        'linear-gradient(0deg, rgba(10, 10, 12, 0.8) 0%, transparent 60%), linear-gradient(to right, #0a0a0c, transparent)',
      ),
    ).toEqual([
      {
        angle: 0,
        stops: [
          { color: 'rgba(10, 10, 12, 0.8)', at: 0 },
          { color: 'transparent', at: 0.6 },
        ],
      },
      {
        angle: 90,
        stops: [
          { color: '#0a0a0c', at: null },
          { color: 'transparent', at: null },
        ],
      },
    ]);
  });

  it('defaults to top-to-bottom when no direction is given', () => {
    expect(parseRamps('linear-gradient(black, white)')?.[0]?.angle).toBe(180);
  });

  it('refuses what a stretched bitmap cannot stand for', () => {
    expect(parseRamps('radial-gradient(black, white)')).toBeNull();
    expect(parseRamps('linear-gradient(black 12px, white)')).toBeNull();
    expect(parseRamps('linear-gradient(black)')).toBeNull();
  });
});

describe('Veil on the browser targets', () => {
  const RAMP = 'linear-gradient(0deg, rgb(1, 2, 3) 0%, transparent 100%)';

  it('stretches one small bitmap of the ramp over the box', () => {
    const stops: Array<[number, string]> = [];
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue({
      createLinearGradient: () => ({
        addColorStop: (at: number, c: string) => stops.push([at, c]),
      }),
      fillRect: () => {},
    } as unknown as CanvasRenderingContext2D);
    vi.spyOn(HTMLCanvasElement.prototype, 'toDataURL').mockReturnValue('data:image/png;base64,AA');

    const { container } = render(<Veil ramp={RAMP} />);

    const img = container.querySelector('img');
    expect(img?.getAttribute('src')).toBe('data:image/png;base64,AA');
    expect(img?.getAttribute('aria-hidden')).toBe('true');
    expect(stops).toEqual([
      [0, 'rgb(1, 2, 3)'],
      [1, 'transparent'],
    ]);
  });

  it('paints the ramp as CSS where it cannot draw one', () => {
    const { container } = render(<Veil ramp="radial-gradient(black, white)" />);
    expect(container.querySelector('img')).toBeNull();
    expect(container.firstElementChild).not.toBeNull();
  });
});
