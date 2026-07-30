// @vitest-environment jsdom
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { Txt } from '#ui/components/atoms/text';
import { onScreen } from '#ui/testing';
import { Rail } from './rail';

// More children than one chunk (RAIL_CHUNK = 8).
const CHIPS = Array.from({ length: 14 }, (_, at) => `Chip ${at + 1}`).map((label) => (
  <Txt key={label}>{label}</Txt>
));

describe('<Rail> mounting', () => {
  it('grows from one chunk by default, so a long row costs a screenful', () => {
    render(onScreen(<Rail>{CHIPS}</Rail>));
    // getAllByText, not getByText: react-native-web renders a Txt as nested
    // nodes that each carry the string.
    expect(screen.getAllByText('Chip 8').length).toBeGreaterThan(0);
    expect(screen.queryAllByText('Chip 9')).toHaveLength(0);
  });

  it('mounts every child under grow={false}, for a strip of controls', () => {
    // The browse screens' sort + genre filters are one Rail: growing it would
    // open the strip on its first eight chips and read as missing filters.
    render(onScreen(<Rail grow={false}>{CHIPS}</Rail>));
    for (const at of [1, 8, 9, 14]) {
      expect(screen.getAllByText(`Chip ${at}`).length).toBeGreaterThan(0);
    }
  });
});
