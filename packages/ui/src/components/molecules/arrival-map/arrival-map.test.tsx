// @vitest-environment jsdom
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import { AccessibilityInfo } from 'react-native';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { declared } from '#ui/testing';
import { ArrivalMap } from './arrival-map';

beforeEach(() => {
  vi.spyOn(AccessibilityInfo, 'isReduceMotionEnabled').mockReturnValue(new Promise(() => {}));
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

function blocks(container: HTMLElement): HTMLElement[] {
  return [...container.querySelectorAll('div')].filter(
    (node) => getComputedStyle(node).width === '9px',
  );
}

const ringed = (node: HTMLElement) => declared(node, 'border-top-width') === '2px';
const breathing = (node: HTMLElement) => declared(node, 'animation-name') !== null;

describe('<ArrivalMap>', () => {
  it('draws one block per slice, in the order the file counts them', () => {
    const { container } = render(<ArrivalMap slices={[100, 100, 40, 0, 0, 0]} />);

    expect(blocks(container)).toHaveLength(6);
  });

  it('tells a slice that is whole from one still coming and one untouched', () => {
    const { container } = render(<ArrivalMap slices={[100, 40, 0]} />);

    const paint = blocks(container).map((node) => getComputedStyle(node).backgroundColor);

    expect(new Set(paint).size).toBe(3);
  });

  it('draws nothing at all before the server has counted a slice', () => {
    const { container } = render(<ArrivalMap slices={[]} label="Morceaux reçus" />);

    expect(container.textContent).toBe('');
    expect(blocks(container)).toHaveLength(0);
  });

  it('names itself only when it was given a name', () => {
    render(<ArrivalMap slices={[100]} label="Morceaux reçus" />);

    expect(screen.getByText('Morceaux reçus')).toBeTruthy();
  });
});

describe('the slices being fetched right now', () => {
  it('rings a slice on its way, which no other state wears', () => {
    const { container } = render(<ArrivalMap slices={[100, 40, 0, 0]} arriving={[3]} />);

    expect(blocks(container).map(ringed)).toEqual([false, false, false, true]);
  });

  it('breathes those slices and leaves every other one still', () => {
    const { container } = render(<ArrivalMap slices={[100, 40, 0, 0]} arriving={[2, 3]} />);

    expect(blocks(container).map(breathing)).toEqual([false, false, true, true]);
  });

  it('draws a slice that is whole as whole, even while it is still asked for', () => {
    const { container } = render(<ArrivalMap slices={[100, 0]} arriving={[0]} />);

    expect(blocks(container).map(ringed)).toEqual([false, false]);
    expect(blocks(container).map(breathing)).toEqual([false, false]);
  });

  it('ignores an index past the end of the file', () => {
    const { container } = render(<ArrivalMap slices={[0, 0]} arriving={[5]} />);

    expect(blocks(container).map(ringed)).toEqual([false, false]);
  });

  it('holds them still for a viewer who asked for less motion, and keeps the ring', async () => {
    vi.spyOn(AccessibilityInfo, 'isReduceMotionEnabled').mockResolvedValue(true);

    const { container } = render(<ArrivalMap slices={[0, 0]} arriving={[1]} />);
    const [, live] = blocks(container);

    await waitFor(() => expect(breathing(live as HTMLElement)).toBe(false));
    expect(ringed(live as HTMLElement)).toBe(true);
  });
});
