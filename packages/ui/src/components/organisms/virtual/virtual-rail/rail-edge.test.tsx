// @vitest-environment jsdom

import { cleanup, render } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { edgeWidth, RailEdge } from './rail-edge';

afterEach(cleanup);

const FADE_PX = 200;
const BLEED_PX = 32;

function strip(side: 'start' | 'end', shown = true): HTMLElement {
  const { container } = render(
    <RailEdge side={side} shown={shown} arrow={false} onPress={vi.fn()} width={FADE_PX} />,
  );
  return container.firstElementChild as HTMLElement;
}

function stops(css: string): (readonly [number, number])[] {
  return [...css.matchAll(/rgba?\(10, 10, 12(?:, ([\d.]+))?\) (\d+)px/g)].map(
    ([, alpha, at]) => [alpha === undefined ? 1 : Number(alpha), Number(at)] as const,
  );
}

describe('a rail edge', () => {
  it('covers the row with the page ground rather than masking it away', () => {
    const edge = strip('start');

    expect(edge.style.maskImage).toBe('');
    expect(edge.style.backgroundImage).toContain('linear-gradient(to right');
  });

  it('runs its fade from the far end at the other side of the row', () => {
    const edge = strip('end');

    expect(edge.style.backgroundImage).toContain('linear-gradient(to left');
  });

  it('holds the ground solid across the bleed, then clears over the fade', () => {
    const edge = strip('start');

    const curve = stops(edge.style.backgroundImage);

    expect(curve.filter(([, at]) => at <= BLEED_PX).every(([alpha]) => alpha === 1)).toBe(true);
    expect(curve.at(-1)).toEqual([0, BLEED_PX + FADE_PX]);
  });

  it('thins monotonically, so the row never comes back through a band', () => {
    const edge = strip('start');

    const curve = stops(edge.style.backgroundImage);

    for (let at = 1; at < curve.length; at++) {
      const [alpha, position] = curve[at] ?? [0, 0];
      const [before, previous] = curve[at - 1] ?? [0, 0];
      expect(alpha).toBeLessThanOrEqual(before);
      expect(position).toBeGreaterThanOrEqual(previous);
    }
  });

  it('hides an end that cannot scroll instead of half-fading it', () => {
    const resting = strip('start', false);
    const scrollable = strip('start');

    expect(resting.style.opacity).toBe('0');
    expect(scrollable.style.opacity).toBe('1');
  });
});

describe('edgeWidth', () => {
  it('is a fraction of the row, so one number is not wrong at both sizes', () => {
    expect(edgeWidth(1920)).toBe(288);
    expect(edgeWidth(560)).toBe(88);
    // The share, not a constant: a wider row gets a wider fade.
    expect(edgeWidth(1200)).toBeGreaterThan(edgeWidth(700));
  });

  it('never gets too thin to read as a fade, nor wide enough to eat the row', () => {
    expect(edgeWidth(200)).toBe(88);
    expect(edgeWidth(0)).toBe(88);
    expect(edgeWidth(4000)).toBe(300);
    // And never more than a fifth of the row it is fading.
    for (const row of [560, 700, 1000, 1400, 1920]) {
      expect(edgeWidth(row) / row).toBeLessThan(0.2);
    }
  });
});
