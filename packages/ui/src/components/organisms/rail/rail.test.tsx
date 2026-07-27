// @vitest-environment jsdom
//
// What a rail MOUNTS, which is a navigation question rather than a visual one: a
// tile that is not mounted is a tile the remote cannot reach and the eye cannot
// see.
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { Txt } from '#ui/components/atoms/text';
import { onScreen } from '#ui/testing';
import { Rail } from './rail';

/** More children than one chunk (RAIL_CHUNK = 8), so the growing window and the
 * whole strip are visibly different lists. */
const CHIPS = Array.from({ length: 14 }, (_, at) => `Chip ${at + 1}`).map((label) => (
  <Txt key={label}>{label}</Txt>
));

describe('<Rail> mounting', () => {
  it('grows from one chunk by default, so a long row costs a screenful', () => {
    render(onScreen(<Rail>{CHIPS}</Rail>));
    // getAllByText, not getByText: react-native-web renders a Txt as nested
    // nodes that each carry the string.
    expect(screen.getAllByText('Chip 8').length).toBeGreaterThan(0);
    // The ninth is past the first chunk: it arrives when focus walks near the end.
    expect(screen.queryAllByText('Chip 9')).toHaveLength(0);
  });

  it('mounts every child under grow={false}, for a strip of controls', () => {
    // The browse screens' sort + genre filters are one Rail. Growing them opened
    // the strip on its first eight children - four sort chips, a divider, "all
    // genres" and TWO genres - with the rest appearing only once focus had
    // walked to the end, which for a filter bar reads as missing filters.
    render(onScreen(<Rail grow={false}>{CHIPS}</Rail>));
    for (const at of [1, 8, 9, 14]) {
      expect(screen.getAllByText(`Chip ${at}`).length).toBeGreaterThan(0);
    }
  });
});
