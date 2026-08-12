// @vitest-environment jsdom

import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { AlphabetRail } from './alphabet-rail';
import { PAD, ROW_W } from './alphabet-rail-context';
import { Bubble, Lens, lensFor } from './alphabet-rail-lens';

type LensBox = ReturnType<typeof lensFor>;

const ROW_H = 24;

function lens(box: LensBox | null, chase = false) {
  const { container, rerender } = render(<Lens box={box} chase={chase} />);
  return {
    container,
    node: container.firstElementChild as HTMLElement,
    move: (next: LensBox | null) => rerender(<Lens box={next} chase={chase} />),
  };
}

function travelMs(chase: boolean) {
  const view = lens(lensFor([0, 0], ROW_H), chase);
  view.move(lensFor([4, 4], ROW_H));
  return Number.parseFloat(view.node.style.transitionDuration);
}

describe('lensFor', () => {
  it('tightens to a circle over a single letter, centred in the rail', () => {
    const box = lensFor([2, 2], ROW_H);
    expect(box.width).toBe(box.height);
    expect(box.x).toBe(PAD + (ROW_W - box.width) / 2);
    expect(box.y).toBe(PAD + 2 * ROW_H);
  });

  it('fills the rail as a stadium over a stretch of letters', () => {
    const box = lensFor([1, 4], ROW_H);
    expect(box.height).toBe(4 * ROW_H);
    expect(box.width).toBe(ROW_W);
    expect(box.x).toBe(PAD);
  });
});

describe('the lens on the web', () => {
  it('takes its first box without travelling to it', () => {
    const { node } = lens(lensFor([0, 0], ROW_H));
    expect(node.style.transitionProperty).toBe('opacity');
    expect(node.style.opacity).toBe('1');
  });

  it('travels to every box after that', () => {
    const { node, move } = lens(lensFor([0, 0], ROW_H));
    const next = lensFor([3, 5], ROW_H);
    move(next);
    expect(node.style.transitionProperty).toBe('left, top, width, height, opacity');
    expect(node.style.top).toBe(`${next.y}px`);
    expect(node.style.height).toBe(`${next.height}px`);
  });

  it('keeps up with a scrubbing finger by shortening the travel', () => {
    expect(travelMs(true)).toBeLessThan(travelMs(false));
  });

  it('fades where it stands when the host reports no range', () => {
    const placed = lensFor([1, 2], ROW_H);
    const { node, move } = lens(placed);
    move(null);
    expect(node.style.opacity).toBe('0');
    expect(node.style.top).toBe(`${placed.y}px`);
    expect(node.style.height).toBe(`${placed.height}px`);
  });

  it('draws nothing at all until a range arrives', () => {
    expect(lens(null).container.innerHTML).toBe('');
  });
});

describe('the bubble', () => {
  it('sits centred on the row it names and clear of the rail', () => {
    const { container } = render(<Bubble letter="B" y={120} />);
    const node = container.firstElementChild as HTMLElement;
    const px = (value: string) => Number.parseFloat(value);
    expect(node.style.top).toBe(`${120 - px(node.style.height) / 2}px`);
    expect(px(node.style.right)).toBeGreaterThan(ROW_W + PAD * 2);
  });

  it('echoes the letter under a scrubbing finger, and goes when the finger lifts', () => {
    const { container } = render(
      <AlphabetRail.Root
        letters={['#', 'A', 'B', 'C']}
        available={new Set(['A', 'C'])}
        onJump={vi.fn()}
        label="Alphabet"
      />,
    );
    const rail = container.firstElementChild as HTMLElement;
    rail.setPointerCapture = vi.fn();

    fireEvent.pointerDown(rail, { clientY: 1000, buttons: 1, pointerId: 7 });
    expect(screen.getAllByText('C')).toHaveLength(2);

    fireEvent.pointerUp(rail, { pointerId: 7 });
    expect(screen.getAllByText('C')).toHaveLength(1);
  });
});
