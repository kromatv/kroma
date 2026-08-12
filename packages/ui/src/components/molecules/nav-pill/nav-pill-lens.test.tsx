// @vitest-environment jsdom

import { render } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import type { LensRect } from './nav-pill-context';
import { Lens } from './nav-pill-lens';

const HOME: LensRect = { x: 8, y: 4, width: 96, height: 44 };
const SEARCH: LensRect = { x: 128, y: 4, width: 120, height: 44 };

function lens(rect: LensRect | null, chase = false) {
  const { container, rerender } = render(<Lens rect={rect} chase={chase} />);
  return {
    container,
    node: container.firstElementChild as HTMLElement,
    move: (next: LensRect | null) => rerender(<Lens rect={next} chase={chase} />),
  };
}

function travelMs(chase: boolean) {
  const view = lens(HOME, chase);
  view.move(SEARCH);
  return Number.parseFloat(view.node.style.transitionDuration);
}

describe('the lens on the web', () => {
  it('rides a transform rather than a left, and asks for the layer up front', () => {
    const { node } = lens(HOME);
    expect(node.style.left).toBe('0px');
    expect(node.style.transform).toBe(`translateX(${HOME.x}px)`);
    expect(node.style.willChange).toBe('transform');
  });

  it('sits on the row the item measured', () => {
    const { node } = lens(HOME);
    expect(node.style.top).toBe(`${HOME.y}px`);
    expect(node.style.height).toBe(`${HOME.height}px`);
  });

  it('takes its first rect without travelling to it', () => {
    const { node } = lens(HOME);
    expect(node.style.transitionProperty).toBe('opacity');
    expect(node.style.opacity).toBe('1');
  });

  it('travels to every rect after that, laying the width out rather than scaling it', () => {
    const { node, move } = lens(HOME);
    move(SEARCH);
    expect(node.style.transitionProperty).toBe('transform, width, opacity');
    expect(node.style.transform).toBe(`translateX(${SEARCH.x}px)`);
    expect(node.style.width).toBe(`${SEARCH.width}px`);
  });

  it('keeps up with a sliding finger by shortening the travel', () => {
    expect(travelMs(true)).toBeLessThan(travelMs(false));
  });

  it('fades where it stands when no item owns it', () => {
    const { node, move } = lens(HOME);
    move(null);
    expect(node.style.opacity).toBe('0');
    expect(node.style.transform).toBe(`translateX(${HOME.x}px)`);
  });

  it('draws nothing at all until an item claims it', () => {
    expect(lens(null).container.innerHTML).toBe('');
  });
});
