// @vitest-environment jsdom
import { onScreen } from '@kromatv/ui/testing';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { RankedTile } from '#tv/features/catalog/home/ranked-tile.component';

afterEach(cleanup);

const TINT: [string, string] = ['teal', 'navy'];

describe('RankedTile', () => {
  it('draws its rank as a numeral beside the poster and names it', () => {
    render(onScreen(<RankedTile rank={3} title="Dune" art="art:dune" tint={TINT} />));

    const numeral = screen.getByLabelText('Number 3');

    expect(numeral.getAttribute('role')).toBe('img');
    expect(numeral.querySelector('path')).toBeTruthy();
  });

  it('opens its title from the poster, the one control in the cell', () => {
    const onPress = vi.fn();
    render(
      onScreen(<RankedTile rank={10} title="Dune" art="art:dune" tint={TINT} onPress={onPress} />),
    );

    fireEvent.click(screen.getByRole('button', { name: 'Dune' }));

    expect(screen.getAllByRole('button')).toHaveLength(1);
    expect(onPress).toHaveBeenCalledTimes(1);
  });
});
