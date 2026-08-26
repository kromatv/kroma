// @vitest-environment jsdom

import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { CategoryTile } from './category-tile';

afterEach(cleanup);

describe('<CategoryTile>', () => {
  it('names itself by its label, whatever else it draws', () => {
    render(<CategoryTile label="Horreur" meta="144 titres" />);
    expect(screen.getByLabelText('Horreur')).toBeTruthy();
    expect(screen.getByText('144 titres')).toBeTruthy();
  });

  it('draws a glyph beside the label when it is given one', () => {
    const { container } = render(<CategoryTile label="Horreur" icon="ghost" />);
    expect(container.querySelectorAll('svg')).toHaveLength(1);
  });

  it('draws none where the genre has no glyph to draw', () => {
    const { container } = render(<CategoryTile label="Horreur" />);
    expect(container.querySelectorAll('svg')).toHaveLength(0);
  });
});
