// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { AlphabetRail } from './alphabet-rail';

afterEach(cleanup);

const LETTERS = ['#', 'A', 'B', 'C'];
const AVAILABLE = new Set(['A', 'C']);

function rail(onJump = vi.fn(), range?: { first: string; last: string }) {
  render(
    <AlphabetRail.Root
      letters={LETTERS}
      available={AVAILABLE}
      range={range}
      onJump={onJump}
      label="Alphabet"
      letterLabel={(letter) => `Jump to ${letter}`}
    />,
  );
  return onJump;
}

describe('AlphabetRail parts', () => {
  it('is a namespace of parts, not a component', () => {
    expect(typeof AlphabetRail).toBe('object');
    expect(Object.keys(AlphabetRail).sort()).toEqual(['Item', 'Root']);
  });

  it('renders the same rail from the sugar and from the items', () => {
    const { container: sugar } = render(
      <AlphabetRail.Root
        letters={LETTERS}
        available={AVAILABLE}
        range={{ first: 'A', last: 'B' }}
        onJump={vi.fn()}
        label="Alphabet"
        letterLabel={(letter) => `Jump to ${letter}`}
      />,
    );
    const written = sugar.innerHTML;

    cleanup();
    const { container: parts } = render(
      <AlphabetRail.Root label="Alphabet" range={{ first: 'A', last: 'B' }} onJump={vi.fn()}>
        {LETTERS.map((letter) => (
          <AlphabetRail.Item
            key={letter}
            value={letter}
            disabled={!AVAILABLE.has(letter)}
            label={`Jump to ${letter}`}
          />
        ))}
      </AlphabetRail.Root>,
    );
    expect(parts.innerHTML).toBe(written);
  });

  it('refuses a letter written outside a rail', () => {
    expect(() => render(<AlphabetRail.Item value="A" />)).toThrow(
      '<AlphabetRail.Item> must be used inside <AlphabetRail.Root>',
    );
  });

  it('names a letter after itself when the host gives no name', () => {
    render(
      <AlphabetRail.Root label="Alphabet" onJump={vi.fn()}>
        <AlphabetRail.Item value="A" />
      </AlphabetRail.Root>,
    );
    expect(screen.getByLabelText('A')).toBeTruthy();
  });
});

describe('AlphabetRail', () => {
  it('renders every letter, but only present ones as buttons', () => {
    rail();
    expect(screen.getByText('#')).toBeTruthy();
    expect(screen.getByText('B')).toBeTruthy();
    expect(screen.getByLabelText('Jump to A')).toBeTruthy();
    expect(screen.getByLabelText('Jump to C')).toBeTruthy();
    expect(screen.queryByLabelText('Jump to B')).toBeNull();
    expect(screen.queryByLabelText('Jump to #')).toBeNull();
  });

  it('is one focus stop per PRESENT letter and none for the rail', () => {
    // A dimmed bucket is a face, not a control: the remote must not stop on a
    // letter that cannot take it anywhere.
    const { container } = render(
      <AlphabetRail.Root label="Alphabet" onJump={vi.fn()}>
        {LETTERS.map((letter) => (
          <AlphabetRail.Item key={letter} value={letter} disabled={!AVAILABLE.has(letter)} />
        ))}
      </AlphabetRail.Root>,
    );
    expect(container.querySelectorAll('[tabindex]')).toHaveLength(AVAILABLE.size);
  });

  it('reports a jump when a present letter is pressed', () => {
    const onJump = rail();
    fireEvent.click(screen.getByLabelText('Jump to C'));
    expect(onJump).toHaveBeenCalledWith('C');
  });

  it('accepts a range without a matching letter without crashing', () => {
    rail(vi.fn(), { first: 'Z', last: 'Z' });
    expect(screen.getByLabelText('Alphabet')).toBeTruthy();
  });

  it('lights the letters the lens covers and dims the rest', () => {
    const ink = (letter: string) => {
      const node = Array.from(document.querySelectorAll('div')).find(
        (el) => el.textContent === letter,
      );
      return getComputedStyle(node as HTMLElement).color;
    };
    rail(vi.fn(), { first: 'A', last: 'A' });
    expect(ink('A')).not.toBe(ink('C'));
  });
});
