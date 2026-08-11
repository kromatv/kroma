// @vitest-environment jsdom
//
// The web half of the pair, where the whole point is WHICH property carries the
// motion: a transitioned inset and dash offset, and a compiled keyframe for the
// indeterminate sweep, never a per-frame JS write.

import { cleanup, render } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { Progress } from '#ui/components/atoms/progress';
import { ProgressRing } from '#ui/components/atoms/progress-ring';
import { ProgressFill } from './progress-motion';
import { ringGeometry } from './ring';

afterEach(cleanup);

function only(container: HTMLElement, selector: string): HTMLElement & SVGElement {
  const el = container.querySelector(selector);
  if (!el) throw new Error(`no ${selector} was rendered`);
  return el as HTMLElement & SVGElement;
}

const barIn = (container: HTMLElement) => only(container, '[role=progressbar] > div');
// The track is drawn first, the arc over it.
const arcIn = (container: HTMLElement) => only(container, 'circle + circle');

describe('ProgressFill', () => {
  it('insets the trailing edge to the value, and transitions that inset', () => {
    const { container } = render(<ProgressFill value={0.25} style={null} />);
    const fill = only(container, 'div');
    expect(fill.style.right).toBe('75%');
    expect(fill.style.transitionProperty).toBe('right');
  });

  it('reaches the far edge at 1 and shows nothing at 0', () => {
    const { container: full } = render(<ProgressFill value={1} style={null} />);
    expect(only(full, 'div').style.right).toBe('0%');
    const { container: empty } = render(<ProgressFill value={0} style={null} />);
    expect(only(empty, 'div').style.right).toBe('100%');
  });
});

describe('the ring', () => {
  it('transitions the dash offset the value drives', () => {
    const { container } = render(<ProgressRing value={0.5} />);
    const arc = arcIn(container);
    expect(arc.style.transition).toContain('stroke-dashoffset');
    expect(arc.getAttribute('stroke-dashoffset')).toBe(
      String(ringGeometry({ value: 0.5 }).dashOffset),
    );
  });

  it('spins a fixed arc when indeterminate, rather than one stuck at zero', () => {
    const { container } = render(<ProgressRing indeterminate />);
    const arc = arcIn(container);
    const { circumference, dashOffset } = ringGeometry({ value: 0.25 });
    expect(arc.getAttribute('stroke-dashoffset')).toBe(String(dashOffset));
    expect(dashOffset).toBeLessThan(circumference);
    expect(only(container, 'div').className).toMatch(/r-animationKeyframes-/);
  });
});

describe('the bar', () => {
  it('keeps a determinate fill pinned to the track left edge', () => {
    const bar = barIn(render(<Progress value={0.42} />).container);
    expect(getComputedStyle(bar).left).toBe('0px');
    expect(Number.parseFloat(bar.style.right)).toBeCloseTo(58);
  });

  it('sweeps a segment of its own width when indeterminate', () => {
    const bar = barIn(render(<Progress indeterminate />).container);
    // The keyframes and the segment's width are compiled rules, so they arrive
    // as classes; only the duration is written inline.
    expect(bar.className).toMatch(/r-animationKeyframes-/);
    expect(bar.className).toMatch(/r-width-/);
    expect(bar.style.animationDuration).toBe('1200ms');
    expect(bar.style.right).toBe('');
  });
});
