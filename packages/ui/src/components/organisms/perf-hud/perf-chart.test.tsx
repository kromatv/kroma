// @vitest-environment jsdom
import { cleanup, render } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { colors } from '#ui/core';
import { PerfChart } from './perf-chart';

afterEach(cleanup);

const BUDGET = 1000 / 60;

// The two rules are drawn first and carry no height of their own, so the bars
// are everything after them.
const bars = (container: HTMLElement): HTMLElement[] =>
  [...container.querySelectorAll('div')].filter((el) => el.style.backgroundColor !== '');

const colourOf = (el: HTMLElement) => el.style.backgroundColor;
const rgb = (hex: string) => {
  const n = Number.parseInt(hex.slice(1), 16);
  return `rgb(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255})`;
};

describe('PerfChart', () => {
  it('draws one bar per frame, newest last', () => {
    const { container } = render(<PerfChart frames={[8, 9, 10]} />);
    expect(bars(container)).toHaveLength(3);
  });

  it('keeps only the most recent frames, so the window cannot grow without bound', () => {
    const { container } = render(<PerfChart frames={Array.from({ length: 400 }, () => 8)} />);
    expect(bars(container).length).toBeLessThanOrEqual(48);
  });

  it('grades a frame by the budget it missed', () => {
    const { container } = render(<PerfChart frames={[BUDGET / 2, BUDGET * 1.5, BUDGET * 3]} />);
    const [good, late, janky] = bars(container);
    expect(colourOf(good as HTMLElement)).toBe(rgb(colors.success));
    expect(colourOf(late as HTMLElement)).toBe(rgb(colors.accent));
    expect(colourOf(janky as HTMLElement)).toBe(rgb(colors.danger));
  });

  it('clamps a stall so one bad frame does not flatten the rest of the chart', () => {
    const { container } = render(<PerfChart frames={[8, 4000]} />);
    const [ordinary, stall] = bars(container);
    const tall = Number.parseFloat((stall as HTMLElement).style.height);
    expect(tall).toBeLessThanOrEqual(34);
    // The ordinary frame still has a bar to see, which is the point of clamping.
    expect(Number.parseFloat((ordinary as HTMLElement).style.height)).toBeGreaterThan(0);
  });

  it('renders nothing to chart before the first frame is sampled', () => {
    const { container } = render(<PerfChart frames={[]} />);
    expect(bars(container)).toHaveLength(0);
  });
});
