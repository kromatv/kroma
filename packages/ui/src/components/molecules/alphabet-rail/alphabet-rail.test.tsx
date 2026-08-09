// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { AlphabetRail } from './alphabet-rail';

afterEach(cleanup);

const LETTERS = ['#', 'A', 'B', 'C'];

function rail(onJump = vi.fn(), range?: { first: string; last: string }) {
  render(
    <AlphabetRail
      letters={LETTERS}
      available={new Set(['A', 'C'])}
      range={range}
      onJump={onJump}
      label="Alphabet"
      letterLabel={(letter) => `Jump to ${letter}`}
    />,
  );
  return onJump;
}

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

  it('reports a jump when a present letter is pressed', () => {
    const onJump = rail();
    fireEvent.click(screen.getByLabelText('Jump to C'));
    expect(onJump).toHaveBeenCalledWith('C');
  });

  it('accepts a range without a matching letter without crashing', () => {
    rail(vi.fn(), { first: 'Z', last: 'Z' });
    expect(screen.getByLabelText('Alphabet')).toBeTruthy();
  });
});
